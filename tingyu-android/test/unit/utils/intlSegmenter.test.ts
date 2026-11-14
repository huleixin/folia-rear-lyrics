import { expect, it, vi } from 'vitest';

// test/unit/utils/intlSegmenter.test.ts
it('provides Unicode graphemes and indexed word segments on older WebViews', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!;
    try {
        Object.defineProperty(Intl, 'Segmenter', { value: undefined, writable: true, configurable: true });
        vi.resetModules();
        await import('@/utils/intlSegmenter');
        const text = '听屿 é👩🏽‍💻🇨🇳';
        const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
        expect(graphemes.map(part => part.segment)).toEqual(['听', '屿', ' ', 'é', '👩🏽‍💻', '🇨🇳']);
        const words = new Intl.Segmenter(undefined, { granularity: 'word' }).segment('Hello music 中国');
        const parts = [...words];
        expect(parts.map(part => part.segment).join('')).toBe('Hello music 中国');
        expect(parts.filter(part => part.isWordLike).map(part => part.segment)).toContain('Hello');
        for (const part of parts) expect(words.containing(part.index)?.segment).toBe(part.segment);
    } finally { Object.defineProperty(Intl, 'Segmenter', descriptor); vi.resetModules(); }
});
