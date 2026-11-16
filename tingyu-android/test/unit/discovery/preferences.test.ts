import { beforeEach, describe, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ put: vi.fn(async () => {}) }));
vi.mock('../../../src/services/appDatabase', () => ({ appDatabase: { session: { get: async () => undefined, put: database.put } } }));
import { clearDiscoveryPreferences, recordDiscoveryFeedback, useDiscoveryPreferences } from '../../../src/services/discovery/preferences';
import { useDiscoverySettingsStore } from '../../../src/stores/useDiscoverySettingsStore';
import type { SongResult } from '../../../src/types';
import { getPlaybackSongKey } from '../../../src/utils/appPlaybackGuards';

const song = { id: 7, name: 'Song', artists: [{ id: 1, name: 'Artist' }], album: { id: 1, name: 'Album' },
    durationMs: 200_000, sourceRef: { kind: 'online', providerId: 'netease', mediaId: '7' } } as SongResult;
const key = getPlaybackSongKey(song);
const put = database.put;
describe('discovery preference settlement', () => {
    beforeEach(() => { useDiscoveryPreferences.setState({ values: {}, revision: 0, ready: true }); useDiscoverySettingsStore.getState().reset(); put.mockClear(); });
    it('settles a listening session only once', async () => {
        recordDiscoveryFeedback(song, 'listen', { session: 'one', seconds: 180, completed: true, now: 1000 });
        recordDiscoveryFeedback(song, 'listen', { session: 'one', seconds: 180, completed: true, now: 1000 });
        expect(useDiscoveryPreferences.getState().values[key].score).toBe(4);
        await Promise.resolve(); await Promise.resolve();
        expect(put).toHaveBeenCalledTimes(1);
    });
    it('caps repeated positive rewards for one day', () => {
        for (let i = 0; i < 5; i++) recordDiscoveryFeedback(song, 'listen', { session: 's' + i, seconds: 180, completed: true, now: 10_000 });
        expect(useDiscoveryPreferences.getState().values[key].score).toBe(12);
    });
    it('keeps an unlike from being a dislike', () => {
        recordDiscoveryFeedback(song, 'like');
        recordDiscoveryFeedback(song, 'unlike');
        expect(useDiscoveryPreferences.getState().values[key]).toMatchObject({ liked: false, blocked: false });
    });
    it('clears local preferences without changing the record setting', () => {
        useDiscoverySettingsStore.getState().patch({ record: false });
        recordDiscoveryFeedback(song, 'dislike');
        clearDiscoveryPreferences();
        expect(useDiscoveryPreferences.getState().values).toEqual({});
        expect(useDiscoverySettingsStore.getState().record).toBe(false);
    });
});
