// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
    buildMinimalPalette,
    blendHue,
    constrain,
    emberShift,
    hslToRgb,
    pickCoverColors,
    quantizeSamples,
    rgbToHsl,
    TINGYU_INK_HUE,
} from '../../src/components/app/overlays/minimal-stage/minimalPalette';
import {
    buildLineStarts,
    countSungGraphemes,
    findActiveLineIndex,
    hasLyricLines,
    isEmptyLine,
    lineGraphemeTimings,
    resolveSecondaryText,
} from '../../src/components/app/overlays/minimal-stage/minimalLyrics';
import {
    isLosslessContainer,
    resolveContainerBadge,
    resolveQualityBadges,
} from '../../src/components/app/overlays/minimal-stage/minimalQuality';
import {
    MINIMAL_PLAYER_PAGE_KEY,
    PLAYER_VIEW_MODE_KEY,
    isMinimalPlayerView,
    isStageSurface,
    readStoredMinimalPage,
    readStoredPlayerViewMode,
    usePlayerViewModeStore,
} from '../../src/stores/usePlayerViewModeStore';
import type { Line } from '../../src/types';

// test/unit/minimalStage.test.ts
// The minimal front stage is mostly presentation, so what is worth pinning down is the handful of
// rules that decide what it shows: which lyric line is current, how much of it is sung, which colours
// the background is allowed to use, and which view the player restores.

const line = (text: string, start: number, end: number, extra: Partial<Line> = {}): Line => ({
    fullText: text,
    startTime: start,
    endTime: end,
    words: [],
    ...extra,
});

