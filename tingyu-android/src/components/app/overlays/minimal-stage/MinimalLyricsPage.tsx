import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LyricData } from '../../../../types';
import type { AppOverlaysModel } from '../buildAppOverlaysModel';
import { lyricCurrentTime } from '../../../../stores/motionSignals';
import { useTypographySettingsStore } from '../../../../stores/useTypographySettingsStore';
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

type Controls = NonNullable<AppOverlaysModel['floatingControls']>;

/** Roughly a third down the column: the current line stays put and the page reads forward. */
const ACTIVE_LINE_ANCHOR = 0.32;
const MANUAL_SCROLL_HOLD_MS = 4000;

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
    controls,
    active,
    still,
}: {
    song: { title: string; artist: string } | null;
    lyrics: LyricData | null;
    controls: Controls;
    /** Whether this is the page on screen; a hidden page must not drive its own repaints. */
    active: boolean;
    still: boolean;
}) {
    const { t } = useTranslation();
    const subtitleMode = useTypographySettingsStore(state => state.subtitleContentMode);
    const lines = useMemo(() => lyrics?.lines ?? [], [lyrics]);
    const starts = useMemo(() => buildLineStarts(lines), [lines]);
    const hasLyrics = hasLyricLines(lyrics);
    const scroller = useRef<HTMLDivElement>(null);
    const lineEls = useRef<Array<HTMLDivElement | null>>([]);
    const activeIndexRef = useRef(-1);
    const sungRef = useRef(0);
    const manualUntil = useRef(0);
    const [activeIndex, setActiveIndex] = useState(-1);
    const disabled = !!controls.controlsDisabled;

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
        const target = element.offsetTop - box.clientHeight * ACTIVE_LINE_ANCHOR
            + element.offsetHeight / 2 - box.clientHeight / 6;
        box.scrollTo({ top: Math.max(0, target), behavior: still ? 'auto' : 'smooth' });
    }, [activeIndex, active, still]);

    const markManual = useCallback(() => {
        manualUntil.current = Date.now() + MANUAL_SCROLL_HOLD_MS;
    }, []);

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
        <div className="min-lyrics" data-testid="minimal-lyrics-page">
            <header className="min-lyrics__head">
                <h2 className="min-lyrics__title" title={title}>{title}</h2>
                {artist && <p className="min-lyrics__artist" title={artist}>{artist}</p>}
                <span className="min-lyrics__rule" aria-hidden="true" />
            </header>
            {hasLyrics ? (
                <div
                    ref={scroller}
                    className="min-lyrics__scroll"
                    onPointerDown={markManual}
                    onWheel={markManual}
                    onTouchMove={markManual}
                    data-testid="minimal-lyrics-scroll"
                >
                    <div className="min-lyrics__column">
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
                    <p>{t('minimalStage.noLyrics')}</p>
                </div>
            )}
        </div>
    );
}
