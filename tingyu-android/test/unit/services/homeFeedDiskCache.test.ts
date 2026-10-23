// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

// test/unit/services/homeFeedDiskCache.test.ts
afterEach(() => { localStorage.clear(); vi.resetModules(); });
it('restores the account-specific recommendation snapshot after a cold module start', async () => {
    const owner = { providerId: 'qq' as const, userId: 'disk-test' };
    const cache = await import('@/library/core/services/homeFeedSnapshotCache');
    cache.writeHomeFeedSnapshot('disk', owner, { recommended: ['one'] }, true);
    expect(localStorage.length).toBe(1);
    vi.resetModules();
    const cold = await import('@/library/core/services/homeFeedSnapshotCache');
    expect(cold.readHomeFeedSnapshot('disk', owner)).toMatchObject({ complete: true, data: { recommended: ['one'] } });
    expect(cold.readHomeFeedSnapshot('disk', { ...owner, userId: 'different-user' })).toBeNull();
});
it('ignores corrupt and expired disk snapshots without blocking launch', async () => {
    const owner = { providerId: 'netease' as const, userId: 1 };
    const key = 'folia:home-feed:v1:' + JSON.stringify(['disk', 'netease', '1']);
    localStorage.setItem(key, '{broken');
    const cache = await import('@/library/core/services/homeFeedSnapshotCache');
    expect(cache.readHomeFeedSnapshot('disk', owner)).toBeNull();
    localStorage.setItem(key, JSON.stringify({ data: ['old'], complete: true, savedAt: Date.now() - 8 * 86400_000 }));
    expect(cache.readHomeFeedSnapshot('disk', owner)).toBeNull();
});
