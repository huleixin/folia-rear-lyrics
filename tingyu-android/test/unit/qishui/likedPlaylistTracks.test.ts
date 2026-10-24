import { beforeEach, describe, expect, it, vi } from 'vitest';
import { qishuiCatalog } from '@/services/onlineMusic/qishui/qishuiCatalog';
import { clearQishuiPlayback } from '@/services/onlineMusic/qishui/qishuiPlayback';
import type { ProviderCollection } from '@/types/onlineMusic';
import { track } from './fixtures';

// The car bridge reads a playlist's rows with `/playlist/detail/`; the liked playlist is type 1,
// and without that type the service answers a single latest track. The renderer must pass the flag.

const request = vi.fn();
const likedCollection = (): ProviderCollection => ({
    providerId: 'qishui', type: 'playlist', id: '99', name: 'Liked', isOwned: true, isLiked: true,
});
const ordinaryCollection = (): ProviderCollection => ({
    providerId: 'qishui', type: 'playlist', id: '77', name: 'List', isOwned: true,
});

beforeEach(() => {
    clearQishuiPlayback();
    request.mockReset().mockResolvedValue({ ok: true, data: { items: [track()], hasMore: false, nextOffset: 1 } });
    vi.stubGlobal('window', { electron: { qishuiRequest: request } });
});

describe('Qishui liked playlist rows', () => {
    it('asks the liked playlist with its own type so all rows come back, not only the latest track', async () => {
        await qishuiCatalog.getPlaylistTracks?.('99', 30, 0, likedCollection());

        expect(request.mock.calls[0][0]).toBe('playlist_tracks');
        expect(request.mock.calls[0][1]).toMatchObject({ id: '99', liked: true });
    });

    it('leaves an ordinary playlist without the liked flag', async () => {
        await qishuiCatalog.getPlaylistTracks?.('77', 30, 0, ordinaryCollection());

        expect(request.mock.calls[0][1]).toMatchObject({ id: '77' });
        expect(request.mock.calls[0][1]).not.toHaveProperty('liked');
    });

    it('reads the liked playlist detail with the same type as its rows', async () => {
        request.mockResolvedValue({ ok: true, data: null });
        await qishuiCatalog.getPlaylistDetail?.('99', likedCollection());

        expect(request.mock.calls[0][0]).toBe('playlist_detail');
        expect(request.mock.calls[0][1]).toMatchObject({ id: '99', liked: true });
    });
});
