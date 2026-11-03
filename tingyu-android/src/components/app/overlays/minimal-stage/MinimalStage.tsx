import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, AudioLines, Heart, MoreHorizontal } from 'lucide-react';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import MinimalAmbience from './MinimalAmbience';
import MinimalCoverPage from './MinimalCoverPage';
import MinimalLyricsPage from './MinimalLyricsPage';
import MinimalTransport from './MinimalTransport';
import MobileStageMenu from '../mobile-stage/MobileStageMenu';
import { useCoverColors } from './useCoverPalette';
import { buildMinimalPalette, rgbToHsl, type CoverColors } from './minimalPalette';
import { parseColorChannels } from '../../../visualizer/colorMix';
import { usePlayerViewModeStore, type MinimalPlayerPage } from '../../../../stores/usePlayerViewModeStore';
import { useReducedMotionFor } from '../../../../hooks/useReducedMotionFor';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { PlayerState } from '../../../../types';
import { registerMinimalStageExit, runMinimalStageExit } from './minimalStageTransition';
import { PREHIDE_COMPOSE_CHROME } from '../../../../services/nativeChrome';
import { flushNativeShellRoute } from '../../../../services/nativeShellCommit';
import './minimalStage.css';

// src/components/app/overlays/minimal-stage/MinimalStage.tsx
// The minimal front stage: two pages, one transport, one ambient background.
//
// This is a presentation layer over the playback the app already runs. It mounts in place of the
// visualizer renderer, so entering or leaving it never rebuilds the audio pipeline, the lyric
// parser or the MediaSession — the same `currentSong`, the same `lyricCurrentTime`, the same queue.
//
// Paging is a transformed track, tracked from pointer events, rather than a native snap scroller.
// Two reasons: the platform's snap animation is roughly 90ms and cannot be slowed, which is what
// made the switch feel abrupt; and a transform can follow the finger with a rubber band at the ends
// while the vertical lyric list keeps native scrolling (touch-action: pan-y on the shell).

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;

const PAGES: MinimalPlayerPage[] = ['cover', 'lyrics'];

/** Commit animation length. The reference asks for 300–450ms; distance shortens it a little. */
const PAGE_MIN_MS = 260;
const PAGE_SPAN_MS = 130;
/** Enter/exit of the whole page over the shell — matched to .min[data-phase] in the stylesheet. */
const ENTER_MS = 460;
const EXIT_MS = 300;
/** Distance before a gesture commits, as a fraction of the page. */
const COMMIT_RATIO = 0.28;
/** Pointer speed (px/ms) that overrides the distance rule. */
const FLING_SPEED = 0.35;
/** The system back gesture owns the first pixels of the left edge; do not fight it for a swipe. */
const EDGE_GUARD_PX = 22;

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

/** Theme colours, used until the artwork has been sampled. */
const themeFallback = (theme: Controls['theme'] | undefined, light: boolean): CoverColors => {
    const background = parseColorChannels(theme?.backgroundColor ?? (light ? '#f1f3ef' : '#071312'));
    const accent = parseColorChannels(theme?.accentColor ?? (light ? '#0f8f74' : '#6fe6c3'));
    const primary = background ? rgbToHsl(background) : { h: 168, s: 0.3, l: light ? 0.92 : 0.12 };
    const accentHsl = accent ? rgbToHsl(accent) : { h: 168, s: 0.5, l: light ? 0.42 : 0.62 };
    return {
        primary,
        secondary: { ...primary, h: (primary.h + 26) % 360 },
        accent: accentHsl,
        average: primary,
    };
};

const usePageHidden = (): boolean => {
    const [hidden, setHidden] = useState(() => (typeof document === 'undefined' ? false : document.hidden));
    useEffect(() => {
        const update = () => setHidden(document.hidden);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
    }, []);
    return hidden;
};

type Drag = {
    id: number;
    axis: 'none' | 'x' | 'y';
    startX: number;
    startY: number;
    startPos: number;
    lastX: number;
    lastTime: number;
    /** px per ms, positive to the right. */
    speed: number;
};

