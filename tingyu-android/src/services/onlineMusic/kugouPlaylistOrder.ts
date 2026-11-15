import { OnlineProviderError, type ProviderPage } from '../../types/onlineMusic';

// src/services/onlineMusic/kugouPlaylistOrder.ts
export const KUGOU_PLAYLIST_PAGE_SIZE = 100;

type PlaylistPageLoader<T> = (page: number) => Promise<{ items: T[]; total?: number }>;

const sliceClientOrder = <T>(songs: T[], limit: number, offset: number): ProviderPage<T> => {
    const items = songs.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return { items, total: songs.length, nextOffset, hasMore: nextOffset < songs.length };
};

/** Read a window of the globally reversed playlist, not a reversed window of the API list. */
export async function readKugouPlaylistInClientOrder<T>(
    id: string, limit: number, offset: number,
    loadPage: PlaylistPageLoader<T>, loadAllInClientOrder: () => Promise<T[]>,
): Promise<ProviderPage<T>> {
    const take = Math.min(Math.max(1, Math.floor(limit)), KUGOU_PLAYLIST_PAGE_SIZE);
    const first = await loadPage(1);
    const total = first.total ?? Number.NaN;
    const invalidPage = () => new OnlineProviderError(
        'invalid-response', `KuGou playlist ${id} returned inconsistent page lengths; reload the playlist`, 'kugou',
    );
    if (first.items.length > KUGOU_PLAYLIST_PAGE_SIZE) throw invalidPage();
    if (first.items.length < KUGOU_PLAYLIST_PAGE_SIZE) {
        if (total > first.items.length) throw invalidPage();
        return sliceClientOrder(first.items.slice().reverse(), take, offset);
    }
    // A full page's count may describe only that page. Without a trustworthy total, reuse the complete
    // liked/mutation loader rather than pretending that this first page is the entire playlist.
    if (!Number.isSafeInteger(total) || total <= KUGOU_PLAYLIST_PAGE_SIZE) {
        return sliceClientOrder(await loadAllInClientOrder(), take, offset);
    }

    const end = Math.max(0, total - offset);
    const start = Math.max(0, end - take);
    if (end === 0) return { items: [], total, nextOffset: offset, hasMore: false };
    const firstPage = Math.floor(start / KUGOU_PLAYLIST_PAGE_SIZE) + 1;
    const lastPage = Math.floor((end - 1) / KUGOU_PLAYLIST_PAGE_SIZE) + 1;
    // At most two source pages intersect a display window. Page one already provided the total.
    const pages = await Promise.all(Array.from({ length: lastPage - firstPage + 1 }, async (_, i) => {
        const page = firstPage + i;
        const result = page === 1 ? first : await loadPage(page);
        const expected = Math.min(KUGOU_PLAYLIST_PAGE_SIZE, total - (page - 1) * KUGOU_PLAYLIST_PAGE_SIZE);
        if (result.items.length !== expected || (result.total !== undefined && result.total > KUGOU_PLAYLIST_PAGE_SIZE && result.total !== total)) {
            throw invalidPage();
        }
        return result.items;
    }));
    const pageStart = (firstPage - 1) * KUGOU_PLAYLIST_PAGE_SIZE;
    const items = pages.flat().slice(start - pageStart, end - pageStart).reverse();
    const nextOffset = offset + items.length;
    return { items, total, nextOffset, hasMore: nextOffset < total };
}
