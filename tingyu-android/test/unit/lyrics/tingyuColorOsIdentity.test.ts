import { describe, expect, it } from 'vitest';
import { buildColorOsLyricInfo } from '../../../src/utils/lyrics/colorOsLyricInfo';

// test/unit/lyrics/tingyuColorOsIdentity.test.ts
describe('Tingyu lock-screen lyric identity', () => {
    it.each([500, -500])('applies the shared stage offset to every lyric lane (%s ms)', offset => {
        const result = buildColorOsLyricInfo({ timelineOffsetMs: offset, isWordByWord: true,
            lines: [{ startTime: 1, endTime: 3, fullText: 'AB', translation: '甲乙',
                words: [{ text: 'A', startTime: 1, endTime: 2 }, { text: 'B', startTime: 2, endTime: 3 }] }] });
        const payload = JSON.parse(result!.lyricInfo);
        const tag = offset > 0 ? '00:01.500' : '00:00.500';
        expect(payload.lyric).toContain(`[${tag}]AB`);
        expect(payload.translationLyric).toContain(`[${tag}]甲乙`);
        expect(payload.rawLyric).toContain(`[${tag}]<${tag}>A`);
    });
    it('provides the LRC and enhanced-LRC lanes consumed by HyperLyric without a stage', () => {
        const result = buildColorOsLyricInfo({ title: 'Protocol fixture', songId: 'fixture', isWordByWord: true,
            lines: [{ startTime: 1, endTime: 3, fullText: 'Hello world', translation: '你好',
                words: [{ text: 'Hello', startTime: 1, endTime: 1.5 }, { text: 'world', startTime: 2, endTime: 3 }] }] });
        const payload = JSON.parse(result!.lyricInfo);
        expect(payload.lyric).toBe('[00:01.000]Hello world\n');
        expect(payload.rawLyric).toBe('[00:01.000]<00:01.000>Hello <00:01.500><00:02.000>world<00:03.000>\n');
        expect(payload.translationLyric).toBe('[00:01.000]你好\n');
    });
    it('identifies the independent app while preserving timed lyric and translation lanes', () => {
        const result = buildColorOsLyricInfo({
            title: 'Test song', artist: 'Test artist', songId: 'independent-song',
            durationMs: 90000, sessionGeneration: 3,
            lines: [{ startTime: 1.5, endTime: 4, fullText: 'Island song',
                translation: '听屿', words: [] }],
        });
        expect(result).not.toBeNull();
        const payload = JSON.parse(result!.lyricInfo);
        expect(payload.provider).toBe('io.github.huleixin.tingyu');
        expect(payload.lyric).toBe('[00:01.500]Island song\n');
        expect(payload.translationLyric).toBe('[00:01.500]听屿\n');
        expect(payload.rawLyric).toBeUndefined();
        expect(payload.trackKey).toBe('independent-song|Test song|Test artist|90');
        expect(payload.sessionGeneration).toBe(3);
        expect(result!.hasTranslation).toBe(true);
    });
});
