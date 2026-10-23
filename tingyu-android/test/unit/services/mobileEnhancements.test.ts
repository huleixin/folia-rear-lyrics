import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberSearch, useSearchHistoryStore } from '@/stores/useSearchHistoryStore';
import { createHomeFeedResource } from '@/library/core/services/onlineHomeFeeds';
import { readHomeFeedSnapshot, writeHomeFeedSnapshot, HOME_FEED_FRESH_MS } from '@/library/core/services/homeFeedSnapshotCache';

// test/unit/services/mobileEnhancements.test.ts
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('mobile search history', () => {
    it('trims, deduplicates case-insensitively, and bounds persisted history', () => {
        expect(rememberSearch(['OLD', 'New'], ' old ')).toEqual(['old', 'New']);
        expect(rememberSearch(['kept'], ' ')).toEqual(['kept']);
        expect(rememberSearch(Array.from({ length: 20 }, (_, i) => String(i)), 'latest')).toHaveLength(20);
        expect(rememberSearch([], 'x'.repeat(200))[0]).toHaveLength(160);
    });
    it('separates providers and supports individual removal and clear', () => {
        useSearchHistoryStore.setState({ terms: {} });
        const history = useSearchHistoryStore.getState();
        history.remember('qq', 'one'); history.remember('netease', 'two');
        history.remove('qq', 'one');
        expect(useSearchHistoryStore.getState().terms.qq).toEqual([]);
        expect(useSearchHistoryStore.getState().terms.netease).toEqual(['two']);
        history.clear('netease');
        expect(useSearchHistoryStore.getState().terms.netease).toEqual([]);
    });
});
describe('account-scoped home snapshots', () => {
    it('restores fresh data immediately without a duplicate request, then revalidates stale data without clearing it', async () => {
        vi.useFakeTimers();
        const owner = { providerId: 'qq' as const, userId: 'mobile-home-test' };
        writeHomeFeedSnapshot('test-radio', owner, ['cached'], true);
        const load = vi.fn().mockResolvedValue(['fresh']);
        const resource = createHomeFeedResource({ label: 'test', cacheName: 'test-radio', empty: [] as string[], load });
        resource.setOwner(owner);
        expect(resource.getSnapshot().data).toEqual(['cached']);
        await resource.ensure(); expect(load).not.toHaveBeenCalled();
        resource.setOwner(null);
        vi.advanceTimersByTime(HOME_FEED_FRESH_MS + 1);
        resource.setOwner(owner);
        const refreshing = resource.ensure();
        expect(resource.getSnapshot().data).toEqual(['cached']);
        await refreshing;
        expect(resource.getSnapshot().data).toEqual(['fresh']);
        expect(readHomeFeedSnapshot('test-radio', { ...owner, userId: 'other-account' })).toBeNull();
        vi.advanceTimersByTime(8 * 86400_000);
        expect(readHomeFeedSnapshot('test-radio', owner)).toBeNull();
    });
    it('does not replace a successful cached page with empty data on refresh failure', async () => {
        const owner = { providerId: 'netease' as const, userId: 'test-preserve' };
        writeHomeFeedSnapshot('failure', owner, ['kept'], false);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const resource = createHomeFeedResource({ label: 'test', cacheName: 'failure', empty: [] as string[], load: async () => { throw new Error('offline'); } });
        resource.setOwner(owner); await resource.ensure();
        expect(resource.getSnapshot()).toMatchObject({ status: 'error', data: ['kept'] });
        error.mockRestore();
    });
});
