import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines, ChevronRight } from 'lucide-react';
import type { LyricData } from '../../../../types';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import { lyricCurrentTime } from '../../../../stores/motionSignals';
import { useTypographySettingsStore } from '../../../../stores/useTypographySettingsStore';
import MinimalArtwork from './MinimalArtwork';
import {
    buildLineStarts,
    countSungGraphemes,
    findActiveLineIndex,
    isEmptyLine,
    lineGraphemeTimings,
    lineGraphemes,
    hasLyricLines,
    resolveSecondaryText,
} from './minimalLyrics';

// src/components/app/overlays/minimal-stage/MinimalLyricsPage.tsx
// Right phone of the reference: the lyric set the stage is already showing, laid out as a column.
//
// The three rules that keep this honest and cheap:
//   · no clock of its own — the page subscribes to `lyricCurrentTime`, the same MotionValue the
//     visualizer reads, so a manual offset or a seek moves both by exactly the same amount;
//   · no React state per frame — the active line index is the only state, and the sung/unsung split
//     is written straight onto the characters that changed;
//   · no scrolling while the listener is scrolling — auto-follow yields for a few seconds after a
//     manual gesture, and resumes on the next line boundary.
//
// Following is driven by a short rAF tween rather than `scrollTo({behavior:'smooth'})`: the
// platform's smooth scroll has no duration to set, runs at a speed that reads as a jump on a long
// lyric, and cannot be bounded — a tap on the last line would scroll for over a second. The tween
// below never takes longer than ~460ms no matter how far it goes.

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;

/** Roughly a third down the column: the current line stays put and the page reads forward. */
const ACTIVE_LINE_ANCHOR = 0.32;
const MANUAL_SCROLL_HOLD_MS = 4000;
/** Long jumps stop getting slower here; past this a scroll is a cut, not a journey. */
const SCROLL_MAX_MS = 460;
const SCROLL_BASE_MS = 240;

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

const clearSung = (element: HTMLElement) => {
    element.querySelectorAll<HTMLElement>('[data-ch]').forEach(span => span.removeAttribute('data-sung'));
};

/** Writes only the characters whose state actually changed. */
const paintSung = (element: HTMLElement, from: number, to: number) => {
    const spans = element.querySelectorAll<HTMLElement>('[data-ch]');
    const low = Math.min(from, to);
    const high = Math.max(from, to);
    for (let index = low; index < high && index < spans.length; index += 1) {
        const span = spans[index];
        if (!span) {
            continue;
        }
        if (index < to) {
            span.setAttribute('data-sung', '');
        } else {
            span.removeAttribute('data-sung');
        }
    }
};