describe('minimal palette', () => {
    it('round-trips a colour through HSL without drifting', () => {
        for (const color of [{ r: 12, g: 240, b: 33 }, { r: 255, g: 0, b: 0 }, { r: 90, g: 90, b: 90 }]) {
            const back = hslToRgb(rgbToHsl(color));
            expect(Math.abs(back.r - color.r)).toBeLessThanOrEqual(1);
            expect(Math.abs(back.g - color.g)).toBeLessThanOrEqual(1);
            expect(Math.abs(back.b - color.b)).toBeLessThanOrEqual(1);
        }
    });

    it('moves hue along the short way round the circle', () => {
        expect(blendHue(350, 10, 0.5)).toBeCloseTo(0, 5);
        expect(blendHue(10, 350, 0.5)).toBeCloseTo(0, 5);
        expect(blendHue(100, 140, 0)).toBe(100);
        expect(blendHue(100, 140, 1)).toBeCloseTo(140, 5);
    });

    it('clamps saturation and lightness into the band the page can carry', () => {
        const glare = constrain({ h: 40, s: 1, l: 0.99 }, { s: [0.2, 0.4], l: [0.1, 0.3] });
        expect(glare.s).toBe(0.4);
        expect(glare.l).toBe(0.3);
        const mud = constrain({ h: 40, s: 0.01, l: 0.01 }, { s: [0.2, 0.4], l: [0.1, 0.3] });
        expect(mud.s).toBe(0.2);
        expect(mud.l).toBe(0.1);
    });

    it('ignores near-black, near-white and grey pixels when building the histogram', () => {
        const buckets = quantizeSamples([
            { r: 3, g: 4, b: 5 },
            { r: 250, g: 251, b: 252 },
            { r: 128, g: 128, b: 128 },
        ]);
        expect(buckets).toHaveLength(0);
    });

    it('refuses to describe a cover with almost no usable colour', () => {
        expect(pickCoverColors([])).toBeNull();
        const few = quantizeSamples([{ r: 180, g: 90, b: 40 }, { r: 170, g: 95, b: 45 }]);
        expect(pickCoverColors(few)).toBeNull();
    });

    it('lights the page with the artwork mean rather than its loudest pixel', () => {
        const samples = [
            ...Array.from({ length: 40 }, () => ({ r: 150, g: 110, b: 80 })),
            ...Array.from({ length: 4 }, () => ({ r: 30, g: 255, b: 60 })),
        ];
        const colors = pickCoverColors(quantizeSamples(samples))!;
        expect(colors).not.toBeNull();
        // The mean stays warm; the saturated green only wins the accent slot.
        expect(colors.average.h).toBeLessThan(60);
        expect(colors.accent.h).toBeGreaterThan(90);
    });

    it('keeps the dark theme inside the ink-green band and the light theme on paper', () => {
        const colors = {
            primary: { h: 20, s: 0.9, l: 0.6 },
            secondary: { h: 210, s: 0.8, l: 0.5 },
            accent: { h: 340, s: 0.9, l: 0.7 },
            average: { h: 20, s: 0.6, l: 0.5 },
        };
        const dark = buildMinimalPalette(colors, 'dark');
        const light = buildMinimalPalette(colors, 'light');
        const darkBase = /rgb\((\d+) (\d+) (\d+)\)/.exec(dark.base)!;
        const lightBase = /rgb\((\d+) (\d+) (\d+)\)/.exec(light.base)!;
        const luminance = (match: RegExpExecArray) => (Number(match[1]) * 0.2126 + Number(match[2]) * 0.7152 + Number(match[3]) * 0.0722);
        expect(luminance(darkBase)).toBeLessThan(50);
        expect(luminance(lightBase)).toBeGreaterThan(200);
        // The brand hue survives the artwork's own hue: this is what keeps the two themes siblings.
        expect(dark.base).not.toBe(light.base);
        expect(dark.derived).toBe(true);
    });

    it('reports an underived palette when the theme supplied the colours', () => {
        const themeColors = {
            primary: { h: TINGYU_INK_HUE, s: 0.3, l: 0.2 },
            secondary: { h: TINGYU_INK_HUE, s: 0.3, l: 0.2 },
            accent: { h: TINGYU_INK_HUE, s: 0.5, l: 0.6 },
            average: { h: TINGYU_INK_HUE, s: 0.3, l: 0.2 },
        };
        expect(buildMinimalPalette(themeColors, 'dark', false).derived).toBe(false);
    });

    const hueOf = (css: string) => {
        const match = /rgb\((\d+) (\d+) (\d+)\)/.exec(css)!;
        return rgbToHsl({ r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }).h;
    };
    const ringDistance = (left: number, right: number) => Math.abs(((left - right + 540) % 360) - 180);
    const cover = (hue: number, saturation = 0.8, lightness = 0.5) => ({
        primary: { h: hue, s: saturation, l: lightness },
        secondary: { h: (hue + 40) % 360, s: saturation * 0.9, l: lightness * 0.9 },
        accent: { h: hue, s: saturation, l: 0.7 },
        average: { h: hue, s: saturation * 0.8, l: lightness },
    });

    it('keeps the sung-lyric highlight in the ink family whatever the cover is', () => {
        // The accent is what a sung character turns into. Picking it straight off a sunset sleeve
        // gives lime; pulling it 90% of the way to the ink hue gives the mint the design asks for.
        for (const hue of [25, 100, 200, 330]) {
            const palette = buildMinimalPalette(cover(hue), 'dark');
            expect(ringDistance(hueOf(palette.accent), TINGYU_INK_HUE)).toBeLessThan(24);
        }
    });

    it('does not invent a hue for a colourless cover', () => {
        // A near-grey average has hue 0 in HSL. Clamping its saturation up would paint a red glow
        // behind a black-and-white sleeve.
        const palette = buildMinimalPalette(cover(0, 0.02, 0.5), 'dark');
        expect(ringDistance(hueOf(palette.bloom), TINGYU_INK_HUE)).toBeLessThan(30);
    });

    it('moves the page when the cover moves', () => {
        const warm = buildMinimalPalette(cover(25), 'dark');
        const cool = buildMinimalPalette(cover(210), 'dark');
        expect(ringDistance(hueOf(warm.fieldPrimary), hueOf(cool.fieldPrimary))).toBeGreaterThan(15);
        expect(warm.fieldPrimary).not.toBe(cool.fieldPrimary);
    });

    it('takes its colour from the subject, not from the largest flat area', () => {
        // A sunset sleeve is mostly grey-blue sky. Taking the biggest bucket gave every such cover
        // the same teal page; the chromatic part of the sleeve is what actually describes it.
        const samples = [
            ...Array.from({ length: 400 }, () => ({ r: 110, g: 130, b: 150 })),
            ...Array.from({ length: 60 }, () => ({ r: 220, g: 110, b: 40 })),
        ];
        const colors = pickCoverColors(quantizeSamples(samples))!;
        expect(colors).not.toBeNull();
        expect(ringDistance(colors.primary.h, 30)).toBeLessThan(40);
    });

    it('keeps the page floor on the ink side whatever the sleeve is', () => {
        // The floor is the brand colour; only the mist follows the artwork. Rotating a warm hue most
        // of the way to the ink passes through yellow-green and lands on olive.
        for (const hue of [10, 40, 90, 140, 210, 280, 330]) {
            const palette = buildMinimalPalette(cover(hue), 'dark');
            expect(ringDistance(hueOf(palette.base), TINGYU_INK_HUE)).toBeLessThan(30);
        }
    });

    it('moves amber to ember, and leaves cool hues alone', () => {
        // 40° is gold; gold over an ink floor averages to olive. Ember does not.
        expect(emberShift(40)).toBeLessThan(26);
        expect(emberShift(40)).toBeGreaterThan(15);
        expect(emberShift(210)).toBe(210);
        expect(emberShift(300)).toBe(300);
        expect(emberShift(10)).toBe(10);
    });
});

