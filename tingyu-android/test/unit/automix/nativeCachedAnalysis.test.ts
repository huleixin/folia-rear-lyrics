// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';

// test/unit/automix/nativeCachedAnalysis.test.ts
// Native analysis must reuse complete files even with the retired media switch off.
const state = vi.hoisted(() => ({ cached: vi.fn(), blob: vi.fn() }));
vi.mock('@/platform/runtime', () => ({ isCapacitorAndroid: () => true }));
vi.mock('@/services/persistentAudioCache', () => ({ readPersistentAudio: state.cached, isPersistentAudioUrl: (url: string) => url.startsWith('http://127.0.0.1:') }));
vi.mock('@/services/onlineMusic/resourceCache', () => ({ getCachedSongAudioBlob: state.blob }));
vi.mock('@/services/playbackRecovery/representationRegistry', () => ({ getPlaybackRepresentation: () => null, getPlaybackAnalysisKey: () => 'fixture' }));
const { readTrackProfileBytes } = await import('@/services/automix/profileService');
const song = { id: 'one', name: 'Fixture', sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'one' } } as SongResult;
beforeEach(() => { vi.clearAllMocks(); state.blob.mockResolvedValue(null); });
it('reads the native completed file without a second remote download or legacy switch', async () => {
    state.cached.mockResolvedValue({ url: 'http://127.0.0.1:123/offline-audio/token' });
    const bytes = new ArrayBuffer(16), fetcher = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes }); vi.stubGlobal('fetch', fetcher);
    expect(await readTrackProfileBytes({ song, audioUrl: 'https://remote.invalid/audio', enableMediaCache: false, audioQuality: 'lossless', wantGrid: false }, false)).toEqual({ bytes, partial: false });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['http://127.0.0.1:123/offline-audio/token']);
    expect(state.cached).toHaveBeenCalledWith(song, 'lossless');
});
it('waits for a complete native file even if the retired switch is on', async () => {
    state.cached.mockResolvedValue(null); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await readTrackProfileBytes({ song, audioUrl: 'https://remote.invalid/audio', enableMediaCache: true, wantGrid: false }, false)).toHaveProperty('skipped');
    expect(fetcher).not.toHaveBeenCalled();
});
it('does not fall back to a remote full download when a native file was removed', async () => {
    state.cached.mockResolvedValue({ url: 'http://127.0.0.1:123/offline-audio/token' });
    const fetcher = vi.fn().mockResolvedValue({ ok: false }); vi.stubGlobal('fetch', fetcher);
    expect(await readTrackProfileBytes({ song, audioUrl: 'https://remote.invalid/audio', enableMediaCache: true, wantGrid: false }, false)).toHaveProperty('skipped');
    expect(fetcher).toHaveBeenCalledTimes(1);
});
