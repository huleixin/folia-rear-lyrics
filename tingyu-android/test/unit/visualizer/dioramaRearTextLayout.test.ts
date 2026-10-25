import { describe, expect, it, vi } from 'vitest';
import { layoutDioramaRearText } from '@/components/visualizer/diorama/dioramaRearTextLayout';
import type { LyricUnit } from '@/components/visualizer/diorama/dioramaSceneTypes';

// test/unit/visualizer/dioramaRearTextLayout.test.ts
vi.mock('@/components/visualizer/diorama/dioramaTextRaster', () => ({
    measureDioramaText: (text: string) => text.length * 10,
}));
const units = (text: string): LyricUnit[] =>
    [...text].map((text, index) => ({
        text,
        charStart: index,
        charEnd: index + 1,
        startTime: index,
        endTime: index + 1,
    }));
describe('Diorama rear line wrapping', () => {
    it('balances a short sentence without isolating its last character', () => {
        const layout = layoutDioramaRearText('abcdefgh', units('abcdefgh'), 'font', 70);
        expect(layout.rows.map((row) => row.last - row.first + 1)).toEqual([4, 4]);
    });
    it('does not create an extra orphan row while balancing a long sentence', () => {
        const text = 'abcdefghijklmnopqrstuvwxy';
        const layout = layoutDioramaRearText(text, units(text), 'font', 70);
        expect(layout.rows.map((row) => row.last - row.first + 1)).toEqual([7, 7, 7, 4]);
        expect(layout.positions).toHaveLength(text.length);
    });
    it('preserves a timed word and whitespace between units', () => {
        const line: LyricUnit[] = [
            { text: 'hello', charStart: 0, charEnd: 5, startTime: 0, endTime: 1 },
            { text: 'world', charStart: 6, charEnd: 11, startTime: 1, endTime: 2 },
        ];
        const layout = layoutDioramaRearText('hello world', line, 'font', 120);
        expect(layout.positions.map((position) => position.prefixPx)).toEqual([0, 60]);
        expect(line.map((unit) => unit.startTime)).toEqual([0, 1]);
    });
});
