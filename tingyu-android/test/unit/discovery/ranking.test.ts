import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../src/services/appDatabase', () => ({ appDatabase: { session: { get: async () => undefined, put: async () => {} } } }));
import { excludeSongs, rankDiscovery } from '../../../src/services/discovery/ranking';
import { defaultDiscoverySettings } from '../../../src/stores/useDiscoverySettingsStore';
import { decayedPreference, type Preference } from '../../../src/services/discovery/preferences';
import type { SongResult } from '../../../src/types';
const song = (id: number, name = 'Artist'): SongResult => ({ id, name: `Track ${id}`, artists: [{ id: 1, name }], album: { id: 1, name: 'Album' }, durationMs: 180000, sourceRef: { kind: 'online', providerId: 'netease', mediaId: String(id) } } as SongResult);
const now = 100 * 86400_000;
const preference: Preference = { score: 10, liked: false, blocked: false, updated: now, lastPlayed: now - 10 * 86400_000, listens: 3, day: '', earned: 0 };
import { getPlaybackSongKey } from '../../../src/utils/appPlaybackGuards';
describe('local discovery ranking', () => {
    it('decays listening score over thirty days without decaying an active like', () => {
        expect(decayedPreference(preference, now + 30 * 86400_000)).toBe(5);
        expect(decayedPreference({ ...preference, liked: true }, now + 30 * 86400_000)).toBe(15);
    });
    it('has stable order and does not merge different provider identities', () => {
        const songs = [song(1), song(2), { ...song(1), sourceRef: { kind: 'online', providerId: 'qq', mediaId: '1' } } as SongResult];
        const run = () => rankDiscovery(songs, {}, defaultDiscoverySettings, 'heart', '2026-11-16', now);
        expect(run()).toEqual(run()); expect(run()).toHaveLength(3);
    });
    it('excludes explicit negatives and distinguishes explore from time', () => {
        const prefs = { [getPlaybackSongKey(song(1))]: preference, [getPlaybackSongKey(song(2))]: { ...preference, blocked: true } };
        expect(rankDiscovery([song(1),song(2),song(3)], prefs, defaultDiscoverySettings, 'time', '', now).map(x=>x.song.id)).toEqual([1]);
        expect(rankDiscovery([song(1),song(2),song(3)], prefs, defaultDiscoverySettings, 'explore', '', now).map(x=>x.song.id)).toEqual([3]);
    });
    it('never supplies online candidates to local radar', () => {
        expect(rankDiscovery([song(1)], {}, defaultDiscoverySettings, 'local')).toEqual([]);
    });
    it('removes one dislike without reshuffling the remaining list', () => {
        const before = rankDiscovery([song(1),song(2),song(3),song(4)], {}, defaultDiscoverySettings, 'heart', 'same');
        const after = excludeSongs(before.map(item => item.song), [getPlaybackSongKey(song(2))]);
        expect(after.map(song => song.id)).toEqual(before.filter(item => item.song.id !== 2).map(item => item.song.id));
    });
});
