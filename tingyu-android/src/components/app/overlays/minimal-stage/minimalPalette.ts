// src/components/app/overlays/minimal-stage/minimalPalette.ts
// Cover → ambient palette for the minimal player.
//
// Everything here is pure: sampling lives in useCoverPalette so the colour rules can be tested
// without a canvas. The rules matter more than the maths — a raw dominant colour is usually either
// a saturated poster red or a washed-out grey, and either one wrecks the page it is painted behind.

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

/**
 * The hue the reader should always recognise as 听屿's deep ink.
 *
 * 168° is a green teal, and a green floor is exactly what turns a warm sleeve's amber mist into
 * olive when the two are mixed at the low lightness this page uses. The reference's floor measures
 * 207°: a blue teal. Keeping the ink on the blue side of teal holds the brand colour *and* lets a
 * sunset sleeve read as ember rather than swamp.
 */
export const TINGYU_INK_HUE = 188;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(clamp(value, 0, 255));

export const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
    const red = r / 255;
    const green = g / 255;
    const blue = b / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    const l = (max + min) / 2;
    if (delta === 0) {
        return { h: 0, s: 0, l };
    }
    const s = delta / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === red) {
        h = ((green - blue) / delta) % 6;
    } else if (max === green) {
        h = (blue - red) / delta + 2;
    } else {
        h = (red - green) / delta + 4;
    }
    return { h: (h * 60 + 360) % 360, s: clamp(s, 0, 1), l };
};

export const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const sector = ((h % 360) + 360) % 360 / 60;
    const second = chroma * (1 - Math.abs((sector % 2) - 1));
    const offset = l - chroma / 2;
    const [r, g, b] = sector < 1 ? [chroma, second, 0]
        : sector < 2 ? [second, chroma, 0]
            : sector < 3 ? [0, chroma, second]
                : sector < 4 ? [0, second, chroma]
                    : sector < 5 ? [second, 0, chroma]
                        : [chroma, 0, second];
    return { r: round((r + offset) * 255), g: round((g + offset) * 255), b: round((b + offset) * 255) };
};

export const rgbCss = ({ r, g, b }: Rgb) => `rgb(${round(r)} ${round(g)} ${round(b)})`;

const linearChannel = (value: number) => {
    const channel = clamp(value / 255, 0, 1);
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = ({ r, g, b }: Rgb) =>
    0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);

export const contrastRatio = (foreground: Rgb, background: Rgb) => {
    const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
};

/** Shortest-way round on the hue circle; without it a teal going to green would swing through red. */
export const blendHue = (from: number, to: number, amount: number): number => {
    const delta = ((to - from + 540) % 360) - 180;
    return (from + delta * amount + 360) % 360;
};

type Bounds = { hue?: number; huePull?: number; s: readonly [number, number]; l: readonly [number, number] };

export const constrain = (color: Hsl, bounds: Bounds): Hsl => ({
    h: typeof bounds.hue === 'number' ? blendHue(color.h, bounds.hue, bounds.huePull ?? 0.4) : color.h,
    s: clamp(color.s, bounds.s[0], bounds.s[1]),
    l: clamp(color.l, bounds.l[0], bounds.l[1]),
});

type Bucket = { count: number; r: number; g: number; b: number };

/**
 * Coarse 4-bit-per-channel histogram. Cheap enough to run once per cover, and coarse enough that
 * JPEG noise does not split one colour into twenty nearly identical winners.
 */
export const quantizeSamples = (samples: readonly Rgb[]): Bucket[] => {
    const buckets = new Map<number, Bucket>();
    for (const sample of samples) {
        // Near-black and near-white carry no usable hue: they are letterboxing, glare or paper.
        const { l, s } = rgbToHsl(sample);
        if (l < 0.08 || l > 0.94 || s < 0.04) {
            continue;
        }
        const key = ((sample.r >> 4) << 8) | ((sample.g >> 4) << 4) | (sample.b >> 4);
        const bucket = buckets.get(key);
        if (bucket) {
            bucket.count += 1;
            bucket.r += sample.r;
            bucket.g += sample.g;
            bucket.b += sample.b;
        } else {
            buckets.set(key, { count: 1, r: sample.r, g: sample.g, b: sample.b });
        }
    }
    return [...buckets.values()]
        .map(bucket => ({
            count: bucket.count,
            r: bucket.r / bucket.count,
            g: bucket.g / bucket.count,
            b: bucket.b / bucket.count,
        }))
        .sort((left, right) => right.count - left.count);
};

