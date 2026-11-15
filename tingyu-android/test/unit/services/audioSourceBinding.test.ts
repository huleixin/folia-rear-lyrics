import { afterEach, expect, it } from 'vitest';
import { captureAudioSourceBinding, resolvedAudioCacheKey } from '@/services/onlineMusic/audioSourceBinding';
import { getSongResourceCacheKey } from '@/services/onlineMusic/resourceKeys';
import { useLxSourceStore } from '@/stores/useLxSourceStore';
import type { SongResult } from '@/types';

// test/unit/services/audioSourceBinding.test.ts
const saved = useLxSourceStore.getState();
afterEach(() => useLxSourceStore.setState(saved));
const song = { id: '7', sourceRef: { kind: 'online', providerId: 'qq', mediaId: '7' } } as SongResult;
it('keeps resolved bytes in their original source/quality variant after a selection change', async () => {
    useLxSourceStore.setState({extensionEnabled:true, activeId: 'A', revision: 5 });
    const bind = captureAudioSourceBinding(song, 'lossless');
    const key = getSongResourceCacheKey('audio', song, 'lossless');
    await bind({ url: 'https://example.com/a.flac', quality: 'lossless', fetchedAt: 1 });
    useLxSourceStore.setState({extensionEnabled:true, activeId: 'B', revision: 6 });
    expect(resolvedAudioCacheKey(song, 'https://example.com/a.flac')).toBe(key);
    expect(resolvedAudioCacheKey(song, 'https://example.com/unknown.flac')).toBeNull();
});
it('rejects an obsolete in-flight resolver instead of publishing it under the new script', async () => {
    const bind = captureAudioSourceBinding(song, 'high');
    useLxSourceStore.setState({extensionEnabled:true, revision: saved.revision + 1 });
    await expect(bind({ url: 'https://example.com/stale', quality: 'high', fetchedAt: 1 })).rejects.toThrow('Audio source changed');
});
it('never caches backup bytes as the original after the binding is evicted', async () => {
    useLxSourceStore.setState({extensionEnabled:true, activeId: null });
    const bind = captureAudioSourceBinding(song, 'high');
    const backup = { url: 'https://example.com/backup.mp3', quality: 'high' as const, fetchedAt: 1,
        backupSource: { providerId: 'netease', mediaId: 'other' } };
    await bind(backup);
    expect(resolvedAudioCacheKey(song, backup.url)).toBeNull();
    for (let i = 0; i < 257; i++) await bind({ url: 'https://example.com/' + i, quality: 'high', fetchedAt: 1 });
    expect(resolvedAudioCacheKey(song, backup.url)).toBeNull();
    expect(resolvedAudioCacheKey(song, 'https://example.com/unverified')).toBeNull();
});
