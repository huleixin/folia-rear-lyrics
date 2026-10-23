import type { SongResult } from '../types';
import type { VideoExportPreset } from '../types/videoExport';

// src/services/electronVideoExport.ts
// Low-level Electron/Chromium recording helpers used by the player export hook.
const EXPORT_FRAME_RATE = 60;
const EXPORT_AUDIO_BITS_PER_SECOND = 320_000;
// Headroom above the preset for the capture size cap. Window content lands a pixel or two off
// the preset under fractional DPRs; with headroom those frames arrive at native size and get
// cropped 1:1 instead of being resampled down and back up. Small enough that Chromium's
// capture scale override (quantized to 0.25 steps) stays at 1x.
const CAPTURE_SIZE_HEADROOM_PX = 16;
const VIDEO_EXPORT_FILE_EXTENSIONS = ['mp4', 'webm'] as const;

export type VideoExportFileExtension = typeof VIDEO_EXPORT_FILE_EXTENSIONS[number];

export type VideoExportFormat = {
    mimeType: string;
    extension: VideoExportFileExtension;
    displayName: string;
};

const getVideoBitsPerSecond = (preset: VideoExportPreset) => {
    const pixelCount = preset.width * preset.height;

    if (pixelCount >= 3_600_000) {
        return 50_000_000;
    }

    if (pixelCount >= 1_900_000) {
        return 28_000_000;
    }

    return 14_000_000;
};

export const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

// Resizing the window is asynchronous and can race a just-finished restore, so poll until the
// viewport's physical size reaches the preset (within a few pixels) instead of a fixed delay.
// Returns whether it got there; capture starts either way and the frame pipeline scales any
// remaining mismatch.
export const waitForExportViewport = async (preset: VideoExportPreset, timeoutMs = 1500) => {
    const tolerance = 4;
    const deadline = performance.now() + timeoutMs;
    for (;;) {
        const dpr = window.devicePixelRatio || 1;
        const physicalWidth = Math.round(window.innerWidth * dpr);
        const physicalHeight = Math.round(window.innerHeight * dpr);
        if (
            Math.abs(physicalWidth - preset.width) <= tolerance
            && Math.abs(physicalHeight - preset.height) <= tolerance
        ) {
            return true;
        }
        if (performance.now() >= deadline) {
            console.warn(
                `[VideoExport] viewport ${physicalWidth}x${physicalHeight} did not reach ` +
                `${preset.width}x${preset.height} within ${timeoutMs}ms`,
            );
            return false;
        }
        await wait(50);
    }
};

export const buildDefaultVideoExportFileName = (
    song: SongResult,
    preset: VideoExportPreset,
    extension: VideoExportFileExtension,
) => {
    const title = song.name?.trim() || 'folia-export';
    return `${title}-${preset.width}x${preset.height}.${extension}`;
};

export const getSupportedVideoExportFormat = (): VideoExportFormat | null => {
    const candidates: VideoExportFormat[] = [
        {
            mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            extension: 'mp4',
            displayName: 'MP4 Video',
        },
        {
            mimeType: 'video/mp4;codecs=avc1,mp4a.40.2',
            extension: 'mp4',
            displayName: 'MP4 Video',
        },
        {
            mimeType: 'video/mp4',
            extension: 'mp4',
            displayName: 'MP4 Video',
        },
        {
            mimeType: 'video/webm;codecs=vp8,opus',
            extension: 'webm',
            displayName: 'WebM Video',
        },
        {
            mimeType: 'video/webm;codecs=vp9,opus',
            extension: 'webm',
            displayName: 'WebM Video',
        },
        {
            mimeType: 'video/webm',
            extension: 'webm',
            displayName: 'WebM Video',
        },
    ];

    return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate.mimeType)) ?? null;
};

export const getVideoExportRecorderOptions = (preset: VideoExportPreset, format: VideoExportFormat): MediaRecorderOptions => ({
    mimeType: format.mimeType,
    audioBitsPerSecond: EXPORT_AUDIO_BITS_PER_SECOND,
    videoBitsPerSecond: getVideoBitsPerSecond(preset),
});

export const stopMediaStream = (stream: MediaStream | null) => {
    stream?.getTracks().forEach(track => track.stop());
};

// Forces the captured player document to stop painting cursor shapes during export.
export const installVideoExportCursorGuard = () => {
    const style = document.createElement('style');
    style.dataset.foliaVideoExportCursorGuard = 'true';
    style.textContent = 'html, body, body * { cursor: none !important; }';
    document.head.appendChild(style);

    return () => {
        style.remove();
    };
};

export const getAudioElementCaptureStream = (audioElement: HTMLAudioElement) => {
    const capturableAudio = audioElement as HTMLAudioElement & {
        captureStream?: () => MediaStream;
        mozCaptureStream?: () => MediaStream;
    };
    const stream = capturableAudio.captureStream?.() ?? capturableAudio.mozCaptureStream?.();

    if (!stream || stream.getAudioTracks().length === 0) {
        throw new Error('Current audio element cannot provide a recording track.');
    }

    return stream;
};

// Captures the player's own webContents (granted by the main process's display media handler
// while an export is prepared). width/height are capped near the preset: Chromium raises the
// captured page's device scale factor when the requested size exceeds the view, so leaving
// them open would re-render the player at up to 2x for nothing. The window is already sized
// to the preset; only the cap matters, so no `ideal` that could pull frames below native size.
export const getMainWindowVideoCaptureStream = async (preset: VideoExportPreset) => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Display capture is not available in this window.');
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
            frameRate: { ideal: EXPORT_FRAME_RATE, max: EXPORT_FRAME_RATE },
            width: { max: preset.width + CAPTURE_SIZE_HEADROOM_PX },
            height: { max: preset.height + CAPTURE_SIZE_HEADROOM_PX },
        },
    });

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
        const settings = videoTrack.getSettings();
        console.log(
            `[VideoExport] self capture -> ${settings.width}x${settings.height}@${settings.frameRate} ` +
            `(preset=${preset.width}x${preset.height}, dpr=${window.devicePixelRatio})`,
        );
    }

    return stream;
};
