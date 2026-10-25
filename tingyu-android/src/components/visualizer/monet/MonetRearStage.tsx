import React, { useMemo, useRef } from 'react';
import { DEFAULT_MONET_TUNING } from '../../../types';
import { useFontsEpoch } from '../../../hooks/useFontsEpoch';
import { getRearSafeInset } from '../../../utils/visualizerSurface';
import { resolveThemeFontStack, resolveThemeFontWeight, resolveThemeTranslationFontStack } from '../../../utils/fontStacks';
import { resolveSubtitleContentMode } from '../../../utils/lyrics/alternateText';
import { SECONDARY_TRACK_FONT_WEIGHT_FALLBACK } from '../../../utils/lyrics/subtitleTrackStyle';
import type { VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import MonetLyricsRail from './MonetLyricsRail';
import MonetFloatingDecor from './MonetFloatingDecor';
import AudioOverlay from './AudioOverlay';
import { clearMonetMeasurementCaches, type MonetVisibleLineEntry } from './monetLyricsModel';
import { resolveMonetRearTypography } from './monetRearLayout';

// src/components/visualizer/monet/MonetRearStage.tsx
// Keep the artwork full-panel while the measured lyric rail reads beside the cameras.
export default function MonetRearStage({ sharedProps: props, entries }: {
    sharedProps: VisualizerSharedProps; entries: MonetVisibleLineEntry[];
}) {
    const safe = getRearSafeInset()!;
    const { theme, subtitleTheme, audioPower, audioBands, currentTime, currentLineIndex, lines,
        showText = true, monetTuning = DEFAULT_MONET_TUNING, subtitleFontScale = 1,
        staticMode = false, isPreviewMode = false } = props;
    const fontStack = resolveThemeFontStack(theme), translationFontStack = resolveThemeTranslationFontStack(subtitleTheme ?? theme);
    const subtitleContentMode = resolveSubtitleContentMode(props.subtitleContentMode, props.showSubtitleTranslation ?? true);
    const fontsEpoch = useFontsEpoch(), handledFonts = useRef(0);
    const focusedLine = entries.find(entry => entry.offset === 0)?.line;
    const fonts = useMemo(() => {
        if (handledFonts.current !== fontsEpoch) {
            handledFonts.current = fontsEpoch;
            clearMonetMeasurementCaches();
        }
        return resolveMonetRearTypography(focusedLine, safe, monetTuning.fontScale, subtitleFontScale, {
            fontStack, translationFontStack, subtitleContentMode, fontWeight: resolveThemeFontWeight(theme, 600),
            translationFontWeight: resolveThemeFontWeight(subtitleTheme ?? theme, 500),
            secondaryTranslationFontWeight: resolveThemeFontWeight(subtitleTheme ?? theme, SECONDARY_TRACK_FONT_WEIGHT_FALLBACK),
        });
    }, [focusedLine, safe.width, safe.height, monetTuning.fontScale, subtitleFontScale, fontStack,
        translationFontStack, subtitleContentMode, theme, subtitleTheme, fontsEpoch]);

    return <VisualizerShell theme={theme} audioPower={audioPower} audioBands={audioBands} sharedProps={props}>
        {showText && <>
            <MonetFloatingDecor theme={theme} staticMode={staticMode} />
            <MonetLyricsRail entries={entries} lines={lines} currentLineIndex={currentLineIndex} currentTime={currentTime}
                theme={theme} subtitleTheme={subtitleTheme} {...fonts} fontStack={fontStack}
                translationFontStack={translationFontStack} subtitleContentMode={subtitleContentMode}
                keywordColoringEnabled={monetTuning.keywordColoringEnabled} emptyText=""
                audioPower={audioPower} audioBands={audioBands} rearFrame={safe}
                onLyricLineSeek={props.onLyricLineSeek} seekDisabled={isPreviewMode} />
            {monetTuning.showAudioVisualization && <div className="absolute bottom-0 left-0 z-20 h-10 overflow-hidden px-5 sm:px-8 lg:px-14"
                style={{ width: 'min(450px, 55vw)' }}>
                <AudioOverlay audioPower={audioPower} audioBands={audioBands} theme={theme} mode={monetTuning.audioStyle}
                    staticMode={staticMode} isPreviewMode={isPreviewMode} />
            </div>}
        </>}
    </VisualizerShell>;
}