describe('minimal lyric timing', () => {
    const lines = [line('一', 0, 4), line('二', 4, 8), line('三', 12, 16)];
    const starts = buildLineStarts(lines);

    it('finds the line that is playing, including the gaps between lines', () => {
        expect(findActiveLineIndex(starts, -1)).toBe(-1);
        expect(findActiveLineIndex(starts, 0)).toBe(0);
        expect(findActiveLineIndex(starts, 3.99)).toBe(0);
        expect(findActiveLineIndex(starts, 4)).toBe(1);
        expect(findActiveLineIndex(starts, 10)).toBe(1);
        expect(findActiveLineIndex(starts, 12)).toBe(2);
        expect(findActiveLineIndex(starts, 99)).toBe(2);
    });

    it('has no current line before the first one or without lyrics', () => {
        expect(findActiveLineIndex([], 5)).toBe(-1);
        expect(findActiveLineIndex(buildLineStarts([line('一', 6, 8)]), 1)).toBe(-1);
    });

    it('counts sung characters from the shared grapheme timeline', () => {
        const single = line('我们会一直并肩前行', 0, 9, {
            words: Array.from('我们会一直并肩前行').map((text, index) => ({
                text,
                startTime: index,
                endTime: index + 1,
            })),
        });
        const timings = lineGraphemeTimings(single);
        expect(countSungGraphemes(timings, 0)).toBe(0);
        expect(countSungGraphemes(timings, 2.5)).toBe(2);
        expect(countSungGraphemes(timings, 9)).toBe(9);
        expect(countSungGraphemes([], 9)).toBe(0);
    });

    it('treats a blank line as a beat rather than as text', () => {
        expect(isEmptyLine(line('   ', 0, 1))).toBe(true);
        expect(isEmptyLine(line('词', 0, 1))).toBe(false);
    });

    it('follows the stage subtitle preference instead of inventing its own', () => {
        const translated = line('词', 0, 1, { translation: 'words', romanization: 'ci' });
        expect(resolveSecondaryText(translated, 'none')).toBeNull();
        expect(resolveSecondaryText(translated, 'translation')).toBe('words');
        expect(resolveSecondaryText(translated, 'romanization')).toBe('ci');
        expect(resolveSecondaryText(translated, 'both')).toBe('words');
        const romanizedOnly = line('词', 0, 1, { romanization: 'ci' });
        expect(resolveSecondaryText(romanizedOnly, 'both')).toBe('ci');
    });

    it('recognises a lyric set that only has empty lines as having no lyrics', () => {
        expect(hasLyricLines(null)).toBe(false);
        expect(hasLyricLines({ lines: [] })).toBe(false);
        expect(hasLyricLines({ lines: [line('  ', 0, 1)] })).toBe(false);
        expect(hasLyricLines({ lines: [line('词', 0, 1)] })).toBe(true);
    });
});

