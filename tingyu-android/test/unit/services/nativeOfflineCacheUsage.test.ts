// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { appDatabase } from '@/services/appDatabase';
import { clearDownloadableCaches, getCacheUsageByCategory } from '@/services/db';

// Native cache totals and cache-only cleanup must not reset personal library data.
const native = vi.hoisted(() => ({
    audioOffline: vi.fn(async () => ({ bytes: 42, cached: 1 })),
    resourceCache: vi.fn(async () => ({ lyricsBytes: 2, artworkBytes: 3 })),
}));
vi.mock('@/platform/runtime', () => ({ isCapacitorAndroid: () => true }));
vi.mock('@/platform/tingyuPlayback', () => ({ getTingyuPlayback: () => native }));
vi.mock('@/services/binaryAssetStore', () => ({ getCoverAssetUsage: async () => 0, clearCoverAssets: async () => {} }));
beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([appDatabase.api_cache.clear(), appDatabase.user_cache.clear(), appDatabase.media_cache.clear(), appDatabase.metadata_cache.clear()]);
});
it('includes native audio and shared resource usage in the existing storage totals', async () => {
    expect(await getCacheUsageByCategory()).toMatchObject({ media: 42, mediaCount: 1, lyrics: 2, cover: 3 });
});
it('clears native caches while preserving the library and appearance database', async () => {
    await appDatabase.local_music.put({ id: 'preserved-song', name: 'Local' } as any);
    await appDatabase.appearance_profiles.put({ id: 'preserved-look', data: { accent: '#abc' } });
    await appDatabase.media_cache.put({ key: 'audio_fixture', data: 'cached', timestamp: 1 });
    await clearDownloadableCaches();
    expect(await appDatabase.local_music.get('preserved-song')).toBeTruthy();
    expect(await appDatabase.appearance_profiles.get('preserved-look')).toBeTruthy();
    expect(native.audioOffline).toHaveBeenCalledWith({ action: 'clear' });
    expect(native.resourceCache).toHaveBeenCalledWith({ action: 'clear-lyrics' });
    expect(native.resourceCache).toHaveBeenCalledWith({ action: 'clear-cover' });
    expect(await appDatabase.media_cache.get('audio_fixture')).toBeUndefined();
});