const hueDistance = (left: number, right: number) => Math.abs(((left - right + 540) % 360) - 180);

export type CoverColors = {
    primary: Hsl;
    secondary: Hsl;
    accent: Hsl;
    /**
     * Count-weighted mean of every sampled pixel.
     *
     * This, not the most saturated bucket, is what lights the page: an ambient background is the
     * artwork's overall cast, and picking the loudest colour instead is how these layouts end up
     * with a neon accent glowing behind a muted sleeve.
     */
    average: Hsl;
};

/**
 * Picks the colours the page is painted with.
 *
 * Not "the most frequent colour": a sunset sleeve is mostly grey-blue sky, and taking the largest
 * bucket gives every such cover the same teal page no matter what the artwork actually looks like.
 * The ambient colour of a sleeve is its *chromatic* part, so the buckets are filtered to those
 * within reach of the most saturated one and averaged, weighted by how much colour they carry.
 * A near-monochrome cover falls back to the plain mean, which is what a black-and-white print
 * should look like.
 *
 * Returns null when the cover had too little colour to describe — the caller then keeps the theme
 * palette instead of inventing a hue from noise.
 */
export const pickCoverColors = (buckets: readonly Bucket[]): CoverColors | null => {
    if (!buckets.length) {
        return null;
    }
    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    if (total < 12) {
        return null;
    }
    const mean = (list: readonly Bucket[], weight: (bucket: Bucket) => number): Rgb => {
        let sum = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (const bucket of list) {
            const w = weight(bucket);
            sum += w;
            r += bucket.r * w;
            g += bucket.g * w;
            b += bucket.b * w;
        }
        return sum > 0 ? { r: r / sum, g: g / sum, b: b / sum } : { r: 0, g: 0, b: 0 };
    };

    const saturationOf = (bucket: Bucket) => rgbToHsl(bucket).s;
    const maxSaturation = buckets.reduce((max, bucket) => Math.max(max, saturationOf(bucket)), 0);
    // 55% of the peak keeps two or three neighbouring hues of the same subject and drops the grey
    // weather around it. 0.12 is the floor below which "colour" is just noise.
    const threshold = Math.max(0.12, maxSaturation * 0.55);
    const vivid = buckets.filter(bucket => saturationOf(bucket) >= threshold);
    // Weight by count * saturation: a large area of mild colour should beat a few pixels of neon.
    const colourWeight = (bucket: Bucket) => bucket.count * saturationOf(bucket);
    const chromatic = rgbToHsl(mean(vivid.length ? vivid : buckets, colourWeight));
    const average = rgbToHsl(mean(buckets, bucket => bucket.count));

    // A second hue only helps when the sleeve actually has one; otherwise rotate the first, which
    // keeps the two fields from stacking into a single flat wash.
    const distinct = vivid.find(bucket => {
        const candidate = rgbToHsl(bucket);
        return hueDistance(candidate.h, chromatic.h) > 24;
    });
    const secondary = distinct
        ? rgbToHsl(distinct)
        : { ...chromatic, h: (chromatic.h + 26) % 360, l: chromatic.l * 0.9 };
    const accentSource = (vivid.length ? vivid : buckets)
        .map(rgbToHsl)
        .sort((left, right) => (right.s * 0.6 + right.l * 0.4) - (left.s * 0.6 + left.l * 0.4))[0]
        ?? chromatic;

    return { primary: chromatic, secondary, accent: accentSource, average };
};

