import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listeningEntityCollection } from '../../../src/library/core/services/listeningCollection';
import { summarizeListening } from '../../../src/services/listeningStatistics';
import type { ListeningSessionRecord } from '../../../src/types/listeningStatistics';

// test/unit/library/listeningCollection.test.ts
const resolver = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/onlineMusic/catalogRefs', () => ({ resolveSongCatalogRef: resolver }));
const record: ListeningSessionRecord = { id: 'one', providerId: 'qq', accountKey: 'a', songKey: 'qq:1', startedAt: 1, endedAt: 60001,
    seconds: 60, completed: false, song: { id: 1, name: 'Song', durationMs: 180000, artists: [{ id: 3, name: 'Artist', catalogRef: { providerId: 'qq', kind: 'artist', id: 'real-mid' } }],
        album: { id: 4, name: 'Album' }, sourceRef: { kind: 'online', providerId: 'qq', mediaId: '1' } } };
const local = { localSongs: [], localLibraryCatalog: { entities: [], assignments: [], ready: true, reload: async () => {} } };
beforeEach(() => resolver.mockReset());
describe('listening entity navigation', () => {
    it('retains catalog refs and the original platform instead of using the active source', async () => {
        const summary = summarizeListening([record]);
        resolver.mockResolvedValue({ providerId: 'qq', kind: 'artist', id: 'real-mid' });
        expect(await listeningEntityCollection(summary.topArtists[0], 'artist', local)).toMatchObject({ source: 'online', providerId: 'qq', id: 'real-mid', type: 'artist' });
        expect(resolver).toHaveBeenCalledWith(record.song, 'artist', record.song.artists[0]);
    });
    it('keeps same-named entities from different providers separate', () => {
        const summary = summarizeListening([record, { ...record, id: 'two', providerId: 'netease', songKey: 'netease:1' }]);
        expect(summary.topArtists).toHaveLength(2);
        expect(summary.topAlbums).toHaveLength(2);
        expect(new Set(summary.topArtists.map(item => item.key)).size).toBe(2);
    });
    it('does not fabricate an entity when a resolver returns no catalog identity', async () => {
        resolver.mockResolvedValue(null);
        expect(await listeningEntityCollection(summarizeListening([record]).topAlbums[0], 'album', local)).toBeNull();
    });
    it('rejects name-only local metadata instead of selecting an unrelated same-named entity', async () => {
        const summary = summarizeListening([{ ...record, providerId: 'local', song: { ...record.song, sourceRef: { kind: 'local', mediaId: '1' } } }]);
        expect(await listeningEntityCollection(summary.topArtists[0], 'artist', local)).toBeNull();
        expect(resolver).not.toHaveBeenCalled();
    });
});