describe('minimal quality chips', () => {
    it('reads the container off the stream actually being played', () => {
        expect(resolveContainerBadge('https://x/y.flac')).toEqual({ id: 'container', value: 'FLAC', tone: 'plain' });
        expect(resolveContainerBadge('/music/a.MP3?token=1')?.value).toBe('MP3');
        expect(resolveContainerBadge('https://x/y')).toBeNull();
        expect(resolveContainerBadge(null)).toBeNull();
    });

    it('never claims Hi-Res for a lossy stream', () => {
        expect(resolveQualityBadges(['hires'], 'https://x/y.mp3')).toEqual([
            { id: 'container', value: 'MP3', tone: 'plain' },
        ]);
        expect(resolveQualityBadges(['hires'], 'https://x/y.flac')).toEqual([
            { id: 'container', value: 'FLAC', tone: 'plain' },
            { id: 'spec', value: 'hires', tone: 'gold' },
        ]);
    });

    it('shows nothing at all when neither fact is known', () => {
        expect(resolveQualityBadges(undefined, 'https://cdn/stream/1')).toEqual([]);
        expect(isLosslessContainer('https://x/y.mp3')).toBe(false);
        expect(isLosslessContainer('https://x/y.flac')).toBe(true);
    });
});

describe('player view preference', () => {
    it('defaults to minimal and only an explicit stage selects the stage', () => {
        localStorage.clear();
        expect(readStoredPlayerViewMode()).toBe('minimal');
        expect(readStoredMinimalPage()).toBe('cover');
        localStorage.setItem(PLAYER_VIEW_MODE_KEY, 'stage');
        localStorage.setItem(MINIMAL_PLAYER_PAGE_KEY, 'lyrics');
        expect(readStoredPlayerViewMode()).toBe('stage');
        expect(readStoredMinimalPage()).toBe('lyrics');
        localStorage.setItem(PLAYER_VIEW_MODE_KEY, 'nonsense');
        expect(readStoredPlayerViewMode()).toBe('minimal');
        localStorage.setItem(MINIMAL_PLAYER_PAGE_KEY, 'nonsense');
        expect(readStoredMinimalPage()).toBe('cover');
        localStorage.clear();
    });

    it('remembers both the view and the page across a reload', () => {
        localStorage.clear();
        usePlayerViewModeStore.getState().setMode('stage');
        usePlayerViewModeStore.getState().setPage('lyrics');
        expect(localStorage.getItem(PLAYER_VIEW_MODE_KEY)).toBe('stage');
        expect(localStorage.getItem(MINIMAL_PLAYER_PAGE_KEY)).toBe('lyrics');
        localStorage.clear();
        usePlayerViewModeStore.setState({ mode: 'minimal', page: 'cover', detour: false });
    });

    it('keeps a visit to the stage from rewriting the saved preference', () => {
        usePlayerViewModeStore.setState({ mode: 'minimal', page: 'lyrics', detour: false });
        // Entering the lyric stage is a visit, not a choice.
        usePlayerViewModeStore.getState().openStage();
        expect(usePlayerViewModeStore.getState().mode).toBe('minimal');
        expect(isStageSurface(usePlayerViewModeStore.getState().mode, usePlayerViewModeStore.getState().detour)).toBe(true);
        expect(isMinimalPlayerView(usePlayerViewModeStore.getState().mode)).toBe(true);
        // Leaving it returns to the minimal page the listener was on.
        usePlayerViewModeStore.getState().closeStage();
        expect(isStageSurface(usePlayerViewModeStore.getState().mode, usePlayerViewModeStore.getState().detour)).toBe(false);
        expect(usePlayerViewModeStore.getState().page).toBe('lyrics');
    });

    it('drops a visit when the listener chooses a view explicitly', () => {
        usePlayerViewModeStore.setState({ mode: 'minimal', detour: true });
        usePlayerViewModeStore.getState().setMode('stage');
        expect(usePlayerViewModeStore.getState().detour).toBe(false);
        expect(isStageSurface('stage', false)).toBe(true);
        localStorage.clear();
        usePlayerViewModeStore.setState({ mode: 'minimal', page: 'cover', detour: false });
    });
});
