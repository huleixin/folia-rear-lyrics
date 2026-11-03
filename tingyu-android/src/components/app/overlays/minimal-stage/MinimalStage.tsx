import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import './minimalStage.css';

// src/components/app/overlays/minimal-stage/MinimalStage.tsx
// The minimal front stage: two pages, one transport, one ambient background.
//
// This is a presentation layer over the playback the app already runs. It mounts in place of the
// visualizer renderer, so entering or leaving it never rebuilds the audio pipeline, the lyric
// parser or the MediaSession — the same `currentSong`, the same `lyricCurrentTime`, the same queue.
//
// Paging is a scroll-snap strip rather than a gesture handler: the browser then owns the axis lock,
// which is what keeps a vertical lyric scroll from stealing a horizontal page swipe (and a seek on
// the progress bar from doing either). No per-frame JS runs while a page is being dragged.

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;

const PAGES: MinimalPlayerPage[] = ['cover', 'lyrics'];

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
    const light = !!controls?.isDaylight;
    const song = chrome.song;
    const coverUrl = song?.coverUrl ?? null;
    const lyrics = usePlaybackStore(state => state.lyrics);
    const coverColors = useCoverColors(coverUrl);
    const still = useReducedMotionFor('monetBackground');
    const hidden = usePageHidden();
    const pagerRef = useRef<HTMLDivElement>(null);
    const scrollFrame = useRef(0);
    const [menuOpen, setMenuOpen] = useState(false);
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

    // Restore the remembered page without an animation on the first frame.
    useEffect(() => {
        const pager = pagerRef.current;
        if (!pager) {
            return;
        }
        pager.scrollLeft = index * pager.clientWidth;
        // Intentionally mount-only: afterwards the strip itself owns the position.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Someone else moved the page (settings, a test, a rotation while on page 2).
    useEffect(() => {
        const pager = pagerRef.current;
        if (!pager) {
            return;
        }
        const target = index * pager.clientWidth;
        if (Math.abs(pager.scrollLeft - target) > 2) {
            pager.scrollTo({ left: target, behavior: still ? 'auto' : 'smooth' });
        }
    }, [index, still]);

    const onScroll = useCallback(() => {
        if (scrollFrame.current) {
            return;
        }
        scrollFrame.current = window.requestAnimationFrame(() => {
            scrollFrame.current = 0;
            const pager = pagerRef.current;
            if (!pager) {
                return;
            }
            // Half a page is the commit point: a small overscroll must not flip the dots.
            const next: MinimalPlayerPage = pager.scrollLeft > pager.clientWidth * 0.5 ? 'lyrics' : 'cover';
            if (usePlayerViewModeStore.getState().page !== next) {
                setPage(next);
            }
        });
    }, [setPage]);

    useEffect(() => () => {
        if (scrollFrame.current) {
            window.cancelAnimationFrame(scrollFrame.current);
        }
    }, []);

    const goToPage = useCallback((next: MinimalPlayerPage) => {
        const pager = pagerRef.current;
        setPage(next);
        pager?.scrollTo({ left: (next === 'lyrics' ? 1 : 0) * pager.clientWidth, behavior: still ? 'auto' : 'smooth' });
    }, [setPage, still]);

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

    const paused = !playing || hidden;
    const likeContext = controls?.slotContext;

    return (
        <div
            className="min"
            style={style}
            data-theme={light ? 'light' : 'dark'}
            data-testid="minimal-stage"
            data-chrome-hidden={chrome.hidden || undefined}
        >
            <MinimalAmbience palette={palette} paused={paused} still={still} />

            <header className="min-top">
                <button
                    type="button"
                    className="min-icon"
                    aria-label={t('mobileStage.back')}
                    onClick={chrome.onBack}
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
                onScroll={onScroll}
                data-page={page}
                aria-label={t('minimalStage.pages')}
            >
                {PAGES.map(id => (
                    <section
                        key={id}
                        className="min-page"
                        data-page-id={id}
                        aria-hidden={page === id ? undefined : true}
                        // The off-screen page is inert: its lyric lines are buttons, and tabbing into
                        // a page the listener cannot see is how focus gets lost behind the fold.
                        inert={page === id ? undefined : true}
                    >
                        {id === 'cover' ? (
                            <MinimalCoverPage song={song} controls={controls ?? EMPTY_CONTROLS} />
                        ) : (
                            <MinimalLyricsPage
                                song={song}
                                lyrics={lyrics}
                                controls={controls ?? EMPTY_CONTROLS}
                                active={page === 'lyrics' && !hidden}
                                still={still}
                            />
                        )}
                    </section>
                ))}
            </div>

            {controls && <MinimalTransport controls={controls} />}

            <div className="min-dots" role="tablist" aria-label={t('minimalStage.pages')}>
                {PAGES.map(id => (
                    <button
                        key={id}
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
