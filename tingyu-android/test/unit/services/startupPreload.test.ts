// @vitest-environment jsdom
import { act, createElement as h, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createPreloadableComponent, preloadStartupInteractiveSurfaces } from '@/services/startupPreload';
import { createOnlineCollectionResource } from '@/library/core/services/onlineCollectionResource';
import { COLLECTION_TRACK_SNAPSHOT_SCHEMA_VERSION } from '@/library/core/services/collectionTrackSnapshot';
import type { OnlineGridViewCollectionDescriptor } from '@/library/core/contracts/collection';

// test/unit/services/startupPreload.test.ts
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('startupPreload and cache warm', () => {
    it('renders preloaded components synchronously on first mount without Suspense fallback', async () => {
        const loader = createPreloadableComponent<{ label: string }>(async () => ({
            default: ({ label }) => h('span', { 'data-testid': 'ready' }, label),
        }));
        expect(loader.isLoaded()).toBe(false);
        await preloadStartupInteractiveSurfaces(200);
        expect(loader.isLoaded()).toBe(true);
        const host = document.createElement('div');
        document.body.append(host);
        const root = createRoot(host);
        try {
            act(() => {
                root.render(
                    h(Suspense, { fallback: h('span', null, 'fallback') }, h(loader.Component, { label: 'instant' })),
                );
            });
            expect(host.textContent).toBe('instant');
        } finally {
            act(() => root.unmount());
            host.remove();
        }
    });

    it('warms online collection resource from local cache without firing network requests', async () => {
        const getCollectionTracks = vi.fn();
        const getCollectionDetail = vi.fn(async () => null);
        const descriptor: OnlineGridViewCollectionDescriptor = {
            source: 'online',
            providerId: 'qq',
            id: 'pl-1',
            name: '我喜欢',
            type: 'playlist',
            tracksUpdatedAt: 100,
        };
        const resource = createOnlineCollectionResource('online:qq:playlist:pl-1', {
            getCollectionTracks,
            getCollectionDetail,
            getPersonalFm: vi.fn(async () => []),
            getDailySongs: vi.fn(async () => []),
            readCache: vi.fn(async () => ({
                tracks: [{ id: 's1', name: 'Song 1', artist: 'A', artists: [], album: 'B', durationMs: 180000, pic_id: '', url_id: '', lyric_id: '', source: 'qq' } as unknown as SongResult],
                snapshotTime: 100,
                schemaVersion: COLLECTION_TRACK_SNAPSHOT_SCHEMA_VERSION,
                nextOffset: 1,
                hasMore: false,
            })),
            writeCache: vi.fn(async () => {}),
        });
        const warmed = await resource.warmCache!(descriptor, { currentUserId: 'u1' });
        expect(warmed).toBe(true);
        expect(getCollectionTracks).not.toHaveBeenCalled();
        expect(resource.getSnapshot().status).toBe('ready');
        expect(resource.getSnapshot().tracks).toHaveLength(1);
        expect(resource.canReuse(descriptor)).toBe(true);
    });
});
import type { SongResult } from '@/types';
