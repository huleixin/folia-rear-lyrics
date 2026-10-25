import React from 'react';
import { motion, type MotionValue } from 'framer-motion';
import type { VisualizerSharedProps } from '../definition';
import type { PendoloLineItem } from './pendoloGeometry';
import type { PendoloSubtitleTrackSpec } from './pendoloSubtitleTracks';
import type { resolvePendoloChorusPresentation } from './pendoloMotionProfile';
import { resolveThemeFontWeight } from '../../../utils/fontStacks';
import { colorWithAlpha } from '../colorMix';
import PendoloActiveLyricSweep from './PendoloActiveLyricSweep';

// src/components/visualizer/pendolo/PendoloLyricBody.tsx
// Shared lyric/translation drawing; only the rear focal block opts out of the rotating rail.
interface Props {
    shared: VisualizerSharedProps;
    item: PendoloLineItem;
    anchored: boolean;
    showChorusMarker: boolean;
    chorusPresentation: ReturnType<typeof resolvePendoloChorusPresentation>;
    chorusGlowMultiplier: number;
    textRotationCorrectionDeg: MotionValue<number>;
    fontFamily: string;
    fontWeight: number;
    fontPx: number;
    maxTextWidth: number;
    subtitleFontFamily: string;
    subtitleTracks: PendoloSubtitleTrackSpec[];
}

const PendoloLyricBody: React.FC<Props> = ({
    shared,
    item,
    anchored,
    showChorusMarker,
    chorusPresentation,
    chorusGlowMultiplier,
    textRotationCorrectionDeg,
    fontFamily,
    fontWeight,
    fontPx,
    maxTextWidth,
    subtitleFontFamily,
    subtitleTracks,
}) => {
    const { theme, subtitleTheme, currentTime } = shared;
    const isFocal = item.isActive;
    const primaryTextColor = theme.primaryColor || '#FFFFFF';
    const accentTextColor = theme.accentColor || '#3B82F6';
    const secondaryTextColor = theme.secondaryColor || '#9CA3AF';
    return (
        <motion.div
            data-pendolo-current={isFocal ? item.index : undefined}
            className="inline-block"
            style={{
                rotate: anchored ? 0 : textRotationCorrectionDeg,
                transformOrigin: 'left center',
                WebkitTransform: 'translateZ(0)',
            }}
        >
            <div
                className="relative inline-block"
                style={{
                    transform: `rotate(${item.angleDeg * 0.35}deg) scale(${item.scale}) translateZ(0)`,
                    transformOrigin: anchored ? 'left top' : 'left center',
                    isolation: 'isolate',
                }}
            >
                <motion.div
                    initial={false}
                    animate={{ scale: chorusPresentation.haloScale }}
                    transition={{ duration: chorusPresentation.transitionDuration, ease: 'easeOut' }}
                    style={{ transformOrigin: anchored ? 'left top' : 'left center' }}
                >
                    {chorusPresentation.isActive && (
                        <motion.div
                            aria-hidden
                            className="absolute pointer-events-none -z-10 rounded-2xl"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: chorusPresentation.haloOpacity, scale: 1 }}
                            transition={{ duration: chorusPresentation.transitionDuration, ease: 'easeOut' }}
                            style={{
                                inset: '-0.7em -1.1em',
                                background: `radial-gradient(circle at 42% 50%, ${colorWithAlpha(
                                    accentTextColor,
                                    0.14 * chorusPresentation.haloOpacity
                                )} 0%, ${colorWithAlpha(
                                    accentTextColor,
                                    0.035 * chorusPresentation.haloOpacity
                                )} 55%, transparent 82%)`,
                                filter: `blur(${Math.round(10 * chorusGlowMultiplier)}px)`,
                            }}
                        />
                    )}
                    <div style={{ transform: 'translateY(-50%)' }}>
                        {showChorusMarker && (
                            <span
                                aria-hidden
                                className="absolute pointer-events-none rounded-full"
                                style={{
                                    width: '0.42em',
                                    height: '0.42em',
                                    left: '-0.95em',
                                    top: '0.52em',
                                    backgroundColor: accentTextColor,
                                    boxShadow: `0 0 7px ${colorWithAlpha(accentTextColor, 0.58)}`,
                                }}
                            />
                        )}
                        <div>
                            {isFocal ? (
                                <PendoloActiveLyricSweep
                                    line={item.line}
                                    currentTime={currentTime}
                                    fontFamily={fontFamily}
                                    fontWeight={fontWeight}
                                    maxWidth={maxTextWidth}
                                    primaryTextColor={primaryTextColor}
                                    accentTextColor={accentTextColor}
                                    fontPx={fontPx}
                                    wordColors={theme.wordColors}
                                    isChorus={chorusPresentation.isActive}
                                    accentMix={chorusPresentation.accentMix}
                                    chorusGlowMultiplier={chorusPresentation.glowMultiplier}
                                />
                            ) : (
                                <div
                                    className="transition-all duration-200 whitespace-pre-wrap"
                                    style={{
                                        fontSize: `${fontPx}px`,
                                        maxWidth: `${maxTextWidth}px`,
                                        color: colorWithAlpha(primaryTextColor, 0.75),
                                        letterSpacing: '0.01em',
                                        whiteSpace: 'pre-wrap',
                                        overflowWrap: 'anywhere',
                                        wordBreak: 'break-word',
                                    }}
                                >
                                    {item.line.fullText}
                                </div>
                            )}
                        </div>
                        {/* Secondary Romanization / Translation Lines (second row steps down in size and opacity) */}
                        {subtitleTracks.map((track) => (
                            <div
                                key={track.role}
                                data-pendolo-subtitle-track={track.role}
                                className="whitespace-pre-wrap transition-opacity duration-200"
                                style={{
                                    fontFamily: subtitleFontFamily,
                                    fontWeight: resolveThemeFontWeight(
                                        subtitleTheme ?? theme,
                                        track.fontWeightFallback
                                    ),
                                    fontSize: `${track.fontPx}px`,
                                    maxWidth: `${maxTextWidth}px`,
                                    color: isFocal ? secondaryTextColor : colorWithAlpha(secondaryTextColor, 0.6),
                                    opacity: track.opacityFactor === 1 ? undefined : track.opacityFactor,
                                    letterSpacing: '0.01em',
                                    whiteSpace: 'pre-wrap',
                                    overflowWrap: 'anywhere',
                                    wordBreak: 'break-word',
                                    marginTop: `${track.gapEm}em`,
                                }}
                            >
                                {track.text}
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default React.memo(PendoloLyricBody);
