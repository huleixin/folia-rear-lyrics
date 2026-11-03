import { useEffect, useState } from 'react';
import {
    pickCoverColors,
    quantizeSamples,
    type CoverColors,
    type Rgb,
} from './minimalPalette';

// src/components/app/overlays/minimal-stage/useCoverPalette.ts
// Samples a cover once per URL, off the layout thread, and never on a frame.
//
// Three rules this hook exists to enforce:
//   · the palette is recomputed only when the artwork changes — never per frame, never per render;
//   · a cover that cannot be read (no CORS header, tainted canvas, decode failure) resolves to null
//     and the caller keeps the theme palette, so the page never flashes a guessed colour;
//   · the sample is 28×28 and the cache is small and bounded, because artwork URLs are unbounded.

const CACHE_LIMIT = 16;
const SAMPLE_SIZE = 28;
const cache = new Map<string, CoverColors | null>();

const remember = (key: string, value: CoverColors | null) => {
    if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (typeof oldest === 'string') {
            cache.delete(oldest);
        }
    }
    cache.set(key, value);
};

const readPixels = (image: HTMLImageElement): Rgb[] => {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        return [];
    }
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    let data: Uint8ClampedArray;
    try {
        data = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    } catch {
        // Tainted canvas: the artwork is cross-origin without a usable CORS header.
        return [];
    }
    const samples: Rgb[] = [];
    for (let index = 0; index < data.length; index += 8) {
        if (data[index + 3] < 160) {
            continue;
        }
        samples.push({ r: data[index], g: data[index + 1], b: data[index + 2] });
    }
    return samples;
};

const sampleCover = (url: string, alive: () => boolean) => new Promise<CoverColors | null>(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    const settle = (value: CoverColors | null) => {
        if (alive()) {
            resolve(value);
        }
    };
    image.onload = () => {
        const colors = pickCoverColors(quantizeSamples(readPixels(image)));
        settle(colors);
    };
    image.onerror = () => settle(null);
    image.src = url;
});

/** Cover colours for one URL. Re-runs only when the URL changes. */
export function useCoverColors(url: string | null): CoverColors | null {
    const [colors, setColors] = useState<CoverColors | null>(() => (url ? cache.get(url) ?? null : null));

    useEffect(() => {
        if (!url || typeof document === 'undefined') {
            setColors(null);
            return;
        }
        const cached = cache.get(url);
        if (cached !== undefined) {
            setColors(cached);
            return;
        }
        let alive = true;
        setColors(null);
        void sampleCover(url, () => alive).then(value => {
            if (!alive) {
                return;
            }
            remember(url, value);
            setColors(value);
        });
        return () => {
            alive = false;
        };
    }, [url]);

    return colors;
}

/** Test seam: the cache must never leak one track's colours onto the next one's artwork. */
export const clearCoverPaletteCache = () => cache.clear();
