import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { Star, type LucideIcon } from 'lucide-react';
import { DEFAULT_PENDOLO_TUNING } from '../../../types';
import { colorWithAlpha } from '../colorMix';
import { useLucideIcons } from '../../../hooks/useLucideIcons';
import { resolveLucideIcon } from '../../../services/lucideIconResolver';
import { type VisualizerSharedProps } from '../definition';
import VisualizerShell from '../VisualizerShell';
import PendoloClockworkCanvas from './PendoloClockworkCanvas';
import { resolveThemeFontStack, resolveThemeFontWeight, resolveThemeTranslationFontStack } from '../../../utils/fontStacks';
import { resolveSubtitleContentMode } from '../../../utils/lyrics/alternateText';
import { calculatePendoloWheelLayout, type PendoloLineItem } from './pendoloGeometry';
import PendoloLyricBody from './PendoloLyricBody';
import { getRearSafeInset } from '../../../utils/visualizerSurface';
import { resolvePendoloRearLayout, measurePendoloRearLine } from './pendoloRearLayout';
import { buildPendoloTextLayout } from './pendoloTextLayout';
import { buildPendoloSubtitleFontSpec, resolvePendoloSubtitleTracks, sumPendoloSubtitleTrackHeights } from './pendoloSubtitleTracks';
import { resolvePendoloChorusPresentation, resolvePendoloMotionProfile } from './pendoloMotionProfile';
import { resolvePendoloFallbackAnchorIndex } from './pendoloTimeline';
import PendoloRotatingLine from './PendoloRotatingLine';

const PENDOLO_SCROLL_IDLE_RESET_MS = 2500;
const PENDOLO_SCROLL_STEP_PX = 90;
const PENDOLO_TOUCH_STEP_PX = 60;
const PENDOLO_SCROLL_EVENT_OPTIONS = { passive: false } as const;

const READY_GRACE_MS = 3000;
const INSTRUMENTAL_COMMIT_SECONDS = 2;
const INSTRUMENTAL_SECONDS_PER_FRAME = 5;

const getScrollDirection = (delta: number) => {
    if (Math.abs(delta) < 1) return 0;
    return delta > 0 ? 1 : -1;
};

const clampScrollSteps = (steps: number) => {
    if (Math.abs(steps) > 5) return steps > 0 ? 5 : -5;
    return steps;
};

// src/components/visualizer/pendolo/VisualizerPendolo.tsx

/**
 * VisualizerPendolo: Escapement wheel & pendulum clockwork lyric visualizer.
 * Renders lyrics arranged in an adjustable circular arc on the left side of the screen.
 * Advance of song lines triggers a springy mechanical escapement ratchet step and subtle balance wheel motion.
 */
