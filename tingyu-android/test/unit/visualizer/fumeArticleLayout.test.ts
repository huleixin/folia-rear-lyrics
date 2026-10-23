import { describe, expect, it } from 'vitest';
import { buildArticleLayout } from '../../../src/components/visualizer/fume/fumeArticleLayout';
import type { FumeTuning, Line, Theme } from '../../../src/types';

// The article build runs synchronously inside the visualizer's layout timer, so its cost is a
// main-thread stall a user feels. A diagnostic caught one at 1040ms on a phone; the number that
// drives that cost is how many canvas text measurements the layout search asks for, which is what
// this test pins down. The stub keeps the measurement deterministic instead of timing the machine.

const CJK = /[\u2e80-\u9fff\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]/;

const installMeasureStub = () => {
    const stats = { calls: 0 };
    const context = {
        font: '16px sans-serif',
        measureText(text: string) {
            stats.calls += 1;
            const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
            const px = match ? Number(match[1]) : 16;
            let width = 0;
            for (const character of text) width += CJK.test(character) ? px : px * 0.52;
            return { width };
        },
    };
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = class {
        getContext() {
            return context;
        }
    };
    return stats;
};

const theme = {
    name: 'test',
    fontStyle: 'normal',
    fontFamily: 'sans-serif',
    fontFamilyStack: 'sans-serif',
    fontWeight: 600,
} as unknown as Pick<Theme, 'name' | 'fontStyle' | 'fontFamily' | 'fontFamilyStack' | 'fontWeight'>;

const tuning = { heroScale: 1 } as unknown as FumeTuning;

const SAMPLE = [
    '那些流淌在香江畔的经典旋律',
    '是刻在几代人记忆里的港风印记',
    '每一首粤语老歌都藏着旧时光的温柔与滚烫',
    '当旋律响起时',
    '我们仿佛又回到了那个年代',
    '风继续吹不忍远离',
    '心里极渴望希望留下伴着你',
    '心里亦有泪不愿流泪望着你',
];

const buildLines = (count: number): Line[] => Array.from({ length: count }, (_, index) => ({
    words: [],
    startTime: index * 4,
    endTime: index * 4 + 3.8,
    fullText: SAMPLE[index % SAMPLE.length]!,
    isChorus: index % 9 === 0,
})) as Line[];

describe('buildArticleLayout', () => {
    it('lays a long song out without a measurement explosion', () => {
        const stats = installMeasureStub();
        const article = buildArticleLayout(buildLines(120), { width: 853, height: 394 }, theme, 1, tuning);

        expect(article).not.toBeNull();
        expect(article!.blocks).toHaveLength(120);
        // The search used to run 8 density steps per column count with an 8-step per-line font
        // search each, which cost ~12800 measurements for this input (roughly a second on a phone).
        expect(stats.calls).toBeLessThan(6000);
    });

    it('is empty without lines or a viewport', () => {
        installMeasureStub();
        expect(buildArticleLayout([], { width: 853, height: 394 }, theme, 1, tuning)).toBeNull();
        expect(buildArticleLayout(buildLines(4), { width: 0, height: 0 }, theme, 1, tuning)).toBeNull();
    });
});
