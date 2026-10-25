import type { Line, PendoloTuning, SubtitleContentMode, Theme } from '../../../types';
import type { RearRect } from '../../../utils/rearCameraSafeArea';
import { resolveThemeFontWeight } from '../../../utils/fontStacks';
import { resolveClockworkReach } from './pendoloClockworkScene';
import { buildPendoloTextLayout } from './pendoloTextLayout';
import {
    buildPendoloSubtitleFontSpec,
    resolvePendoloSubtitleTracks,
    sumPendoloSubtitleTrackHeights,
} from './pendoloSubtitleTracks';

// src/components/visualizer/pendolo/pendoloRearLayout.ts
// The clockwork uses the physical panel; only the sung text uses the camera-safe reading box.
export function resolvePendoloRearLayout(width: number, height: number, safe: RearRect, tuning: PendoloTuning) {
    const padding = Math.max(3, width * 0.015);
    const centerX = Math.min(width / 2, safe.left + padding);
    const centerY = height / 2;
    const reachLimit = Math.max(1, Math.min(centerX, width - centerX, centerY) - padding);
    const reachPadding = resolveClockworkReach(0, tuning.showCenterGradient ?? true);
    const reachFactor = resolveClockworkReach(1, tuning.showCenterGradient ?? true) - reachPadding;
    const baseRadius = Math.max(
        1,
        Math.min(Math.min(width, height) * tuning.arcRadius, (reachLimit - reachPadding) / reachFactor)
    );
    const lyricRadiusOffset = Math.min(width, height) * 0.06;
    const lyricX = centerX + baseRadius + lyricRadiusOffset;
    return {
        centerX,
        centerY,
        baseRadius,
        lyricRadiusOffset,
        lyricX,
        textWidth: Math.max(1, safe.left + safe.width - lyricX - padding),
        maxTextHeight: safe.height * 0.82,
        fontPx: Math.min(28, height * 0.092),
        subtitleScale: Math.min(1, height / 326),
        tuning: {
            ...tuning,
            wheelCenterX: centerX / width,
            wheelCenterY: centerY / height,
            arcRadius: baseRadius / Math.min(width, height),
        },
    };
}

interface LineOptions {
    line: Line;
    layout: ReturnType<typeof resolvePendoloRearLayout>;
    activeScale: number;
    lyricsFontScale: number;
    subtitleFontScale: number;
    mode: SubtitleContentMode;
    hidden: boolean;
    fontFamily: string;
    fontWeight: number;
    subtitleFontFamily: string;
    subtitleTheme: Theme;
}

/** Measure only on lyric/font/viewport changes, never on clockwork animation frames. */
export function measurePendoloRearLine(options: LineOptions) {
    const {
        line,
        layout,
        activeScale,
        lyricsFontScale,
        subtitleFontScale,
        mode,
        hidden,
        fontFamily,
        fontWeight,
        subtitleFontFamily,
        subtitleTheme,
    } = options;
    // Leave room for the largest chorus pulse without masking the right edge.
    const maxWidth = layout.textWidth / (activeScale * 1.06);
    const measure = (factor: number) => {
        const fontPx = Math.max(1, Math.round(layout.fontPx * lyricsFontScale * factor));
        const subtitleScale = subtitleFontScale * layout.subtitleScale * factor;
        const tracks = resolvePendoloSubtitleTracks(line, {
            mode,
            hidden,
            focal: true,
            subtitleFontScale: subtitleScale,
        });
        const main = buildPendoloTextLayout(
            line.fullText,
            `${fontWeight} ${fontPx}px ${fontFamily}`,
            maxWidth,
            Math.round(fontPx * 1.2)
        ).height;
        const subtitles = sumPendoloSubtitleTrackHeights(
            tracks,
            (track) =>
                buildPendoloTextLayout(
                    track.text,
                    buildPendoloSubtitleFontSpec(
                        track,
                        resolveThemeFontWeight(subtitleTheme, track.fontWeightFallback),
                        subtitleFontFamily
                    ),
                    maxWidth * 0.96,
                    track.lineHeightPx
                ).height
        );
        return { fontPx, subtitleScale, maxWidth, height: (main + subtitles) * activeScale * 1.06 };
    };
    let result = measure(1);
    if (result.height <= layout.maxTextHeight) return result;
    let low = 0,
        high = 1;
    for (let step = 0; step < 12; step++) {
        const middle = (low + high) / 2;
        const candidate = measure(middle);
        if (candidate.height <= layout.maxTextHeight) {
            low = middle;
            result = candidate;
        } else high = middle;
    }
    return result;
}