export default function MinimalStage({
    chrome,
    controls,
}: {
    chrome: NonNullable<AppOverlaysModel['mobileStage']>;
    controls: Controls | null;
}) {
    const { t } = useTranslation();
    const page = usePlayerViewModeStore(state => state.page);
    const setPage = usePlayerViewModeStore(state => state.setPage);
    const openStage = usePlayerViewModeStore(state => state.openStage);
    const stageTransition = usePlayerViewModeStore(state => state.stageTransition);
    const detour = usePlayerViewModeStore(state => state.detour);
    const underStage = detour || stageTransition === 'to-minimal';
    const covered = detour && stageTransition === 'idle';
    const light = !!controls?.isDaylight;
    const song = chrome.song;
    const coverUrl = song?.coverUrl ?? null;
    const lyrics = usePlaybackStore(state => state.lyrics);
    const coverColors = useCoverColors(coverUrl);
    const still = useReducedMotionFor('monetBackground');
    const hidden = usePageHidden();
    const pagerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    /** The four layers that follow the strip without travelling with it. */
    const sleeveRef = useRef<HTMLDivElement>(null);
    const coverMetaRef = useRef<HTMLDivElement>(null);
    const lyricsIdRef = useRef<HTMLDivElement>(null);
    const dotRefs = useRef<Array<HTMLButtonElement | null>>([]);
    /** Page position in page units; 0 = cover, 1 = lyrics. May sit outside the range mid-drag. */
    const posRef = useRef(0);
    const frameRef = useRef(0);
    const dragRef = useRef<Drag | null>(null);
    /** Set when this component starts an animation, so the index effect does not restart it. */
    const ownMoveRef = useRef(false);
    const closingRef = useRef(false);
    const [menuOpen, setMenuOpen] = useState(false);
    // Android moves the retained WebView as a unit; do not run another CSS entrance inside it.
    const [phase, setPhase] = useState<'enter' | 'idle' | 'exit'>(
        still || PREHIDE_COMPOSE_CHROME ? 'idle' : 'enter',
    );
    useLayoutEffect(() => { flushNativeShellRoute(); }, []);
    const closeMenu = useCallback(() => setMenuOpen(false), []);
    const playing = controls?.playerState === PlayerState.PLAYING;

    const palette = useMemo(
        () => buildMinimalPalette(
            coverColors ?? themeFallback(controls?.theme, light),
            light ? 'light' : 'dark',
            coverColors !== null,
        ),
        [coverColors, controls?.theme, light],
    );

    const index = page === 'lyrics' ? 1 : 0;

    const applyPos = useCallback((pos: number) => {
        posRef.current = pos;
        const track = trackRef.current;
        if (track) {
            // 50% of a 200%-wide track is exactly one page.
            track.style.transform = `translate3d(${-pos * 50}%, 0, 0)`;
        }
        // The layers that should not travel with the strip: the sleeve's parallax, the two
        // secondary fades, and the dots. These used to read a `--min-pos` custom property published
        // on the shell, which is the one way to do this that costs the most: an unregistered custom
        // property is an opaque token stream, so each frame's change invalidated style for every
        // element that inherits it — the entire lyric column with it. Writing the four computed
        // values onto the four elements that use them keeps the frame O(1) instead of O(page).
        const sleeve = sleeveRef.current;
        if (sleeve) {
            sleeve.style.transform = `translate3d(${pos * 11}%, 0, 0)`;
        }
        const clamped = pos < 0 ? 0 : pos > 1 ? 1 : pos;
        const meta = coverMetaRef.current;
        if (meta) {
            meta.style.opacity = String(1 - 0.5 * clamped);
        }
        const identity = lyricsIdRef.current;
        if (identity) {
            identity.style.opacity = String(0.5 + 0.5 * clamped);
        }
        for (let index = 0; index < dotRefs.current.length; index += 1) {
            dotRefs.current[index]?.style.setProperty('--near', String(index === 0 ? 1 - clamped : clamped));
        }
    }, []);

    const stopFrame = useCallback(() => {
        if (frameRef.current) {
            window.cancelAnimationFrame(frameRef.current);
            frameRef.current = 0;
        }
    }, []);

    const animateTo = useCallback((target: number, instant: boolean) => {
        stopFrame();
        const from = posRef.current;
        if (instant || Math.abs(target - from) < 0.002) {
            applyPos(target);
            return;
        }
        const distance = Math.abs(target - from);
        const duration = PAGE_MIN_MS + PAGE_SPAN_MS * Math.min(1, distance);
        const started = performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - started) / duration);
            applyPos(from + (target - from) * easeOutCubic(progress));
            if (progress < 1) {
                frameRef.current = window.requestAnimationFrame(step);
            } else {
                frameRef.current = 0;
                applyPos(target);
            }
        };
        frameRef.current = window.requestAnimationFrame(step);
    }, [applyPos, stopFrame]);

    // First paint: land on the remembered page with no movement at all.
    useLayoutEffect(() => {
        applyPos(index);
        // Mount-only: afterwards the track position is driven by the gesture and the effects below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Someone else moved the page: a dot, a restored preference, a rotation. Our own commits set
    // ownMoveRef so this does not restart an animation that is already on its way.
    useEffect(() => {
        if (ownMoveRef.current) {
            ownMoveRef.current = false;
            return;
        }
        animateTo(index, still);
    }, [index, still, animateTo]);

    useEffect(() => () => {
        stopFrame();
    }, [stopFrame]);

    // Clear the browser entrance once the shell rise is over.
    useEffect(() => {
        if (phase !== 'enter') {
            return;
        }
        const timer = window.setTimeout(() => setPhase('idle'), ENTER_MS);
        return () => window.clearTimeout(timer);
    }, [phase]);

    // Leaving is animated, but the callers (the chevron, the Back gesture) are synchronous. A second
    // request while the page is already falling is dropped: that is what keeps a double tap from
    // navigating twice and mounting a second player page behind this one.
    const runExit = useCallback((done: () => void) => {
        if (still || PREHIDE_COMPOSE_CHROME) {
            done();
            return;
        }
        if (closingRef.current) {
            return;
        }
        closingRef.current = true;
        setPhase('exit');
        window.setTimeout(() => {
            closingRef.current = false;
            done();
        }, EXIT_MS);
    }, [still]);

    useEffect(() => underStage ? undefined : registerMinimalStageExit(runExit), [runExit, underStage]);

    const commit = useCallback((targetIndex: number) => {
        const next: MinimalPlayerPage = targetIndex === 1 ? 'lyrics' : 'cover';
        if (usePlayerViewModeStore.getState().page !== next) {
            ownMoveRef.current = true;
            setPage(next);
        }
        animateTo(targetIndex, still);
    }, [animateTo, setPage, still]);

    const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }
        if (event.clientX < EDGE_GUARD_PX) {
            return;
        }
        stopFrame();
        dragRef.current = {
            id: event.pointerId,
            axis: 'none',
            startX: event.clientX,
            startY: event.clientY,
            startPos: posRef.current,
            lastX: event.clientX,
            lastTime: event.timeStamp,
            speed: 0,
        };
    }, [stopFrame]);

    const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) {
            return;
        }
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (drag.axis === 'none') {
            // Wait for a real gesture before locking an axis, so a tap on a lyric line stays a tap.
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
                return;
            }
            drag.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
            if (drag.axis === 'x') {
                event.currentTarget.setPointerCapture?.(event.pointerId);
            }
        }
        if (drag.axis !== 'x') {
            return;
        }
        const width = pagerRef.current?.clientWidth || 1;
        let next = drag.startPos - dx / width;
        // Rubber band past the first and last page: the strip gives, but never runs away.
        if (next < 0) {
            next *= 0.32;
        } else if (next > 1) {
            next = 1 + (next - 1) * 0.32;
        }
        const elapsed = event.timeStamp - drag.lastTime;
        if (elapsed > 0) {
            drag.speed = (event.clientX - drag.lastX) / elapsed;
            drag.lastX = event.clientX;
            drag.lastTime = event.timeStamp;
        }
        applyPos(next);
    }, [applyPos]);

    const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) {
            return;
        }
        dragRef.current = null;
        if (drag.axis !== 'x') {
            return;
        }
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        const base = Math.round(drag.startPos);
        const pos = posRef.current;
        let target = base;
        if (!cancelled && Math.abs(drag.speed) > FLING_SPEED) {
            target = drag.speed < 0 ? base + 1 : base - 1;
        } else if (Math.abs(pos - base) > COMMIT_RATIO) {
            target = pos > base ? base + 1 : base - 1;
        }
        commit(Math.min(PAGES.length - 1, Math.max(0, target)));
    }, [commit]);

    const goToPage = useCallback((next: MinimalPlayerPage) => {
        commit(next === 'lyrics' ? 1 : 0);
    }, [commit]);

    const style = {
        '--min-base': palette.base,
        '--min-field-1': palette.fieldPrimary,
        '--min-field-2': palette.fieldSecondary,
        '--min-bloom': palette.bloom,
        '--min-accent': palette.accent,
        // The shared stage menu paints with these; defined here so it needs no second skin.
        '--mps-glass': light ? 'rgb(247 251 248 / 92%)' : 'rgb(11 26 22 / 88%)',
        '--mps-border': light ? 'rgb(16 35 29 / 12%)' : 'rgb(255 255 255 / 14%)',
        '--mps-track': light ? 'rgb(16 35 29 / 8%)' : 'rgb(255 255 255 / 10%)',
        '--mps-ink': light ? '#10231d' : '#f4faf6',
        '--mps-accent': palette.accent,
    } as React.CSSProperties;

    const paused = !playing || hidden || underStage;
    const likeContext = controls?.slotContext;

    return (
        <div
            className="min"
            data-player-surface-ready="true"
            data-under-stage={underStage || undefined}
            data-covered={covered || undefined}
            inert={underStage || undefined}
            style={style}
            data-theme={light ? 'light' : 'dark'}
            data-page={page}
            data-phase={phase === 'idle' ? undefined : phase}
            data-testid="minimal-stage"
            data-chrome-hidden={chrome.hidden || undefined}
        >
            <MinimalAmbience palette={palette} paused={paused} still={still} />

            <header className="min-top">
                <button
                    type="button"
                    className="min-icon"
                    aria-label={t('mobileStage.back')}
                    onClick={() => runMinimalStageExit(() => chrome.onBack())}
                    data-testid="minimal-collapse"
                >
                    <ChevronDown size={23} strokeWidth={1.8} />
                </button>
                <div className="min-top__actions">
                    <button
                        type="button"
                        className="min-icon min-icon--like"
                        aria-label={t(likeContext?.isLiked ? 'mobileStage.unlike' : 'mobileStage.like')}
                        aria-pressed={likeContext?.isLiked || undefined}
                        disabled={!likeContext || likeContext.likeDisabled}
                        onClick={() => likeContext?.onLike()}
                    >
                        <Heart size={21} strokeWidth={1.8} fill={likeContext?.isLiked ? 'currentColor' : 'none'} />
                    </button>
                    {page === 'lyrics' ? (
                        <button
                            type="button"
                            className="min-icon min-icon--stage"
                            aria-label={t('minimalStage.openStage')}
                            title={t('minimalStage.openStage')}
                            onClick={openStage}
                            data-testid="minimal-open-stage"
                        >
                            <AudioLines size={21} strokeWidth={1.8} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="min-icon"
                            aria-label={t('mobileStage.more')}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            data-min-more="true"
                            onClick={() => setMenuOpen(value => !value)}
                        >
                            <MoreHorizontal size={22} strokeWidth={1.9} />
                        </button>
                    )}
                    {menuOpen && (
                        <div className="min-menu">
                            <MobileStageMenu onClose={closeMenu} />
                        </div>
                    )}
                </div>
            </header>

            <div
                className="min-pager"
                ref={pagerRef}
                data-page={page}
                aria-label={t('minimalStage.pages')}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={event => endDrag(event, true)}
            >
                <div className="min-track" ref={trackRef}>
                    {PAGES.map(id => (
                        <section
                            key={id}
                            className="min-page"
                            data-page-id={id}
                            aria-hidden={page === id ? undefined : true}
                            // The off-screen page is inert: its lyric lines are buttons, and tabbing
                            // into a page the listener cannot see is how focus gets lost behind the
                            // fold.
                            inert={page === id ? undefined : true}
                        >
                            {id === 'cover' ? (
                                <MinimalCoverPage
                                    song={song}
                                    controls={controls ?? EMPTY_CONTROLS}
                                    playing={!!playing && !underStage}
                                    onOpenArtist={chrome.onOpenArtist}
                                    sleeveRef={sleeveRef}
                                    metaRef={coverMetaRef}
                                />
                            ) : (
                                <MinimalLyricsPage
                                    song={song}
                                    lyrics={lyrics}
                                    coverUrl={coverUrl}
                                    controls={controls ?? EMPTY_CONTROLS}
                                    onOpenArtist={chrome.onOpenArtist}
                                    active={page === 'lyrics' && !hidden && !underStage}
                                    still={still}
                                    identityRef={lyricsIdRef}
                                />
                            )}
                        </section>
                    ))}
                </div>
            </div>

            {controls && <MinimalTransport controls={controls} />}

            <div className="min-dots" role="tablist" aria-label={t('minimalStage.pages')}>
                {PAGES.map((id, index) => (
                    <button
                        key={id}
                        ref={element => { dotRefs.current[index] = element; }}
                        type="button"
                        role="tab"
                        className="min-dot"
                        aria-selected={page === id}
                        aria-label={t(id === 'cover' ? 'minimalStage.coverPage' : 'minimalStage.lyricsPage')}
                        data-active={page === id || undefined}
                        onClick={() => goToPage(id)}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Stand-in for the controls when nothing is loaded yet.
 *
 * The pages are pure renderers, so an empty model is enough to paint the "nothing playing" state —
 * and it keeps the pager (and the dots) present instead of the screen collapsing mid-transition.
 */
const EMPTY_CONTROLS = {
    controlsDisabled: true,
    canTogglePlay: false,
    duration: 0,
    playerState: PlayerState.IDLE,
    currentSong: null,
    audioSrc: null,
    trackNavigation: undefined,
    slotContext: undefined,
    onSeek: () => { },
    onTogglePlay: () => { },
    theme: undefined,
    isDaylight: false,
} as unknown as Controls;
