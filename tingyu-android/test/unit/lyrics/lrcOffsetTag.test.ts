import { describe, expect, it } from 'vitest';
import { parseLRC } from '@/utils/lyrics/parserCore';

// F6-7 回归：LRC 标准的 `[offset:±ms]` 全局标签必须与原生 LrcParser 同语义生效
// （加到每行时间上，正 = 延后，负值钳 0）。舞台解析器过去忽略它，同一份带标签的
// 本地 LRC 在舞台与原生兜底（背屏/灵动岛）之间行时间相差一个标签值。
//
// 解析器会在长间隙里自动插入间奏行（fullText = '......'），它们不属于歌词内容，
// 断言时过滤掉，只看真实歌词行。
const lyricLinesOf = (parsed: { lines: Array<{ fullText: string; startTime: number;
    endTime: number; words: Array<{ startTime: number }>; translation?: string }> }) =>
    parsed.lines.filter(line => line.fullText !== '......');

describe('LRC [offset:] tag', () => {
    it('delays every line by the declared offset', () => {
        const parsed = lyricLinesOf(parseLRC('[offset:+500]\n[00:12.000]第一行\n[00:20.000]第二行'));
        expect(parsed.map(line => line.startTime)).toEqual([12.5, 20.5]);
    });

    it('advances every line for a negative offset, clamped at zero', () => {
        const parsed = lyricLinesOf(parseLRC('[offset:-800]\n[00:00.400]开头\n[00:10.000]后一行'));
        expect(parsed[0].startTime).toBe(0);
        expect(parsed[0].endTime).toBeGreaterThanOrEqual(parsed[0].startTime);
        expect(parsed[1].startTime).toBeCloseTo(9.2, 6);
    });

    it('keeps translation matching on original times, then shifts the line', () => {
        const parsed = lyricLinesOf(parseLRC('[offset:+1000]\n[00:10.000]行', '[00:10.000]line'));
        // 译文对齐用双方原始时间（不受主文件偏移错位）；行时间平移后译文跟着同一行。
        expect(parsed[0].startTime).toBe(11);
        expect(parsed[0].translation).toBe('line');
    });

    it('shifts generated word timings with the line', () => {
        const parsed = lyricLinesOf(parseLRC('[offset:+250]\n[00:05.000]歌词词'));
        expect(parsed[0].words[0].startTime).toBeCloseTo(5.25, 6);
        for (const word of parsed[0].words) {
            expect(word.startTime).toBeGreaterThanOrEqual(5.25 - 1e-9);
        }
    });

    it('is a no-op without the tag', () => {
        const parsed = lyricLinesOf(parseLRC('[00:12.000]第一行'));
        expect(parsed[0].startTime).toBe(12);
    });

    it('accepts the spaced and signed spellings', () => {
        expect(lyricLinesOf(parseLRC('[offset: +200]\n[00:01.000]行'))[0].startTime).toBe(1.2);
        expect(lyricLinesOf(parseLRC('[offset:-0]\n[00:01.000]行'))[0].startTime).toBe(1);
    });
});