export type MinimalPalette = {
    /** Page wash under every gradient layer. */
    base: string;
    /** Two slow colour fields behind the artwork. */
    fieldPrimary: string;
    fieldSecondary: string;
    /** The bloom immediately behind the cover; warm in most sunset/low-light artwork. */
    bloom: string;
    /** Shared focus, transport and page indicator accent. */
    accent: string;
    /** Cover-derived, contrast-checked accent used only for sung lyric graphemes. */
    lyricAccent: string;
    /** Whether the cover could be read at all. */
    derived: boolean;
};

const DARK_LIGHT = {
    /* Measured against the reference artwork at equal height. Its page floor is rgb(16,32,47) —
       hue 207°, not the 168° ink green — because the floor is the sleeve seen through the ink, not
       the ink alone. That is the whole calibration: a violet sleeve must leave a violet-blue page.
       Lightness stays low and saturation moderate, which is what keeps a strong sleeve from
       becoming a bright poster wash. */
    base: { s: [0.3, 0.44], l: [0.09, 0.12] },
    primary: { s: [0.36, 0.56], l: [0.15, 0.235] },
    secondary: { s: [0.34, 0.52], l: [0.13, 0.2] },
    bloom: { s: [0.42, 0.62], l: [0.22, 0.32] },
    accent: { s: [0.34, 0.58], l: [0.63, 0.75] },
} as const;

/**
 * Pick a soft highlight from the representative cover hue, then constrain it against a
 * conservative envelope for the animated wash. The dynamic background can show a luminous
 * gradient patch, so a simple contrast check against the dark page floor is not sufficient.
 */
export const buildLyricAccent = (
    primary: Hsl,
    accentSource: Hsl,
    mode: 'dark' | 'light',
    derived = true,
    average?: Hsl,
): Hsl => {
    const coverHasUsableHue = derived && primary.s >= 0.14 && (average?.s ?? primary.s) >= 0.1;
    const sampledButNeutral = derived && !coverHasUsableHue;
    const hue = coverHasUsableHue
        ? blendHue(primary.h, accentSource.h, 0.12)
        : sampledButNeutral ? 36 : accentSource.h;
    // Keep enough chroma to read as the sleeve's colour on a dark, softly mixed background. The
    // contrast guard below adjusts lightness independently, so warm hues do not have to be washed
    // almost white just to stay legible.
    const saturation = coverHasUsableHue
        ? clamp(primary.s * 0.68 + accentSource.s * 0.08, 0.3, 0.62)
        : sampledButNeutral
            ? (mode === 'dark' ? 0.16 : 0.2)
            : clamp(accentSource.s * 0.52, 0.18, 0.38);
    const target = sampledButNeutral ? (mode === 'dark' ? 0.79 : 0.32) : mode === 'dark' ? 0.74 : 0.34;
    const step = mode === 'dark' ? 0.01 : -0.01;
    const minimumContrast = mode === 'dark' ? 3 : 4.5;
    const backgroundEnvelope = mode === 'dark'
        // Cover glows sit behind the dark veil. A conservative bright grey envelope keeps the
        // large lyric readable without washing every sung colour back into unsung near-white.
        ? [{ r: 96, g: 96, b: 96 }, { r: 112, g: 112, b: 112 }]
        // The paper theme's light fields can approach white; use both a high and mid-light sample.
        : [{ r: 230, g: 230, b: 230 }, { r: 246, g: 246, b: 246 }];

    let lightness = target;
    let candidate = hslToRgb({ h: hue, s: saturation, l: lightness });
    while (lightness > 0.22 && lightness < 0.96
        && Math.min(...backgroundEnvelope.map(background => contrastRatio(candidate, background))) < minimumContrast) {
        lightness += step;
        candidate = hslToRgb({ h: hue, s: saturation, l: lightness });
    }
    return { h: hue, s: saturation, l: lightness };
};

const LIGHT_LIGHT = {
    base: { s: [0.12, 0.26], l: [0.95, 0.972] },
    primary: { s: [0.2, 0.42], l: [0.82, 0.89] },
    secondary: { s: [0.16, 0.36], l: [0.86, 0.93] },
    bloom: { s: [0.24, 0.5], l: [0.7, 0.82] },
    accent: { s: [0.4, 0.62], l: [0.33, 0.44] },
} as const;

