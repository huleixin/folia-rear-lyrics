// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleQQSmartbox, handleQQTypedSearch } from '@/nativeBridge/api/qq';

// test/unit/nativeBridge/qqSearchBridge.test.ts
// 桥接层回归：综合搜索/联想必须走真机可用的 musicu / smartbox 通道。
// 这里拦下 fetch，断言请求形态与解析，避免再次把「未实现的路由」当成能力。

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

const jsonResponse = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('Android bridge QQ typed search', () => {
    it('sends DoSearchForQQMusicLite with the singer type and maps meta', async () => {
        let payload: any = null;
        globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => {
            payload = JSON.parse(String(init?.body || '{}'));
            return jsonResponse({
                code: 0,
                request: {
                    code: 0,
                    data: {
                        meta: { sum: 10, nextpage: 2 },
                        body: { singer: [{ singerMID: '000CK5xN3yZDJt', singerName: '许嵩', songNum: 430, albumNum: 59 }] },
                    },
                },
            });
        }) as unknown as typeof fetch;

        const page = await handleQQTypedSearch('许嵩', 'singer', 20, 1, '');
        expect(payload.request.module).toBe('music.search.SearchCgiService');
        expect(payload.request.method).toBe('DoSearchForQQMusicLite');
        expect(payload.request.param).toMatchObject({ query: '许嵩', search_type: 1, num_per_page: 20, page_num: 1 });
        expect(page).toMatchObject({ type: 'singer', total: 10, more: true, page: 1 });
        expect(page.items[0]).toMatchObject({ singerMID: '000CK5xN3yZDJt' });
    });

    it('uses distinct type codes for album and playlist', async () => {
        const seen: number[] = [];
        globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => {
            seen.push(JSON.parse(String(init?.body || '{}')).request.param.search_type);
            return jsonResponse({ code: 0, request: { code: 0, data: { meta: { sum: 0 }, body: {} } } });
        }) as unknown as typeof fetch;
        await handleQQTypedSearch('许嵩', 'album', 10, 1, '');
        await handleQQTypedSearch('许嵩', 'playlist', 10, 1, '');
        expect(seen).toEqual([2, 3]);
    });

    it('rejects HTTP success with a missing business result model', async () => {
        globalThis.fetch = vi.fn(() => jsonResponse({ code: 0, request: { code: 0, data: { meta: { sum: 12 }, body: {} } } })) as unknown as typeof fetch;
        await expect(handleQQTypedSearch('许嵩', 'singer', 10, 1, '')).rejects.toThrow(/invalid result model/);
    });

    it('surfaces an upstream refusal as an error instead of an empty list', async () => {
        globalThis.fetch = vi.fn(() => jsonResponse({ code: 2001, request: { code: 2001, data: {} } })) as unknown as typeof fetch;
        await expect(handleQQTypedSearch('许嵩', 'singer', 10, 1, '')).rejects.toThrow(/QQ typed search failed/);
    });
});

describe('Android bridge QQ smartbox', () => {
    it('returns the real singer/song/album sections, trimmed to suggestion size', async () => {
        globalThis.fetch = vi.fn(() => jsonResponse({
            code: 0,
            data: {
                singer: { count: 3, itemlist: [{ mid: 'm1', name: '许嵩' }, { mid: 'm2', name: '许嵩2' }] },
                song: { count: 9, itemlist: [{ mid: 's1', name: 'A' }, { mid: 's2', name: 'B' }, { mid: 's3', name: 'C' }, { mid: 's4', name: 'D' }, { mid: 's5', name: 'E' }] },
                album: { count: 4, itemlist: [{ mid: 'a1', name: 'X' }, { mid: 'a2', name: 'Y' }, { mid: 'a3', name: 'Z' }] },
                mv: { count: 1, itemlist: [{ mid: 'v1' }] },
            },
        })) as unknown as typeof fetch;
        const result = await handleQQSmartbox('许嵩', 4);
        expect(result.data.singer.itemlist).toHaveLength(1);
        expect(result.data.song.itemlist).toHaveLength(4);
        expect(result.data.album.itemlist).toHaveLength(2);
        expect(result.data.mv.itemlist).toHaveLength(1);
    });

    it('rejects an upstream error so the UI can fall back quietly', async () => {
        globalThis.fetch = vi.fn(() => jsonResponse({ code: 500, data: null })) as unknown as typeof fetch;
        await expect(handleQQSmartbox('许嵩', 4)).rejects.toThrow(/QQ smartbox failed/);
    });
});
