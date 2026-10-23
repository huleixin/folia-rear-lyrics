import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import type { OnlineGridViewCollectionDescriptor } from '@/library/core/contracts/collection';
import {
    createOnlineCollectionResource,
    type OnlineCollectionResourceDeps,
} from '@/library/core/services/onlineCollectionResource';
import {
    ONLINE_TRACKS_CACHE_SCHEMA_VERSION,
    ONLINE_TRACKS_FRESH_MS,
    isTimedTracksCacheReadable,
    type OnlineTracksCacheEntry,
} from '@/library/core/services/onlineCollectionCache';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

// test/unit/library/core/onlineCollectionTimedCache.test.ts
const collection: OnlineGridViewCollectionDescriptor = {
    source: 'online',
    providerId: 'qq',
    type: 'playlist',
    id: 'p',
    name: 'No timestamp',
};
const song = (id: string) =>
    ({
        id,
        name: id,
        artists: [],
        album: { id: 0, name: '' },
        durationMs: 1000,
        sourceRef: { kind: 'online', providerId: 'qq', mediaId: id },
    } as SongResult);
const settle = async () => {
    for (let index = 0; index < 65; index++) await Promise.resolve();
};
const entry = (fetchedAt: number): OnlineTracksCacheEntry => ({
    tracks: [song('cached'), song('tail')],
    snapshotTime: 0,
    schemaVersion: ONLINE_TRACKS_CACHE_SCHEMA_VERSION,
    nextOffset: 2,
    hasMore: false,
    fetchedAt,
});
function harness(cache = entry(Date.now())) {
    const deps: OnlineCollectionResourceDeps = {
        readCache: vi.fn(async () => cache),
        writeCache: vi.fn(async () => {}),
        getCollectionTracks: vi.fn(async () => ({ items: [song('fresh')], hasMore: false, nextOffset: 1 })),
        getCollectionDetail: vi.fn(async () => null),
        getPersonalFm: vi.fn(async () => []),
        getDailySongs: vi.fn(async () => []),
        wait: async () => {},
    };
    return { deps, resource: createOnlineCollectionResource('qq:p', deps) };
}
afterEach(() => vi.restoreAllMocks());
describe('no-version playlist cache', () => {
    it('reuses fresh persistent and in-memory tracks without fetching', async () => {
        const { resource, deps } = harness();
        resource.ensure(collection, {});
        await settle();
        expect(resource.getSnapshot().tracks.map((track) => track.id)).toEqual(['cached', 'tail']);
        resource.pause();
        expect(resource.canReuse(collection)).toBe(true);
        resource.ensure(collection, {});
        await settle();
        expect(deps.getCollectionTracks).not.toHaveBeenCalled();
    });
    it('shows stale content immediately, then atomically swaps all refreshed pages', async () => {
        const { resource, deps } = harness(entry(Date.now() - ONLINE_TRACKS_FRESH_MS - 10));
        let finish!: (value: Awaited<ReturnType<typeof deps.getCollectionTracks>>) => void;
        vi.mocked(deps.getCollectionTracks)
            .mockResolvedValueOnce({ items: [song('first')], hasMore: true, total: 2, nextOffset: 1 })
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    })
            );
        resource.ensure(collection, {});
        await settle();
        expect(resource.getSnapshot().status).toBe('ready');
        expect(resource.getSnapshot().tracks.map((track) => track.id)).toEqual(['cached', 'tail']);
        expect(deps.writeCache).not.toHaveBeenCalled();
        finish({ items: [song('second')], hasMore: false, nextOffset: 2 });
        await settle();
        expect(resource.getSnapshot().tracks.map((track) => track.id)).toEqual(['first', 'second']);
        expect(deps.writeCache).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.any(Array),
            0,
            expect.objectContaining({ hasMore: false, fetchedAt: expect.any(Number) })
        );
    });
    it('keeps old rows on refresh failure and retries on next entry', async () => {
        const { resource, deps } = harness(entry(Date.now() - ONLINE_TRACKS_FRESH_MS - 10));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(deps.getCollectionTracks).mockRejectedValueOnce(new Error('offline'));
        resource.ensure(collection, {});
        await settle();
        expect(resource.getSnapshot().status).toBe('ready');
        expect(resource.getSnapshot().tracks).toHaveLength(2);
        resource.pause();
        resource.ensure(collection, {});
        await settle();
        expect(resource.getSnapshot().tracks[0].id).toBe('fresh');
    });
    it('ignores late refresh results after pause and does not poison persistent cache', async () => {
        const { resource, deps } = harness(entry(Date.now() - ONLINE_TRACKS_FRESH_MS - 10));
        let finish!: (value: Awaited<ReturnType<typeof deps.getCollectionTracks>>) => void;
        vi.mocked(deps.getCollectionTracks).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        resource.ensure(collection, {});
        await settle();
        resource.pause();
        finish({ items: [song('late')], hasMore: false, nextOffset: 1 });
        await settle();
        expect(resource.getSnapshot().tracks[0].id).toBe('cached');
        expect(deps.writeCache).not.toHaveBeenCalled();
    });
    it('applies deletion tombstones even when the refresh began before the mutation', async () => {
        const { resource, deps } = harness(entry(Date.now() - ONLINE_TRACKS_FRESH_MS - 10));
        let finish!: (value: Awaited<ReturnType<typeof deps.getCollectionTracks>>) => void;
        vi.mocked(deps.getCollectionTracks).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        resource.ensure(collection, {});
        await settle();
        resource.removeAt!(0, getPlaybackSongKey(song('cached')));
        finish({ items: [song('cached'), song('new')], hasMore: false, nextOffset: 2 });
        await settle();
        expect(resource.getSnapshot().tracks.map((track) => track.id)).toEqual(['new']);
        expect(deps.writeCache).toHaveBeenLastCalledWith(
            expect.any(String),
            expect.any(Array),
            0,
            expect.not.objectContaining({ fetchedAt: expect.any(Number) })
        );
    });
    it('rejects invalidated, malformed and old-schema snapshots instead of trusting timestamp zero', () => {
        expect(isTimedTracksCacheReadable({ ...entry(1), fetchedAt: undefined })).toBe(false);
        expect(isTimedTracksCacheReadable({ ...entry(1), nextOffset: -1 })).toBe(false);
        expect(isTimedTracksCacheReadable({ ...entry(1), schemaVersion: 0 })).toBe(false);
    });
});
