import React, { useEffect, useState } from 'react';
import { resolveThemeFontStack, resolveThemeFontWeight, resolveThemeTranslationFontStack } from '../../../utils/fontStacks';
import type { VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import { fitRearLyricFont } from '../rearTextFit';
import { getVisualizerSurface } from '../../../utils/visualizerSurface';

// src/components/visualizer/still/VisualizerStill.tsx
// Renders static lyrics inside the shared shell while leaving the background renderer unmounted.
const VisualizerStill: React.FC<VisualizerSharedProps> = ({
    currentLineIndex,
    lines,
    theme,
    subtitleTheme,
    lyricsFontScale = 1,
    subtitleFontScale = 1,
    hideTranslationSubtitle = false,
    isDaylight = false,
    showText = true,
    audioPower,
    audioBands,
    ...sharedProps
}) => {
    const [effectiveIndex, setEffectiveIndex] = useState(() => Math.max(0, currentLineIndex));

    useEffect(() => {
        if (currentLineIndex !== -1) {
            setEffectiveIndex(currentLineIndex);
        } else if (effectiveIndex >= lines.length) {
            setEffectiveIndex(0);
        }
    }, [currentLineIndex, effectiveIndex, lines.length]);

    const resolvedSubtitleTheme = subtitleTheme ?? theme;

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={{
                ...sharedProps,
                isDaylight,
            }}
            renderBackground={false}
            className="visualizer-still"
        >
            <div
                className={`absolute inset-0 z-0 pointer-events-none ${isDaylight ? 'opacity-30 mix-blend-multiply' : 'opacity-[0.65]'} bg-[radial-gradient(ellipse_at_center,transparent_0%,#000_100%)]`}
            />

            {showText && (
                <div className={`absolute inset-0 z-0 flex flex-col items-center justify-center pointer-events-none ${getVisualizerSurface() ? 'gap-1 px-2 pb-6' : 'gap-8 px-12 pb-16'}`}>
                    {(getVisualizerSurface() ? [0] : [-1, 0, 1]).map((offset) => {
                        const lineIndex = effectiveIndex + offset;
                        const line = lines[lineIndex];
                        if (!line) {
                            return <div key={`empty-${offset}`} className="h-20" />;
                        }

                        const isCurrent = offset === 0;
                        return (
                            <div key={lineIndex} className="flex flex-col items-center w-full max-w-4xl">
                                {line.fullText && (
                                    <div
                                        className={`drop-shadow-md text-center tracking-[0.02em] ${isCurrent ? 'opacity-100 leading-tight' : 'text-3xl opacity-30'} ${getVisualizerSurface() ? '' : isCurrent ? 'text-[2.5rem]' : ''}`}
                                        style={{
                                            color: theme.primaryColor,
                                            fontFamily: resolveThemeFontStack(theme),
                                            fontSize: getVisualizerSurface() ? `${fitRearLyricFont(line.fullText, theme, { scale: lyricsFontScale }) ?? 20}px` : undefined,
                                            scale: getVisualizerSurface() ? 1 : lyricsFontScale,
                                            fontWeight: resolveThemeFontWeight(theme, isCurrent ? 700 : 600),
                                        }}
                                    >
                                        {line.fullText}
                                    </div>
                                )}
                                {/* Still reads line.translation directly and ignores subtitleContentMode, so the 'both' option changes nothing here (phase 2). */}
                                {line.translation && !hideTranslationSubtitle && (
                                    <div
                                        className={`drop-shadow-sm text-center tracking-wide ${getVisualizerSurface() ? 'opacity-90' : isCurrent ? 'text-2xl opacity-80 mt-3' : 'text-xl opacity-30 mt-2'}`}
                                        style={{
                                            color: resolvedSubtitleTheme.secondaryColor,
                                            fontFamily: resolveThemeTranslationFontStack(resolvedSubtitleTheme),
                                            fontSize: getVisualizerSurface() ? `${Math.max(10, Math.min(12, 11 * subtitleFontScale))}px` : undefined,
                                            scale: getVisualizerSurface() ? 1 : lyricsFontScale * subtitleFontScale,
                                            fontWeight: resolveThemeFontWeight(resolvedSubtitleTheme, isCurrent ? 500 : 400),
                                        }}
                                    >
                                        {line.translation}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </VisualizerShell>
    );
};

export default VisualizerStill;