export default function MinimalLyricsPage({
    song,
    lyrics,
    coverUrl,
    controls,
    active,
    still,
    identityRef,
}: {
    song: { title: string; artist: string } | null;
    lyrics: LyricData | null;
    coverUrl: string | null;
    controls: Controls;
    /** Whether this is the page on screen; a hidden page must not drive its own repaints. */
    active: boolean;
    still: boolean;
    /** The thumbnail-and-titles row; the gesture frame fades it in as the page arrives. */
    identityRef?: React.Ref<HTMLDivElement>;
}) {
    const { t } = useTranslation();
    const subtitleMode = useTypographySettingsStore(state => state.subtitleContentMode);
    // The same scale the stage uses. Bounded here: this page is a reading column, so a 1.6x setting
    // would cost two lyric lines per screen and push the transport around.
    const fontScale = useTypographySettingsStore(state => state.lyricsFontScale);
    const lines = useMemo(() => lyrics?.lines ?? [], [lyrics]);
    const starts = useMemo(() => buildLineStarts(lines), [lines]);
    const hasLyrics = hasLyricLines(lyrics);
    const scroller = useRef<HTMLDivElement>(null);
    const lineEls = useRef<Array<HTMLDivElement | null>>([]);
    const activeIndexRef = useRef(-1);
    const sungRef = useRef(0);
    const manualUntil = useRef(0);
    const frame = useRef(0);
    /** A new lyric set must land on its first line, not glide there from the previous song. */
    const snapNext = useRef(true);
    const [activeIndex, setActiveIndex] = useState(-1);
    const disabled = !!controls.controlsDisabled;

    // Identity of the lyric set, not of the song: a re-resolved lyric for the same song is a new set
    // too, and must not blend into the old one on screen.
    const lyricToken = useMemo(
        () => `${lines.length}|${lines[0]?.startTime ?? -1}|${song?.title ?? ''}`,
        [lines, song?.title],
    );

    const stopFrame = useCallback(() => {
        if (frame.current) {
            window.cancelAnimationFrame(frame.current);
            frame.current = 0;
        }
    }, []);

    const animateScroll = useCallback((box: HTMLDivElement, top: number, instant: boolean) => {
        stopFrame();
        const max = Math.max(0, box.scrollHeight - box.clientHeight);
        const target = Math.min(max, Math.max(0, top));
        const from = box.scrollTop;
        const distance = Math.abs(target - from);
        if (instant || still || distance < 1) {
            box.scrollTop = target;
            return;
        }
        const duration = Math.min(SCROLL_MAX_MS, SCROLL_BASE_MS + distance * 0.34);
        const started = performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - started) / duration);
            box.scrollTop = from + (target - from) * easeOutCubic(progress);
            if (progress < 1) {
                frame.current = window.requestAnimationFrame(step);
            } else {
                frame.current = 0;
            }
        };
        frame.current = window.requestAnimationFrame(step);
    }, [still, stopFrame]);

    const paintLine = useCallback((index: number, time: number) => {
        if (index < 0) {
            return;
        }
        const element = lineEls.current[index];
        if (!element) {
            return;
        }
        const sung = countSungGraphemes(lineGraphemeTimings(lines[index]), time);
        if (sung === sungRef.current) {
            return;
        }
        paintSung(element, sungRef.current, sung);
        sungRef.current = sung;
    }, [lines]);

    // A new lyric set starts at the top of its own column.
    useLayoutEffect(() => {
        const box = scroller.current;
        if (box) {
            stopFrame();
            box.scrollTop = 0;
        }
        snapNext.current = true;
    }, [lyricToken, stopFrame]);

    // One subscription, and only while the page is on screen. A new lyric set re-anchors it.
    useEffect(() => {
        activeIndexRef.current = -1;
        sungRef.current = 0;
        lineEls.current.forEach(element => { if (element) clearSung(element); });
        setActiveIndex(-1);
        if (!active || !lines.length) {
            return;
        }
        const apply = (time: number) => {
            const index = findActiveLineIndex(starts, time);
            if (index !== activeIndexRef.current) {
                const previous = lineEls.current[activeIndexRef.current];
                if (previous) {
                    clearSung(previous);
                }
                activeIndexRef.current = index;
                sungRef.current = 0;
                setActiveIndex(index);
                paintLine(index, time);
                return;
            }
            paintLine(index, time);
        };
        apply(lyricCurrentTime.get());
        return lyricCurrentTime.on('change', apply);
    }, [active, lines, starts, paintLine]);

    // Keep the current line where the reader's eye already is.
    useEffect(() => {
        if (activeIndex < 0 || !active) {
            return;
        }
        const element = lineEls.current[activeIndex];
        const box = scroller.current;
        if (!element || !box) {
            return;
        }
        if (Date.now() < manualUntil.current) {
            return;
        }
        const anchor = box.clientHeight * ACTIVE_LINE_ANCHOR;
        const snap = snapNext.current;
        snapNext.current = false;
        animateScroll(box, element.offsetTop + element.offsetHeight / 2 - anchor, snap);
    }, [activeIndex, active, still, animateScroll]);

    useEffect(() => () => stopFrame(), [stopFrame]);

    const markManual = useCallback(() => {
        manualUntil.current = Date.now() + MANUAL_SCROLL_HOLD_MS;
        // A hand on the list wins over the follow tween, immediately and unconditionally.
        stopFrame();
    }, [stopFrame]);

    const seekToLine = useCallback((time: number) => {
        if (disabled) {
            return;
        }
        // A tap is an instruction about where playback should be, not about where the list is.
        manualUntil.current = 0;
        controls.onSeek(time);
    }, [controls, disabled]);

    const title = song?.title || t('mobileLibrary.nothingPlaying');
    const artist = song?.artist || '';

    return (
        <div
            className="min-lyrics"
            data-testid="minimal-lyrics-page"
            style={{ '--min-lyric-scale': Math.min(1.3, Math.max(0.85, fontScale || 1)) } as React.CSSProperties}
        >
            <header className="min-lyrics__head">
                <div className="min-lyrics__id" ref={identityRef}>
                    <div className="min-lyrics__thumb">
                        {/* Decorative: the title it would describe is right beside it. */}
                        <MinimalArtwork url={coverUrl} alt="" className="min-art--thumb" />
                    </div>
                    <div className="min-lyrics__titles">
                        <h2 className="min-lyrics__title" title={title}>{title}</h2>
                        {artist && (
                            <p className="min-lyrics__artist" title={artist}>
                                <span>{artist}</span>
                                <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
                            </p>
                        )}
                    </div>
                </div>
                <span className="min-lyrics__rule" aria-hidden="true" />
            </header>
            {hasLyrics ? (
                <div
                    ref={scroller}
                    className="min-lyrics__scroll"
                    onPointerDown={markManual}
                    onWheel={markManual}
                    data-testid="minimal-lyrics-scroll"
                >
                    <div className="min-lyrics__column" key={lyricToken}>
                        {lines.map((line, index) => {
                            const secondary = resolveSecondaryText(line, subtitleMode);
                            return (
                                <div
                                    key={`${index}-${line.startTime}`}
                                    ref={element => { lineEls.current[index] = element; }}
                                    className="min-line"
                                    data-active={index === activeIndex || undefined}
                                    data-past={index < activeIndex || undefined}
                                >
                                    <button
                                        type="button"
                                        className="min-line__text"
                                        disabled={disabled}
                                        onClick={() => seekToLine(line.startTime)}
                                        aria-current={index === activeIndex ? 'true' : undefined}
                                    >
                                        {isEmptyLine(line) ? (
                                            <span className="min-line__beat" aria-hidden="true">·</span>
                                        ) : (
                                            lineGraphemes(line).map((char, charIndex) => (
                                                <span key={charIndex} data-ch="">{char}</span>
                                            ))
                                        )}
                                    </button>
                                    {secondary && !isEmptyLine(line) && (
                                        <p className="min-line__secondary">{secondary}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="min-lyrics__empty" data-testid="minimal-lyrics-empty">
                    <AudioLines size={22} strokeWidth={1.4} aria-hidden="true" />
                    <p>{t('minimalStage.noLyrics')}</p>
                </div>
            )}
        </div>
    );
}