/**
 * Amber is the one hue band that cannot be used as-is.
 *
 * A gold or yellow-green mist at 20% lightness over an ink-teal floor averages to olive — not a
 * muddy *sleeve*, a muddy *page*, and it is the single most common way this layout looks cheap.
 * Hues in the amber band are rotated toward ember (red-orange) by most of their distance from 18°.
 * A sunset sleeve then lights the page warm rust; a yellow one, deep ochre. Green, cyan, blue and
 * violet are untouched — they mix with the floor cleanly.
 */
export const emberShift = (hue: number): number => {
    const from = 18;
    const to = 100;
    if (hue <= from || hue >= to) {
        return hue;
    }
    return hue - (hue - from) * 0.9;
};

/**
 * The five colours the minimal page paints with.
 *
 * Dark theme keeps 听屿's ink-green base and lets the cover act as an overlay hue; light theme keeps
 * the same hues as a paper wash so the two themes stay recognisably one design.
 *
 * `colors` is never null-handed: when the cover cannot be sampled the caller passes the colours the
 * theme already had, with `derived: false`, so the page still paints instead of flashing a default.
 */
export const buildMinimalPalette = (
    colors: CoverColors,
    mode: 'dark' | 'light',
    derived = true,
): MinimalPalette => {
    const scale = mode === 'dark' ? DARK_LIGHT : LIGHT_LIGHT;
    const primary = colors.primary;
    const secondary = colors.secondary;
    const accentSource = colors.accent;

    // The floor is the ink, with a touch of the sleeve. Not the other way round: rotating an orange
    // hue 55% toward 168° travels through yellow-green and lands on olive, which is how a sunset
    // cover produced a swamp-green page. A fixed floor keeps 听屿 recognisable; the sleeve tints it.
    const base = constrain(
        { h: blendHue(TINGYU_INK_HUE, primary.h, 0.05), s: primary.s * 0.5 + 0.16, l: primary.l },
        { s: scale.base.s, l: scale.base.l },
    );
    const fieldPrimary = constrain(
        { ...primary, h: emberShift(primary.h) },
        {
            hue: TINGYU_INK_HUE,
            huePull: 0.02,
            s: scale.primary.s,
            l: scale.primary.l,
        },
    );
    const fieldSecondary = constrain(
        { ...secondary, h: emberShift(secondary.h) },
        {
            hue: TINGYU_INK_HUE,
            huePull: 0.02,
            s: scale.secondary.s,
            l: scale.secondary.l,
        },
    );
    // A near-grey average has hue 0 in HSL, and clamping its saturation up would paint a red glow
    // behind a black-and-white sleeve. Keep the artwork's lightness, take the hue from the cover's
    // most usable colour instead.
    const averageHasHue = colors.average.s > 0.07;
    const bloomSource = averageHasHue
        ? colors.average
        : { h: TINGYU_INK_HUE, s: colors.average.s, l: colors.average.l };
    const bloom = constrain(
        { ...bloomSource, h: emberShift(bloomSource.h) },
        { hue: TINGYU_INK_HUE, huePull: 0.02, s: scale.bloom.s, l: scale.bloom.l },
    );
    // Shared app chrome keeps its established ink-family accent; lyric highlighting has a separate
    // cover-derived colour below so page dots and controls retain their existing visual meaning.
    const accent = constrain(accentSource, {
        hue: TINGYU_INK_HUE,
        huePull: 0.88,
        s: scale.accent.s,
        l: scale.accent.l,
    });
    const lyricAccent = buildLyricAccent(primary, accentSource, mode, derived, colors.average);

    return {
        base: rgbCss(hslToRgb(base)),
        fieldPrimary: rgbCss(hslToRgb(fieldPrimary)),
        fieldSecondary: rgbCss(hslToRgb(fieldSecondary)),
        bloom: rgbCss(hslToRgb(bloom)),
        accent: rgbCss(hslToRgb(accent)),
        lyricAccent: rgbCss(hslToRgb(lyricAccent)),
        derived,
    };
};
