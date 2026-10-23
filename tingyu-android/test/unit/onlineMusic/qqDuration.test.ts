import { describe, expect, it } from 'vitest';
import { normalizeQqSong } from '../../../src/services/onlineMusic/qqNormalize';
import { formatTime } from '../../../src/utils/appPlaybackHelpers';

// test/unit/onlineMusic/qqDuration.test.ts
describe('QQ duration units at the adapter boundary', () => {
    it.each([270000, 189000, 250000, 223000, 269000])(
        'keeps Android bridge milliseconds (%s) without converting twice',
        (duration) => {
            const song = normalizeQqSong({
                id: 'mid',
                name: 'Track',
                provider: 'qq',
                source: 'qq',
                type: 'qq',
                duration,
            });
            expect(song.durationMs).toBe(duration);
            expect(normalizeQqSong(song).durationMs).toBe(duration);
            expect(formatTime(song.durationMs / 1000)).toBe(formatTime(duration / 1000));
        }
    );
    it('displays the reported 4500:00 regression as 04:30', () => {
        const song = normalizeQqSong({ id: 'mid', provider: 'qq', source: 'qq', type: 'qq', duration: 270000 });
        expect(formatTime(song.durationMs / 1000)).toBe('04:30');
    });
    it('still converts upstream seconds and honors canonical milliseconds', () => {
        expect(normalizeQqSong({ id: 'mid', interval: 270 }).durationMs).toBe(270000);
        expect(normalizeQqSong({ id: 'mid', duration: 270 }).durationMs).toBe(270000);
        expect(normalizeQqSong({ id: 'mid', durationMs: 270000, interval: 123 }).durationMs).toBe(270000);
        expect(normalizeQqSong({ id: 'mid' }).durationMs).toBe(0);
    });
});
