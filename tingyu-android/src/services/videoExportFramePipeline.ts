import type { VideoExportPreset } from '../types/videoExport';

// src/services/videoExportFramePipeline.ts
// Pins a captured video track to the exact export preset size, frame by frame, without a
// Canvas copy on the hot path. Measured in Electron 43 on a 4K export, a Canvas 2D re-draw fed
// into canvas.captureStream() delivered single-digit fps (and stalled at 1080p), while
// cropping each VideoFrame through `visibleRect` kept pace with the capture.

// Chromium's breakout-box API; not in TypeScript's DOM lib.
type TrackProcessor = { readable: ReadableStream<VideoFrame> };
type TrackGenerator = MediaStreamTrack & { writable: WritableStream<VideoFrame> };
type BreakoutBoxGlobals = {
    MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => TrackProcessor;
    MediaStreamTrackGenerator?: new (init: { kind: 'video' }) => TrackGenerator;
};

export const isVideoExportFramePipelineSupported = () => {
    const globals = globalThis as unknown as BreakoutBoxGlobals;
    return typeof globals.MediaStreamTrackProcessor === 'function'
        && typeof globals.MediaStreamTrackGenerator === 'function'
        && typeof VideoFrame === 'function';
};

// Subsampled formats (I420/NV12) need crop offsets on even coordinates.
const toEvenFloor = (value: number) => Math.max(0, Math.floor(value / 2) * 2);

export type PresetFramePlan =
    | { mode: 'pass' }
    // Zero-copy crop of a frame at least as large as the preset; `rect` is preset-sized.
    | { mode: 'crop'; rect: { x: number; y: number; width: number; height: number } }
    // Smaller frame: `rect` is the centered source region that covers the preset aspect ratio.
    | { mode: 'cover'; rect: { x: number; y: number; width: number; height: number } };

/** Decides how one captured frame of `frameWidth`x`frameHeight` becomes a preset-sized frame. */
export const planPresetFrame = (
    frameWidth: number,
    frameHeight: number,
    preset: Pick<VideoExportPreset, 'width' | 'height'>,
): PresetFramePlan => {
    if (frameWidth === preset.width && frameHeight === preset.height) {
        return { mode: 'pass' };
    }
    if (frameWidth >= preset.width && frameHeight >= preset.height) {
        return {
            mode: 'crop',
            rect: {
                x: toEvenFloor((frameWidth - preset.width) / 2),
                y: toEvenFloor((frameHeight - preset.height) / 2),
                width: preset.width,
                height: preset.height,
            },
        };
    }
    const scale = Math.max(preset.width / frameWidth, preset.height / frameHeight);
    const width = Math.min(frameWidth, preset.width / scale);
    const height = Math.min(frameHeight, preset.height / scale);
    return {
        mode: 'cover',
        rect: { x: (frameWidth - width) / 2, y: (frameHeight - height) / 2, width, height },
    };
};

/**
 * Returns a stream whose video track is exactly preset-sized. Frames at least as large as the
 * preset (the normal case: window content is sized to the preset, give or take a pixel) are
 * center-cropped with zero-copy `visibleRect`. Smaller frames — the first few of a capture,
 * still at the pre-resize window size — are scaled to "cover" on an OffscreenCanvas so the
 * recording never contains black bars or a size change. Audio tracks pass through.
 */
export const createPresetSizedVideoStream = (
    sourceStream: MediaStream,
    preset: VideoExportPreset,
): { stream: MediaStream; cleanup: () => void } => {
    const globals = globalThis as unknown as BreakoutBoxGlobals;
    const sourceTrack = sourceStream.getVideoTracks()[0];
    if (!sourceTrack) {
        throw new Error('[VideoExport] No video track in source stream');
    }
    if (!globals.MediaStreamTrackProcessor || !globals.MediaStreamTrackGenerator) {
        throw new Error('[VideoExport] Frame pipeline is not supported in this runtime');
    }

    const processor = new globals.MediaStreamTrackProcessor({ track: sourceTrack });
    const generator = new globals.MediaStreamTrackGenerator({ kind: 'video' });
    const abortController = new AbortController();

    let fallbackCanvas: OffscreenCanvas | null = null;
    let fallbackContext: OffscreenCanvasRenderingContext2D | null = null;
    let lastModeKey = '';

    // Logs once per distinct (size, mode) so a size change mid-capture stays visible.
    const logMode = (frame: VideoFrame, mode: string) => {
        const key = `${frame.displayWidth}x${frame.displayHeight}:${mode}`;
        if (key === lastModeKey) return;
        lastModeKey = key;
        console.log(`[VideoExport] frame ${frame.displayWidth}x${frame.displayHeight} (${frame.format}) -> ${preset.width}x${preset.height} mode=${mode}`);
    };

    const coverFrame = (frame: VideoFrame) => {
        if (!fallbackCanvas || !fallbackContext) {
            fallbackCanvas = new OffscreenCanvas(preset.width, preset.height);
            fallbackContext = fallbackCanvas.getContext('2d', { alpha: false });
            if (!fallbackContext) {
                throw new Error('[VideoExport] Failed to create 2D context for frame scaling');
            }
            fallbackContext.imageSmoothingQuality = 'high';
        }
        const plan = planPresetFrame(frame.displayWidth, frame.displayHeight, preset);
        // A crop plan lands here only when visibleRect was rejected; its rect still applies.
        const rect = plan.mode === 'pass'
            ? { x: 0, y: 0, width: frame.displayWidth, height: frame.displayHeight }
            : plan.rect;
        fallbackContext.drawImage(frame, rect.x, rect.y, rect.width, rect.height, 0, 0, preset.width, preset.height);
        return new VideoFrame(fallbackCanvas, {
            timestamp: frame.timestamp,
            duration: frame.duration ?? undefined,
        });
    };

    const transform = new TransformStream<VideoFrame, VideoFrame>({
        transform(frame, controller) {
            try {
                const plan = planPresetFrame(frame.displayWidth, frame.displayHeight, preset);
                if (plan.mode === 'pass') {
                    logMode(frame, 'pass');
                    controller.enqueue(frame);
                    return;
                }
                if (plan.mode === 'crop') {
                    try {
                        const cropped = new VideoFrame(frame, { visibleRect: plan.rect });
                        logMode(frame, 'crop');
                        controller.enqueue(cropped);
                        frame.close();
                        return;
                    } catch (error) {
                        // A format whose alignment rules reject the rect falls back to scaling.
                        console.warn('[VideoExport] visibleRect crop failed, scaling instead', error);
                    }
                }
                logMode(frame, 'cover');
                controller.enqueue(coverFrame(frame));
                frame.close();
            } catch (error) {
                frame.close();
                throw error;
            }
        },
    });

    void processor.readable
        .pipeThrough(transform, { signal: abortController.signal })
        .pipeTo(generator.writable, { signal: abortController.signal })
        .catch(error => {
            if (!abortController.signal.aborted) {
                console.error('[VideoExport] Frame pipeline stopped', error);
            }
        });

    const stream = new MediaStream([generator]);
    sourceStream.getAudioTracks().forEach(track => {
        stream.addTrack(track);
    });

    const cleanup = () => {
        abortController.abort();
        // Stop the capture tracks too: they live on sourceStream, out of reach of a
        // stopMediaStream() on the returned stream.
        sourceStream.getTracks().forEach(track => track.stop());
        generator.stop();
        fallbackCanvas = null;
        fallbackContext = null;
    };

    return { stream, cleanup };
};
