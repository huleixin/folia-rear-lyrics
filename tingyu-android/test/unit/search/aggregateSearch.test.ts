import { describe, expect, it, vi } from 'vitest';
import { searchSources, type SourcePages } from '@/services/search/aggregateSearch';

// test/unit/search/aggregateSearch.test.ts
const page = (items: string[], nextOffset = items.length, hasMore = false) => ({ items, nextOffset, hasMore });
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
describe('bounded progressive aggregate search', () => {
    it('publishes fast results while a slow source is pending and isolates failure', async () => {
        let finish!: (value: ReturnType<typeof page>) => void;
        const snapshots: SourcePages<string>[] = [];
        const request = searchSources<string>({ sources: ['slow', 'fast', 'broken'], signal: new AbortController().signal,
            key: value => value, valid: () => true, publish: value => snapshots.push(value),
            fetch: async source => source === 'slow' ? new Promise(resolve => { finish = resolve; })
                : source === 'fast' ? page(['song']) : Promise.reject(new Error('offline')) });
        await tick();
        expect(snapshots.at(-1)?.fast.items).toEqual(['song']);
        expect(snapshots.at(-1)?.slow.status).toBe('loading');
        expect(snapshots.at(-1)?.broken.error).toBe('offline');
        finish(page(['late'])); await request;
        expect(snapshots.at(-1)?.slow.items).toEqual(['late']);
    });
    it('uses source cursors, preserves prior items and stops a nonadvancing cursor', async () => {
        const previous: SourcePages<string> = {
            a: { items: ['a1'], offset: 17, hasMore: true, status: 'ready', error: null },
            b: { items: ['b1'], offset: 6, hasMore: false, status: 'ready', error: null },
            c: { items: [], offset: 0, hasMore: false, status: 'error', error: 'retry' },
        };
        const fetch = vi.fn(async (source: string, offset: number) => source === 'a' ? page(['a1', 'a2'], offset, true) : page(['c1']));
        let result = previous;
        await searchSources<string>({ sources: ['a', 'b', 'c'], previous, signal: new AbortController().signal,
            key: value => value, valid: () => true, fetch, publish: pages => { result = pages; } });
        expect(fetch.mock.calls.map(([source, offset]) => [source, offset])).toEqual([['a', 17], ['c', 0]]);
        expect(result.a.items).toEqual(['a1', 'a2']); expect(result.a.hasMore).toBe(false);
        expect(previous.a.items).toEqual(['a1']); expect(result.b).toBe(previous.b);
    });
    it('reserves at most three slots and never starts cancelled queued work', async () => {
        const controller = new AbortController();
        const fetch = vi.fn(async () => new Promise<ReturnType<typeof page>>(() => {}));
        const publish = vi.fn();
        const request = searchSources<string>({ sources: ['1', '2', '3', '4', '5'], signal: controller.signal,
            key: value => value, valid: () => true, fetch, publish });
        await tick(); expect(fetch).toHaveBeenCalledTimes(3);
        controller.abort(); await request;
        expect(fetch).toHaveBeenCalledTimes(3); expect(publish).toHaveBeenCalledTimes(1);
        const fresh = vi.fn(async () => page(['fresh']));
        await searchSources<string>({ sources: ['new'], signal: new AbortController().signal, key: value => value, valid: () => true, fetch: fresh, publish });
        expect(fresh).toHaveBeenCalledTimes(1);
    });
});
