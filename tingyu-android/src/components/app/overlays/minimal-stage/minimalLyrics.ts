import type { Line, LyricData, SubtitleContentMode } from '../../../../types';
import { buildLineGraphemeTimeline, splitLyricGraphemes, type GraphemeTiming } from '../../../../utils/lyrics/graphemeTiming';

// src/components/app/overlays/minimal-stage/minimalLyrics.ts
// Read-only helpers over the lyric set the app already resolved.
//
// The minimal lyric page must not parse, retime or re-order anything: it renders the same `Line[]`
// the stage renders, and asks the same grapheme timing builder where each character starts. Only the
// lookups live here, so they can be tested without a DOM.

export const hasLyricLines = (lyrics: LyricData | null | undefined): boolean => (
    Boolean(lyrics?.lines?.some(line => line.fullText?.trim() || line.words?.length))
);

/** Start times in the same order as the lines; used for one binary search per clock tick. */
export const buildLineStarts = (lines: readonly Line[]): number[] => lines.map(line => line.startTime);

/**
 * Index of the line that is playing at `time`, or -1 before the first line begins.
 *
 * `starts` is expected ascending — the lyric pipeline sorts lines by time — but a non-monotonic set
 * is tolerated: the scan below simply finds the last start that is not after `time`.
 */
export const findActiveLineIndex = (starts: readonly number[], time: number): number => {
    if (!starts.length || !Number.isFinite(time) || time < starts[0]) {
        return -1;
    }
    let low = 0;
    let high = starts.length - 1;
    let found = 0;
    while (low <= high) {
        const middle = (low + high) >> 1;
        if (starts[middle] <= time) {
            found = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return found;
};

const timingCache = new WeakMap<Line, GraphemeTiming[]>();

/** Per-line grapheme timings, memoised on the line object the lyric pipeline owns. */
export const lineGraphemeTimings = (line: Line): GraphemeTiming[] => {
    const cached = timingCache.get(line);
    if (cached) {
        return cached;
    }
    const built = buildLineGraphemeTimeline(line);
    timingCache.set(line, built);
    return built;
};

/**
 * How many characters of `timings` have already been sung at `time`.
 *
 * A linear scan rather than a binary search on purpose: a lyric line is a few dozen characters, and
 * the builder guarantees non-decreasing end times only for well-formed input — a scan stays correct
 * for the malformed one too.
 */
export const countSungGraphemes = (timings: readonly GraphemeTiming[], time: number): number => {
    let sung = 0;
    for (const timing of timings) {
        if (timing.endTime > time) {
            break;
        }
        sung += 1;
    }
    return sung;
};

/** The characters to render for a line, falling back to the line's own text when timings are empty. */
export const lineGraphemes = (line: Line): string[] => {
    const timings = lineGraphemeTimings(line);
    if (timings.length) {
        return timings.map(timing => timing.char);
    }
    return splitLyricGraphemes(line.fullText ?? '');
};

/**
 * Secondary row shown under a lyric line.
 *
 * The stage has one global subtitle preference; the minimal page follows it rather than inventing a
 * second switch. 'both' stacks romanization above translation there, so here it prefers the
 * translation and only falls back to the romanization.
 */
export const resolveSecondaryText = (line: Line, mode: SubtitleContentMode): string | null => {
    if (mode === 'none') {
        return null;
    }
    if (mode === 'romanization') {
        return line.romanization?.trim() || null;
    }
    return line.translation?.trim() || (mode === 'both' ? line.romanization?.trim() || null : null);
};

/** Empty/whitespace lines are kept by the parser as instrumental gaps; the page renders them as a beat. */
export const isEmptyLine = (line: Line): boolean => !(line.fullText ?? '').trim();
