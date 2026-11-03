// src/components/app/overlays/minimal-stage/minimalPalette.ts
// Cover → ambient palette for the minimal player.
//
// Everything here is pure: sampling lives in useCoverPalette so the colour rules can be tested
// without a canvas. The rules matter more than the maths — a raw dominant colour is usually either
// a saturated poster red or a washed-out grey, and either one wrecks the page it is painted behind.

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

/** The hue the reader should always recognise as 听屿's deep ink green. */
export const TINGYU_INK_HUE = 168;

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
 * Picks three useful colours out of a histogram: the dominant one, one that is visibly different
 * from it, and a brighter accent for the bloom.
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
    const primary = rgbToHsl(buckets[0]);
    const distinct = buckets.find(bucket => {
        const candidate = rgbToHsl(bucket);
        return hueDistance(candidate.h, primary.h) > 24 || Math.abs(candidate.l - primary.l) > 0.22;
    });
    const secondary = distinct ? rgbToHsl(distinct) : { ...primary, h: (primary.h + 28) % 360, l: primary.l * 0.86 };
    const accentSource = buckets
        .map(rgbToHsl)
        .sort((left, right) => (right.s * 0.6 + right.l * 0.4) - (left.s * 0.6 + left.l * 0.4))[0] ?? primary;
    const average = rgbToHsl({
        r: buckets.reduce((sum, bucket) => sum + bucket.r * bucket.count, 0) / total,
        g: buckets.reduce((sum, bucket) => sum + bucket.g * bucket.count, 0) / total,
        b: buckets.reduce((sum, bucket) => sum + bucket.b * bucket.count, 0) / total,
    });
    return { primary, secondary, accent: accentSource, average };
};

export type MinimalPalette = {
    /** Page wash under every gradient layer. */
    base: string;
    /** Two slow colour fields behind the artwork. */
    fieldPrimary: string;
    fieldSecondary: string;
    /** The bloom immediately behind the cover; warm in most sunset/low-light artwork. */
    bloom: string;
    /** Lyric highlight and dot accent. */
    accent: string;
    /** Whether the cover could be read at all. */
    derived: boolean;
};

const DARK_LIGHT = {
    /* Calibrated against the reference: the page floor is a dark teal (~rgb 20,38,34) rather than
       black, and the artwork's own colours carry the middle band at roughly 45% lightness. */
    base: { s: [0.2, 0.38], l: [0.1, 0.135] },
    primary: { s: [0.18, 0.42], l: [0.19, 0.29] },
    secondary: { s: [0.14, 0.34], l: [0.16, 0.25] },
    bloom: { s: [0.42, 0.7], l: [0.42, 0.56] },
    accent: { s: [0.4, 0.72], l: [0.58, 0.72] },
} as const;

const LIGHT_LIGHT = {
    base: { s: [0.1, 0.24], l: [0.955, 0.975] },
    primary: { s: [0.18, 0.4], l: [0.84, 0.905] },
    secondary: { s: [0.14, 0.34], l: [0.88, 0.94] },
    bloom: { s: [0.24, 0.5], l: [0.72, 0.84] },
    accent: { s: [0.45, 0.72], l: [0.34, 0.46] },
} as const;

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

    const base = constrain(
        { h: blendHue(primary.h, TINGYU_INK_HUE, 0.72), s: primary.s, l: primary.l },
        { s: scale.base.s, l: scale.base.l },
    );
    const fieldPrimary = constrain(primary, {
        hue: TINGYU_INK_HUE,
        huePull: 0.42,
        s: scale.primary.s,
        l: scale.primary.l,
    });
    const fieldSecondary = constrain(secondary, {
        hue: TINGYU_INK_HUE,
        huePull: 0.5,
        s: scale.secondary.s,
        l: scale.secondary.l,
    });
    const bloom = constrain(colors.average, { s: scale.bloom.s, l: scale.bloom.l });
    const accent = constrain(accentSource, {
        hue: TINGYU_INK_HUE,
        huePull: 0.55,
        s: scale.accent.s,
        l: scale.accent.l,
    });

    return {
        base: rgbCss(hslToRgb(base)),
        fieldPrimary: rgbCss(hslToRgb(fieldPrimary)),
        fieldSecondary: rgbCss(hslToRgb(fieldSecondary)),
        bloom: rgbCss(hslToRgb(bloom)),
        accent: rgbCss(hslToRgb(accent)),
        derived,
    };
};
