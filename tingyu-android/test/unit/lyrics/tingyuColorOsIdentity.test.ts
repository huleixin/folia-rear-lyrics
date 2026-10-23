import { describe, expect, it } from 'vitest';
import { buildColorOsLyricInfo } from '../../../src/utils/lyrics/colorOsLyricInfo';

// test/unit/lyrics/tingyuColorOsIdentity.test.ts
describe('Tingyu lock-screen lyric identity', () => {
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
