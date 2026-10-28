import { afterEach, expect, it } from 'vitest';
import { captureAudioSourceBinding, resolvedAudioCacheKey } from '@/services/onlineMusic/audioSourceBinding';
import { getSongResourceCacheKey } from '@/services/onlineMusic/resourceKeys';
import { useLxSourceStore } from '@/stores/useLxSourceStore';
import type { SongResult } from '@/types';

// test/unit/services/audioSourceBinding.test.ts
const saved = useLxSourceStore.getState();
afterEach(() => useLxSourceStore.setState(saved));
const song = { id: '7', sourceRef: { kind: 'online', providerId: 'qq', mediaId: '7' } } as SongResult;
it('keeps resolved bytes in their original source/quality variant after a selection change', () => {
    useLxSourceStore.setState({ activeId: 'A', revision: 5 });
    const bind = captureAudioSourceBinding(song, 'lossless');
    const key = getSongResourceCacheKey('audio', song, 'lossless');
    bind({ url: 'https://example.com/a.flac', quality: 'lossless', fetchedAt: 1 });
    useLxSourceStore.setState({ activeId: 'B', revision: 6 });
    expect(resolvedAudioCacheKey(song, 'https://example.com/a.flac')).toBe(key);
    expect(resolvedAudioCacheKey(song, 'https://example.com/unknown.flac')).toBeNull();
});
it('rejects an obsolete in-flight resolver instead of publishing it under the new script', () => {
    const bind = captureAudioSourceBinding(song, 'high');
    useLxSourceStore.setState({ revision: saved.revision + 1 });
    expect(() => bind({ url: 'https://example.com/stale', quality: 'high', fetchedAt: 1 })).toThrow('Audio source changed');
});
