import { expect, it } from 'vitest';
import { currentAudioCollection, formatOfflineBytes } from '@/components/modal/settings/OfflineCacheOverview';
import type { AudioCacheStatus } from '@/services/audioPlaylistCache';

// test/unit/services/offlineCacheOverview.test.ts
// Global file counts must never become a playlist progress numerator.
it('selects the running playlist independently of global cache and task counts', () => {
    const current = { id: 'current', name: 'Current', total: 396, complete: 115, failed: 2, running: 1, pending: 278 };
    const status = { cached: 120, complete: 165, collections: [{ id: 'other', name: 'Other', total: 50, complete: 50, failed: 0 }, current] } as AudioCacheStatus;
    expect(currentAudioCollection(status)).toEqual(current);
});
it('has no fabricated zero-of-zero playlist when there are no tasks', () => {
    expect(currentAudioCollection({ collections: [] } as unknown as AudioCacheStatus)).toBeUndefined();
});
it('formats usage above eight GiB without truncating or adding a capacity limit', () => {
    expect(formatOfflineBytes(12.5 * 1073741824)).toBe('12.5 GB');
});
