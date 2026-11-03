import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { quantizeSamples, pickCoverColors, buildMinimalPalette } from '../../../src/components/app/overlays/minimal-stage/minimalPalette';

describe('palette probe', () => {
    it('prints the palette for the reference cover', () => {
        const samples = JSON.parse(readFileSync('test/unit/fixtures/ref-art-samples.json', 'utf8')) as { 0: number; 1: number; 2: number }[];
        const rgb = samples.map(s => ({ r: s[0], g: s[1], b: s[2] }));
        const buckets = quantizeSamples(rgb);
        const colors = pickCoverColors(buckets);
        console.log('PROBE_COLORS', JSON.stringify(colors));
        for (const mode of ['dark', 'light'] as const) {
            const p = colors ? buildMinimalPalette(colors, mode) : null;
            console.log('PROBE_' + mode.toUpperCase(), JSON.stringify(p));
        }
    });
});
