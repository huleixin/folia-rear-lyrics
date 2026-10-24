import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { track } from './fixtures';

// test/unit/qishui/packagePaging.test.ts
// The actual Android protocol and adapter run together; only HTTP and storage are fixtures.
const values = new Map<string, string>();
beforeEach(() => {
    vi.resetModules(); values.clear();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('Qishui Android paging', () => {
    it('walks opaque upstream cursors while exposing exact row offsets', async () => {
        const cursors: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (raw: string, options: { body?: string }) => {
            const path = new URL(raw).pathname;
            if (path.endsWith('/client/token/get/')) return Response.json({ client_token: 'fixture-token' });
            expect(path.endsWith('/playlist/detail/')).toBe(true);
            const body = JSON.parse(options.body!); cursors.push(body.cursor);
            return Response.json({ data: body.cursor === '0'
                ? { media_entities: [1, 2, 3].map(id => ({ track_entity: track(String(id)) })), has_more: true, next_cursor: 'opaque:next' }
                : { media_entities: [4, 5].map(id => ({ track_entity: track(String(id)) })), has_more: false } });
        }));
        const { handleQishuiRequest } = await import('@/nativeBridge/api/qishui.js');
        vi.stubGlobal('window', { electron: { qishuiRequest: handleQishuiRequest } });
        const { qishuiCatalog } = await import('@/services/onlineMusic/qishui/qishuiCatalog');
        const page = await qishuiCatalog.getPlaylistTracks!('99', 3, 2);
        expect(page.items.map(song => String(song.id))).toEqual(['3', '4', '5']);
        expect(page).toMatchObject({ hasMore: false, nextOffset: 5 });
        expect(cursors).toEqual(['0', 'opaque:next']);
    });
    it('rejects stalled cursors instead of reporting an incomplete playlist as complete', async () => {
        vi.stubGlobal('fetch', vi.fn(async (raw: string) => new URL(raw).pathname.endsWith('/client/token/get/')
            ? Response.json({ client_token: 'fixture-token' })
            : Response.json({ data: { media_entities: [{ track_entity: track('1') }], has_more: true, next_cursor: '0' } })));
        const { handleQishuiRequest } = await import('@/nativeBridge/api/qishui.js');
        expect(await handleQishuiRequest('playlist_tracks', { id: '99', limit: 30, offset: 0 }))
            .toMatchObject({ ok: false, error: { code: 'invalid-response', message: 'Playlist cursor did not advance' } });
    });
    it('does not replace complete likes with a partial snapshot', async () => {
        vi.stubGlobal('window', { electron: { qishuiRequest: async () => ({ ok: true, data: { ids: ['7'], whole: false } }) } });
        const { qishuiLibrary } = await import('@/services/onlineMusic/qishui/qishuiCatalog');
        await expect(qishuiLibrary.getLikedSongIds!('account')).rejects.toMatchObject({ code: 'invalid-response' });
    });
});
