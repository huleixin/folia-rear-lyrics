// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListeningRangeData } from '../../../src/library/core/bindings/useListeningRangeData';
import type { ListeningSessionRecord } from '../../../src/types/listeningStatistics';

// test/unit/library/listeningRangeData.test.ts
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ read: vi.fn(), account: 'a', hydration: 'ready' as 'loading' | 'ready' }));
vi.mock('../../../src/services/listeningStatistics', () => ({ readListeningSessions: mocks.read, LISTENING_STATISTICS_CHANGED: 'stats-changed' }));
vi.mock('../../../src/stores/useOnlineProviderAccountStore', () => {
    const state = () => ({ accounts: { qq: { hydration: mocks.hydration, status: 'authenticated', user: { id: mocks.account } } } });
    const useStore = (selector: (value: ReturnType<typeof state>) => unknown) => selector(state());
    Object.assign(useStore, { getState: state });
    return { useOnlineProviderAccountStore: useStore };
});
vi.mock('../../../src/library/core/services/unifiedLibrarySource', () => ({ libraryScope: () => ({ ready: true, authenticated: true, userId: mocks.account }) }));
let root: Root, host: HTMLDivElement, result: ReturnType<typeof useListeningRangeData>;
function Harness({ source = 'all', owner = 'a', active = true, from = '2024-01-01', to = '2024-01-31' }) {
    result = useListeningRangeData(source, owner, active, 'custom', { from, to }); return null;
}
const render = async (props = {}) => { await act(async () => root.render(React.createElement(Harness, props))); };
beforeEach(() => {
    mocks.account = 'a'; mocks.hydration = 'ready'; mocks.read.mockReset().mockResolvedValue([]);
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe('footprint date-scoped queries', () => {
    it('queries older calendar dates directly and filters to current accounts', async () => {
        await render();
        expect(mocks.read).toHaveBeenCalledWith(new Date('2024-01-01T00:00:00').getTime(), new Date('2024-02-01T00:00:00').getTime(), 50001, expect.any(Function));
        const accepts = mocks.read.mock.calls[0][3];
        expect(accepts({ providerId: 'qq', accountKey: 'a' })).toBe(true);
        expect(accepts({ providerId: 'qq', accountKey: 'b' })).toBe(false);
        expect(accepts({ providerId: 'netease', accountKey: 'a' })).toBe(false);
        expect(accepts({ providerId: 'local', accountKey: 'device' })).toBe(true);
        expect(result.loading).toBe(false);
    });
    it('does not read while inactive or with invalid dates', async () => {
        await render({ active: false }); expect(mocks.read).not.toHaveBeenCalled();
        await render({ from: 'invalid' }); expect(mocks.read).not.toHaveBeenCalled(); expect(result.loading).toBe(false);
    });
    it('waits for persisted account state before presenting the interval as empty', async () => {
        mocks.hydration = 'loading';
        await render();
        expect(mocks.read).not.toHaveBeenCalled();
        expect(result.loading).toBe(true);
        mocks.hydration = 'ready';
        await render();
        expect(mocks.read).toHaveBeenCalledTimes(1);
        expect(result.loading).toBe(false);
    });
    it('keeps local mode offline and refreshes after settlements or clearing', async () => {
        await render({ source: 'local' });
        const accepts = mocks.read.mock.calls[0][3];
        expect(accepts({ providerId: 'qq', accountKey: 'a' })).toBe(false);
        expect(accepts({ providerId: 'local' })).toBe(true);
        await act(async () => { window.dispatchEvent(new Event('stats-changed')); });
        expect(mocks.read).toHaveBeenCalledTimes(2);
    });
    it('does not publish an older date response over a newer selection', async () => {
        let resolve!: (records: ListeningSessionRecord[]) => void;
        mocks.read.mockReturnValueOnce(new Promise(value => { resolve = value; }));
        await render(); expect(result.loading).toBe(true);
        await render({ from: '2025-01-01', to: '2025-01-31' });
        await act(async () => resolve([{ id: 'stale' } as ListeningSessionRecord]));
        expect(result.records).toEqual([]); expect(result.loading).toBe(false);
    });
    it('hides prior account data immediately and rejects late responses', async () => {
        let resolve!: (records: ListeningSessionRecord[]) => void;
        mocks.read.mockReturnValueOnce(new Promise(value => { resolve = value; }));
        await render(); mocks.account = 'b'; await render({ owner: 'b' });
        await act(async () => resolve([{ id: 'private-a' } as ListeningSessionRecord]));
        expect(result.records).toEqual([]);
    });
    it('distinguishes read errors from empty history and permits retry', async () => {
        mocks.read.mockRejectedValueOnce(new Error('db')); await render(); expect(result.error).toBe(true);
        await act(async () => result.retry()); expect(result.error).toBe(false); expect(mocks.read).toHaveBeenCalledTimes(2);
    });
    it('caps a dense selected interval and marks the result as truncated', async () => {
        mocks.read.mockResolvedValueOnce(Array.from({ length: 50_001 }, (_, id) => ({ id } as unknown as ListeningSessionRecord)));
        await render();
        expect(result.records).toHaveLength(50_000); expect(result.truncated).toBe(true);
    });
});
