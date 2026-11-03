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

// ---------------------------------------------------------------- production credits
//
// Many LRC files carry the production list as ordinary timed lines — 歌名-歌手, 词：, 作曲：, 编曲：,
// 制作人 — and on this page they arrive at the same size as the singing, which is why three credit
// lines can fill a screen before the first word is sung. They are still timed lines, so nothing here
// may remove them, retime them or move them: only the *weight* they are drawn at changes, and only on
// this page. The stage keeps its own rendering untouched.
//
// The recognition is deliberately narrow, because a false positive demotes a real line of the song.
// A line counts as a credit only when it is short, sits in the file's head, carries a known credit
// label (optionally behind a bracket), and does not end with the punctuation a sung line would end
// with. Anything uncertain stays a lyric.

const CREDIT_LABELS = [
    // 简体 / 繁體, the common head-of-file forms first.
    '作词', '作詞', '填词', '填詞', '作曲', '编曲', '編曲', '配唱', '和声', '和聲',
    '词', '曲', '詞',
    '制作人', '製作人', '制作', '製作', '监制', '監製', '统筹', '統籌', '出品', '发行', '發行',
    '混音', '母带', '母帶', '录音', '錄音', '录音师', '錄音師', '混音师', '母带师',
    '吉他', '贝斯', '貝斯', '鼓', '键盘', '鍵盤', '弦乐', '弦樂', '管弦', '萨克斯', '小提琴', '大提琴',
    '和音', '伴唱', '和声编写', '文案', '企划', '企劃', '封面', 'MV', '字幕',
    // English forms seen in NetEase and Apple-style LRC heads.
    'lyricist', 'lyrics by', 'lyrics', 'composer', 'composed by', 'composition', 'arranger',
    'arranged by', 'producer', 'produced by', 'production', 'written by', 'written', 'mixed by',
    'mixing', 'mastered by', 'mastering', 'recorded by', 'recording', 'vocal', 'vocals', 'guitar',
    'bass', 'drums', 'keyboard', 'piano', 'strings', 'saxophone', 'violin', 'cello', 'chorus',
    'a&r', 'publishing', 'copyright', 'op', 'sp',
];

/**
 * A credit is a list of names; even a crowded one with four writers is under twenty characters. The
 * cap is what keeps a long lyric line that happens to open with one of these words out of the set.
 */
const CREDIT_MAX_GRAPHEMES = 24;

/** Bracket characters a credit is often wrapped in; stripped before the label check. */
const LEADING_BRACKETS = /^[（(【\[]+/;

/** What a sung line ends with. A credit ends with a name, so this is the strongest exclusion. */
const LYRIC_ENDING = /[，。！？…、；：!?,;.]$/;

const CREDIT_SEPARATOR = /^\s*[：:／/·•\-—–】」』）)]\s*\S/;

/**
 * Whether what follows the label looks like the start of a name.
 *
 * Punctuation always does. A bare space does too for a CJK label — "作词 李焯雄" is a real LRC form —
 * and for the "... by" labels, because "Produced by Someone" is how those are written. A bare space
 * after a Latin label like `guitar` or `drums` deliberately does *not*: "guitar solo" is a lyric, and
 * this is the one place a false positive is worse than a missed credit.
 */
const separatorAfterLabel = (label: string, rest: string): boolean => {
    if (CREDIT_SEPARATOR.test(rest)) {
        return true;
    }
    if (!/^\s+\S/.test(rest)) {
        return false;
    }
    return /[^\x00-\x7F]/.test(label) || /by$/.test(label);
};

const isCreditLabelled = (text: string): boolean => {
    const lowered = text.toLowerCase();
    return CREDIT_LABELS.some(label => lowered.startsWith(label) && separatorAfterLabel(label, text.slice(label.length)));
};

/**
 * Whether a timed line is production information rather than a sung line.
 *
 * `index` is the line's position in the resolved set. Only the very first line may be recognised as a
 * "歌名 - 歌手" title credit, because a dash inside a lyric is not rare, and being first is what makes
 * the title reading plausible.
 */
export const isProductionCreditLine = (line: Line, index: number): boolean => {
    const text = (line.fullText ?? '').trim();
    if (!text || text.length > CREDIT_MAX_GRAPHEMES || LYRIC_ENDING.test(text)) {
        return false;
    }
    const bare = text.replace(LEADING_BRACKETS, '').trim();
    if (isCreditLabelled(bare)) {
        return true;
    }
    // "歌名 - 歌手" / "歌手 - 歌名": only ever the first line, only ever one dash, and never a line
    // that already carries a lyric punctuation mark.
    if (index === 0) {
        const parts = text.split(/\s*[—–-]\s*/);
        if (parts.length === 2 && parts[0].length > 0 && parts[1].length > 0
            && parts[0].length <= 32 && parts[1].length <= 40) {
            return true;
        }
    }
    return false;
};