const VisualizerPendolo: React.FC<VisualizerSharedProps> = (props) => {
    const {
        currentTime,
        currentLineIndex,
        lines,
        theme,
        audioBands,
        audioPower,
        showText = true,
        showSubtitleTranslation = true,
        subtitleContentMode = 'translation',
        pendoloTuning = DEFAULT_PENDOLO_TUNING,
        onLyricLineSeek,
        lyricsFontScale = 1,
        subtitleTheme,
        subtitleOverlayOpacity,
        subtitleOverlayBackground,
        subtitleFontScale,
        isPlayerChromeHidden = false,
        hideTranslationSubtitle = false,
    } = props;

    const [viewportSize, setViewportSize] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth : 1920,
        height: typeof window !== 'undefined' ? window.innerHeight : 1080,
    });
    const visualizerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const element = visualizerRef.current;
        if (!element) return;

        const updateViewportSize = () => {
            const width = Math.round(element.clientWidth);
            const height = Math.round(element.clientHeight);
            if (width === 0 || height === 0) return;
            setViewportSize(previous => (
                previous.width === width && previous.height === height
                    ? previous
                    : { width, height }
            ));
        };

        updateViewportSize();
        const observer = new ResizeObserver(updateViewportSize);
        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    }, []);

    const lastValidLineIndexRef = React.useRef<number>(0);
    const hasObservedLineRef = useRef(false);
    if (currentLineIndex >= 0 && currentLineIndex < lines.length) {
        lastValidLineIndexRef.current = currentLineIndex;
        hasObservedLineRef.current = true;
    }

    const wheelRailRef = useRef<HTMLDivElement | null>(null);
    const [manualScrollAnchorIndex, setManualScrollAnchorIndex] = useState<number | null>(null);
    const manualScrollResetRef = useRef<number | null>(null);
    const wheelAccumulatorRef = useRef(0);
    const wheelDirectionRef = useRef(0);
    const touchLastYRef = useRef<number | null>(null);
    const touchAccumulatorRef = useRef(0);
    const touchDirectionRef = useRef(0);
    const pendingSeekIndexRef = useRef<number | null>(null);

    const getFallbackAnchorIndex = useCallback(() => {
        if (manualScrollAnchorIndex !== null) return manualScrollAnchorIndex;
        return resolvePendoloFallbackAnchorIndex(
            lines,
            currentLineIndex,
            lastValidLineIndexRef.current,
            hasObservedLineRef.current,
            currentTime.get(),
        );
    }, [currentLineIndex, currentTime, lines, manualScrollAnchorIndex]);

    const [isInstrumental, setIsInstrumental] = useState(false);
    const lyricsSig = lines.length === 0 ? '' : `${lines.length}|${lines[0]?.fullText ?? ''}`;
    const seedRef = useRef(props.seed);

    useEffect(() => {
        if (lyricsSig !== '') {
            setIsInstrumental(false);
            seedRef.current = props.seed;
            return undefined;
        }
        if (props.seed !== seedRef.current) {
            setIsInstrumental(false);
            seedRef.current = props.seed;
        }

        let raf = 0;
        let sawReset = false;
        const startWall = performance.now();
        const watch = () => {
            const t = currentTime.get();
            const capped = performance.now() - startWall >= READY_GRACE_MS;
            if (!sawReset && t < 1) sawReset = true;
            if ((sawReset && t >= INSTRUMENTAL_COMMIT_SECONDS) || capped) {
                setIsInstrumental(true);
                return;
            }
            raf = requestAnimationFrame(watch);
        };
        raf = requestAnimationFrame(watch);
        return () => cancelAnimationFrame(raf);
    }, [props.seed, lyricsSig, currentTime]);

    const [instrumentalIndex, setInstrumentalIndex] = useState(0);
    const instrumentalIndexRef = useRef(0);

    useEffect(() => {
        if (!isInstrumental) return undefined;

        let raf = 0;
        const tick = () => {
            const t = currentTime.get();
            const idx = Math.floor(t / INSTRUMENTAL_SECONDS_PER_FRAME);
            if (idx !== instrumentalIndexRef.current) {
                instrumentalIndexRef.current = idx;
                setInstrumentalIndex(idx);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [isInstrumental, currentTime]);

    const targetLineIndex = useMemo(() => {
        if (lines.length === 0) {
            return isInstrumental ? instrumentalIndex : 0;
        }
        return getFallbackAnchorIndex();
    }, [getFallbackAnchorIndex, lines.length, isInstrumental, instrumentalIndex]);

    const scheduleManualScrollReset = useCallback(() => {
        if (manualScrollResetRef.current !== null) {
            window.clearTimeout(manualScrollResetRef.current);
        }
        manualScrollResetRef.current = window.setTimeout(() => {
            setManualScrollAnchorIndex(null);
            wheelAccumulatorRef.current = 0;
            wheelDirectionRef.current = 0;
            touchAccumulatorRef.current = 0;
            touchDirectionRef.current = 0;
            manualScrollResetRef.current = null;
        }, PENDOLO_SCROLL_IDLE_RESET_MS);
    }, []);

    useEffect(() => () => {
        if (manualScrollResetRef.current !== null) {
            window.clearTimeout(manualScrollResetRef.current);
        }
    }, []);

    useEffect(() => {
        if (pendingSeekIndexRef.current !== currentLineIndex) return;
        pendingSeekIndexRef.current = null;
        setManualScrollAnchorIndex(null);
    }, [currentLineIndex]);

    const moveManualScrollAnchor = useCallback((steps: number) => {
        if (lines.length === 0) return;
        setManualScrollAnchorIndex(current => {
            const baseIndex = current ?? getFallbackAnchorIndex();
            return Math.max(0, Math.min(lines.length - 1, Math.round(baseIndex + steps)));
        });
        scheduleManualScrollReset();
    }, [getFallbackAnchorIndex, lines.length, scheduleManualScrollReset]);

    const handleLineSeek = useCallback((lineIndex: number, startTime: number) => {
        if (!onLyricLineSeek) return;
        if (manualScrollResetRef.current !== null) {
            window.clearTimeout(manualScrollResetRef.current);
            manualScrollResetRef.current = null;
        }
        if (lineIndex === currentLineIndex) {
            pendingSeekIndexRef.current = null;
            setManualScrollAnchorIndex(null);
            onLyricLineSeek(startTime);
            return;
        }
        pendingSeekIndexRef.current = lineIndex;
        setManualScrollAnchorIndex(lineIndex);
        wheelAccumulatorRef.current = 0;
        wheelDirectionRef.current = 0;
        touchAccumulatorRef.current = 0;
        touchDirectionRef.current = 0;
        onLyricLineSeek(startTime);
    }, [currentLineIndex, onLyricLineSeek]);

    const handleRailWheel = useCallback((event: WheelEvent) => {
        if (lines.length === 0) return;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        const direction = getScrollDirection(event.deltaY);
        if (direction !== 0 && wheelDirectionRef.current !== 0 && direction !== wheelDirectionRef.current) {
            wheelAccumulatorRef.current = 0;
        }
        wheelDirectionRef.current = direction || wheelDirectionRef.current;
        wheelAccumulatorRef.current += event.deltaY;
        const steps = clampScrollSteps(Math.trunc(wheelAccumulatorRef.current / PENDOLO_SCROLL_STEP_PX));
        if (steps !== 0) {
            wheelAccumulatorRef.current = 0;
            moveManualScrollAnchor(steps);
        } else {
            scheduleManualScrollReset();
        }
    }, [lines.length, moveManualScrollAnchor, scheduleManualScrollReset]);

    const handleRailTouchStart = useCallback((event: TouchEvent) => {
        if (lines.length === 0) return;
        event.stopPropagation();
        touchLastYRef.current = event.touches[0]?.clientY ?? null;
        touchAccumulatorRef.current = 0;
        touchDirectionRef.current = 0;
        setManualScrollAnchorIndex(getFallbackAnchorIndex());
        scheduleManualScrollReset();
    }, [getFallbackAnchorIndex, lines.length, scheduleManualScrollReset]);

    const handleRailTouchMove = useCallback((event: TouchEvent) => {
        if (lines.length === 0 || touchLastYRef.current === null) return;
        event.stopPropagation();
        const nextY = event.touches[0]?.clientY;
        if (typeof nextY !== 'number') return;
        const deltaY = touchLastYRef.current - nextY;
        touchLastYRef.current = nextY;
        const direction = getScrollDirection(deltaY);
        if (direction !== 0 && touchDirectionRef.current !== 0 && direction !== touchDirectionRef.current) {
            touchAccumulatorRef.current = 0;
        }
        touchDirectionRef.current = direction || touchDirectionRef.current;
        touchAccumulatorRef.current += deltaY;
        const steps = clampScrollSteps(Math.trunc(touchAccumulatorRef.current / PENDOLO_TOUCH_STEP_PX));
        if (steps !== 0) {
            touchAccumulatorRef.current = 0;
            moveManualScrollAnchor(steps);
        } else {
            scheduleManualScrollReset();
        }
    }, [lines.length, moveManualScrollAnchor, scheduleManualScrollReset]);

    const handleRailTouchEnd = useCallback(() => {
        touchLastYRef.current = null;
        touchDirectionRef.current = 0;
        touchAccumulatorRef.current = 0;
        scheduleManualScrollReset();
    }, [scheduleManualScrollReset]);

    useEffect(() => {
        const rail = wheelRailRef.current;
        if (!rail) return undefined;
        const wheelListener: EventListener = event => handleRailWheel(event as WheelEvent);
        const touchStartListener: EventListener = event => handleRailTouchStart(event as TouchEvent);
        const touchMoveListener: EventListener = event => handleRailTouchMove(event as TouchEvent);
        const touchEndListener: EventListener = () => handleRailTouchEnd();
        rail.addEventListener('wheel', wheelListener, PENDOLO_SCROLL_EVENT_OPTIONS);
        rail.addEventListener('touchstart', touchStartListener, PENDOLO_SCROLL_EVENT_OPTIONS);
        rail.addEventListener('touchmove', touchMoveListener, PENDOLO_SCROLL_EVENT_OPTIONS);
        rail.addEventListener('touchend', touchEndListener, PENDOLO_SCROLL_EVENT_OPTIONS);
        rail.addEventListener('touchcancel', touchEndListener, PENDOLO_SCROLL_EVENT_OPTIONS);
        return () => {
            rail.removeEventListener('wheel', wheelListener);
            rail.removeEventListener('touchstart', touchStartListener);
            rail.removeEventListener('touchmove', touchMoveListener);
            rail.removeEventListener('touchend', touchEndListener);
            rail.removeEventListener('touchcancel', touchEndListener);
        };
    }, [handleRailTouchEnd, handleRailTouchMove, handleRailTouchStart, handleRailWheel]);

    // Escapement spring motion for line transition tick
    const springSnappiness = pendoloTuning.tickSnappiness;
    const motionProfile = useMemo(
        () => resolvePendoloMotionProfile(theme.animationIntensity),
        [theme.animationIntensity],
    );
    const tickSpring = useSpring(targetLineIndex, {
        stiffness: 180 * springSnappiness * motionProfile.escapementSpringMultiplier,
        damping: (18 + 4 / Math.max(0.5, springSnappiness)) * motionProfile.escapementDampingMultiplier,
        mass: 0.8,
    });

    // Update target escapement spring when targetLineIndex updates
    useEffect(() => {
        tickSpring.set(targetLineIndex);
    }, [targetLineIndex, tickSpring]);

    // Font stack & weight setup
    const fontFamily = useMemo(() => resolveThemeFontStack(theme), [theme]);
    const fontWeight = useMemo(() => resolveThemeFontWeight(theme, 400), [theme]);

    const rearLayout = useMemo(() => {
        const safe = getRearSafeInset();
        return safe ? resolvePendoloRearLayout(viewportSize.width, viewportSize.height, safe, pendoloTuning) : null;
    }, [viewportSize, pendoloTuning]);
    const wheelTuning = rearLayout?.tuning ?? pendoloTuning;
    const centerX = viewportSize.width * wheelTuning.wheelCenterX;
    const centerY = viewportSize.height * wheelTuning.wheelCenterY;
    const baseRadius = Math.min(viewportSize.width, viewportSize.height) * wheelTuning.arcRadius;
    const lyricRadiusOffset = Math.min(viewportSize.width, viewportSize.height) * 0.06;
    const lyricRingRadius = baseRadius + lyricRadiusOffset;

    const maxItemX = centerX + baseRadius;
    const availableTextWidth = rearLayout?.textWidth ?? Math.max(
        140,
        Math.min(viewportSize.width * 0.46, viewportSize.width - maxItemX - 48),
    );

    // Escapement angular shift calculation
    const totalArcRad = (pendoloTuning.arcAngleDeg * Math.PI) / 180;
    const visibleWindowCount = 9;
    const angleStepRad = totalArcRad / Math.max(1, visibleWindowCount - 1);
    // Keep the ratchet interpolation out of React's render path. A line change is
    // discrete, but the spring emits many intermediate values while settling.
    const wheelRotationDeg = useTransform(
        tickSpring,
        value => -(value - targetLineIndex) * angleStepRad * (180 / Math.PI),
    );
    const textRotationCorrectionDeg = useTransform(wheelRotationDeg, value => -value * 0.65);
    const gearRotationAngleRad = useTransform(tickSpring, value => value * angleStepRad);

    // Pendolo lays subtitles out inside its own clockwork layout, not the shared bottom subtitle. 'both' stacks
    // romanization above translation under each lyric; the rows come from resolvePendoloSubtitleTracks, which both
    // the height pre-measurement below and the rendering read, so the reserved space always matches the drawn rows.
    const resolvedMode = useMemo(() => resolveSubtitleContentMode(subtitleContentMode, showSubtitleTranslation), [subtitleContentMode, showSubtitleTranslation]);
    const subtitleFontFamily = useMemo(() => resolveThemeTranslationFontStack(subtitleTheme ?? theme), [subtitleTheme, theme]);

    const rearLines = useMemo(() => rearLayout ? lines.map((line, index) => Math.abs(index - targetLineIndex) > 10 ? undefined :
        measurePendoloRearLine({ line, layout: rearLayout, activeScale: pendoloTuning.activeScale,
            lyricsFontScale, subtitleFontScale: subtitleFontScale ?? 1, mode: resolvedMode,
            hidden: hideTranslationSubtitle, fontFamily, fontWeight, subtitleFontFamily,
            subtitleTheme: subtitleTheme ?? theme })) : [],
    [rearLayout, lines, targetLineIndex, pendoloTuning.activeScale, lyricsFontScale, subtitleFontScale,
        resolvedMode, hideTranslationSubtitle, fontFamily, fontWeight, subtitleFontFamily, subtitleTheme, theme]);

    const lineBlockHeights = useMemo(() => {
        const measureWidth = availableTextWidth / pendoloTuning.activeScale;
        return lines.map((line, index) => {
            if (Math.abs(index - targetLineIndex) > 10) {
                return 0;
            }
            if (rearLayout) return rearLines[index]?.height ?? 0;
            // Always pre-allocate space for the focal state to prevent overlapping when scaled up
            const fontPx = Math.round(28 * lyricsFontScale);
            const mainHeight = buildPendoloTextLayout(
                line.fullText,
                `${fontWeight} ${fontPx}px ${fontFamily}`,
                measureWidth,
                Math.round(fontPx * 1.2),
            ).height;

            // Focal-state rows, same as the main lyric above: reserve the largest size the line will take.
            const subtitleTracks = resolvePendoloSubtitleTracks(line, {
                mode: resolvedMode,
                hidden: hideTranslationSubtitle,
                focal: true,
                subtitleFontScale: subtitleFontScale ?? 1,
            });
            const translationHeight = sumPendoloSubtitleTrackHeights(subtitleTracks, track => buildPendoloTextLayout(
                track.text,
                buildPendoloSubtitleFontSpec(track, resolveThemeFontWeight(subtitleTheme ?? theme, track.fontWeightFallback), subtitleFontFamily),
                measureWidth,
                track.lineHeightPx,
            ).height);

            return (mainHeight + translationHeight) * pendoloTuning.activeScale;
        });
    }, [availableTextWidth, fontFamily, fontWeight, hideTranslationSubtitle, lines, lyricsFontScale, pendoloTuning.activeScale, resolvedMode, subtitleFontFamily, subtitleFontScale, subtitleTheme, targetLineIndex, theme, rearLayout, rearLines]);

    // Calculate line items for wheel
    const lineItems = useMemo(() => {
        return calculatePendoloWheelLayout(
            lines,
            targetLineIndex,
            0,
            viewportSize.width,
            viewportSize.height,
            wheelTuning,
            lyricRadiusOffset,
            lineBlockHeights,
        );
    }, [lineBlockHeights, lines, targetLineIndex, viewportSize, wheelTuning, lyricRadiusOffset]);

    const primaryTextColor = theme.primaryColor || '#FFFFFF';
    const accentTextColor = theme.accentColor || '#3B82F6';
    // Star stands in while the theme icon loads, and for names lucide does not have.
    const balanceIconName = theme.lyricsIcons?.[0];
    const lucideIconRevision = useLucideIcons(balanceIconName ? [balanceIconName] : undefined);
    const BalanceIcon = useMemo<LucideIcon>(
        () => resolveLucideIcon(balanceIconName) ?? Star,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [balanceIconName, lucideIconRevision],
    );
    const balanceGearX = centerX + baseRadius * 0.2;
    const balanceGearY = centerY - baseRadius * 0.75;

    const renderLine = (item: PendoloLineItem) => {
        const isFocal = item.isActive;
        const showChorusMarker = manualScrollAnchorIndex !== null && Boolean(item.line.isChorus);
        const chorusPresentation = resolvePendoloChorusPresentation(
            item.line.isChorus,
            isFocal && item.index === currentLineIndex,
            motionProfile,
        );
        const rearLine = rearLines[item.index];
        const anchored = Boolean(rearLayout && isFocal);
        const maxTextWidth = rearLine?.maxWidth ?? availableTextWidth / item.scale;
        const fontPx = rearLine ? Math.round(rearLine.fontPx * (isFocal ? 1 : 22 / 28)) : Math.round((isFocal ? 28 : 22) * lyricsFontScale);
        const subtitleTracks = resolvePendoloSubtitleTracks(item.line, {
            mode: resolvedMode,
            hidden: hideTranslationSubtitle,
            focal: isFocal,
            subtitleFontScale: rearLine?.subtitleScale ?? subtitleFontScale ?? 1,
        });

        const body = (
            <PendoloLyricBody shared={props} item={item} anchored={anchored}
                showChorusMarker={showChorusMarker} chorusPresentation={chorusPresentation}
                chorusGlowMultiplier={motionProfile.chorusGlowMultiplier}
                textRotationCorrectionDeg={textRotationCorrectionDeg}
                fontFamily={fontFamily} fontWeight={fontWeight} fontPx={fontPx}
                maxTextWidth={maxTextWidth} subtitleFontFamily={subtitleFontFamily}
                subtitleTracks={subtitleTracks} />
        );
        if (anchored) return (
            <div key={item.line.id ?? `pendolo-line-${item.index}`}
                data-pendolo-rear-anchor
                className="absolute pointer-events-none"
                style={{ left: item.x, top: item.y, zIndex: 2, fontFamily, fontWeight }}
                onClick={event => { event.stopPropagation(); handleLineSeek(item.index, item.line.startTime); }}>
                {body}
            </div>
        );
        return (
            <PendoloRotatingLine
                key={item.line.id ?? `pendolo-line-${item.index}`}
                wheelRotationDeg={wheelRotationDeg}
                baseAngleDeg={item.angleDeg}
                baseOpacity={item.alpha}
                left={item.x}
                top={item.y}
                fontFamily={fontFamily}
                fontWeight={fontWeight}
                canSeek={Boolean(onLyricLineSeek)}
                interactive={!rearLayout}
                onClick={(e) => {
                    e.stopPropagation();
                    handleLineSeek(item.index, item.line.startTime);
                }}
            >
                {body}
            </PendoloRotatingLine>
        );
    };

    return (
        <VisualizerShell
            theme={theme}
            audioPower={audioPower}
            audioBands={audioBands}
            sharedProps={props}
        >
            <div ref={visualizerRef} data-pendolo-rear-layout={rearLayout ? JSON.stringify(rearLayout) : undefined} className="relative w-full h-full overflow-hidden select-none pointer-events-none">
                {/* Wireframe Dynamic Clockwork Canvas (Gears, Escapement & Hairspring) */}
                <PendoloClockworkCanvas
                    centerX={centerX}
                    centerY={centerY}
                    viewportWidth={viewportSize.width}
                    viewportHeight={viewportSize.height}
                    baseRadius={baseRadius}
                    lyricRingRadius={lyricRingRadius}
                    escapementAngleMotionValue={gearRotationAngleRad}
                    audioBassMotionValue={audioBands.bass}
                    primaryTextColor={primaryTextColor}
                    accentTextColor={accentTextColor}
                    backgroundColor={theme.backgroundColor}
                    showGearDecor={pendoloTuning.showGearDecor}
                    showCenterGradient={pendoloTuning.showCenterGradient ?? true}
                    showCover={pendoloTuning.showCoverOnWatchFace ?? false}
                    coverUrl={props.coverUrl}
                    enableLineGlow={pendoloTuning.enableLineGlow ?? false}
                    paused={props.paused}
                    motionProfile={motionProfile}
                />
                {pendoloTuning.showGearDecor !== 'none' && (
                    <div
                        className="absolute pointer-events-none"
                        style={{
                            left: `${balanceGearX}px`,
                            top: `${balanceGearY}px`,
                            zIndex: 1,
                            transform: 'translate(-50%, -50%)',
                        }}
                    >
                        <BalanceIcon
                            size={Math.max(14, baseRadius * 0.13)}
                            strokeWidth={1.2}
                            absoluteStrokeWidth
                            color={colorWithAlpha(accentTextColor, 0.62)}
                        />
                    </div>
                )}

                {/* Lyric Wheel Arc Items */}
                {showText && (
                    <motion.div
                        ref={wheelRailRef}
                        className="absolute inset-0 w-full h-full pointer-events-auto"
                        style={{
                            zIndex: 2,
                            // Rear taps belong to the auto-hiding playback controls, not this full-panel rail.
                            pointerEvents: rearLayout ? 'none' : 'auto',
                            rotate: wheelRotationDeg,
                            transformOrigin: `${centerX}px ${centerY}px`,
                            WebkitTransform: 'translateZ(0)',
                        }}
                    >
                        {lineItems.filter(item => !rearLayout || !item.isActive).map(renderLine)}
                    </motion.div>
                )}
                {showText && rearLayout && lineItems.filter(item => item.isActive).map(renderLine)}
            </div>
        </VisualizerShell>
    );
};

export default React.memo(VisualizerPendolo);
