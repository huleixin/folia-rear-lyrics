// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListeningCatalogNavigation } from '../../../src/library/core/bindings/useListeningCatalogNavigation';
import type { ListeningEntitySummary } from '../../../src/services/listeningStatistics';

// test/unit/library/listeningCatalogNavigation.test.ts
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), account: 'a' }));
vi.mock('../../../src/library/core/services/listeningCollection', () => ({ listeningEntityCollection: mocks.resolve }));
vi.mock('../../../src/library/core/services/unifiedLibrarySource', () => ({ libraryScope: () => ({ userId: mocks.account }) }));
const entry: ListeningEntitySummary = { key: 'qq:artist', name: 'Artist', seconds: 60, plays: 1, entity: { id: 3, name: 'Artist' },
    song: { id: 1, name: 'Song', durationMs: 180000, artists: [], album: { id: 4, name: 'Album' }, sourceRef: { kind: 'online', providerId: 'qq', mediaId: '1' } } };
let root: Root, host: HTMLDivElement, result: ReturnType<typeof useListeningCatalogNavigation>;
const open = vi.fn();
function Harness({ owner = 'a', active = true, opened = true }) {
    result = useListeningCatalogNavigation(owner, active, opened, { localSongs: [],
        localLibraryCatalog: { entities: [], assignments: [], ready: true, reload: async () => {} }, onOpenGridView: open });
    return null;
}
const render = async (props = {}) => { await act(async () => root.render(React.createElement(Harness, props))); };
beforeEach(async () => {
    mocks.account = 'a'; mocks.resolve.mockReset(); open.mockReset();
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe('listening catalog request lifetime', () => {
    it('opens the original resolved descriptor', async () => {
        const descriptor = { source: 'online', providerId: 'qq', type: 'artist', id: 'real-mid' };
        mocks.resolve.mockResolvedValue(descriptor);
        await act(async () => result.openEntity(entry, 'artist'));
        expect(open).toHaveBeenCalledWith(descriptor); expect(result.catalogError).toBe(false);
    });
    it.each(['account', 'page', 'owner', 'newer'] as const)('ignores late results after %s changes', async change => {
        let resolve!: (value: unknown) => void;
        mocks.resolve.mockReturnValueOnce(new Promise(value => { resolve = value; }));
        let pending!: Promise<void>;
        await act(async () => { pending = result.openEntity(entry, 'artist'); });
        if (change === 'account') mocks.account = 'b';
        if (change === 'page') await render({ opened: false });
        if (change === 'owner') await render({ owner: 'b' });
        if (change === 'newer') {
            mocks.resolve.mockResolvedValue(null);
            await act(async () => result.openEntity(entry, 'album'));
        }
        await act(async () => { resolve({ source: 'online', id: 'stale' }); await pending; });
        expect(open).not.toHaveBeenCalled();
    });
    it('shows resolver failures without navigating or swallowing them as success', async () => {
        mocks.resolve.mockRejectedValue(new Error('unavailable'));
        await act(async () => result.openEntity(entry, 'album'));
        expect(result.catalogError).toBe(true); expect(open).not.toHaveBeenCalled();
        await render({ opened: false }); expect(result.catalogError).toBe(false);
    });
});
