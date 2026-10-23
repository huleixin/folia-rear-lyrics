// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { qqProvider } from '@/services/onlineMusic/qqProvider';
import { searchQqMusicByType } from '@/services/onlineMusic/qqSearchTransport';

// test/unit/search/qqTypedPagination.test.ts
vi.mock('@/services/onlineMusic/qqSearchTransport', () => ({ searchQqMusicByType: vi.fn(), fetchQqSmartbox: vi.fn() }));
afterEach(() => vi.clearAllMocks());
describe('QQ numbered search pages', () => {
    it('advances past a short page so the next load cannot request that same page again', async () => {
        vi.mocked(searchQqMusicByType).mockResolvedValue({ items: [{ dissid: '9770607217', dissname: '回忆杀· 徐良许嵩汪苏泷本兮' }], more: true, total: 299 });
        const page = await qqProvider.search!.searchPlaylists!('许嵩', 3, 3);
        expect(page.items).toHaveLength(1); expect(page.hasMore).toBe(true); expect(page.nextOffset).toBe(6);
        await qqProvider.search!.searchPlaylists!('许嵩', 3, page.nextOffset);
        expect(vi.mocked(searchQqMusicByType).mock.calls[1]).toEqual(['playlist', '许嵩', 3, 6]);
    });
    it('stops on a genuinely empty page and rejects non-empty unrecognized records', async () => {
        vi.mocked(searchQqMusicByType).mockResolvedValueOnce({ items: [], more: true, total: 100 });
        expect((await qqProvider.search!.searchArtists!('许嵩', 20, 20)).hasMore).toBe(false);
        vi.mocked(searchQqMusicByType).mockResolvedValueOnce({ items: [{ missing_id: true }], more: false, total: 1 });
        await expect(qqProvider.search!.searchArtists!('许嵩', 20, 0)).rejects.toThrow(/unrecognized records/);
    });
});
