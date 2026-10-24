import i18n from '../../../i18n/config';
import type { OnlineCatalogProvider, OnlineLibraryProvider, ProviderCollection, ProviderPage } from '../../../types/onlineMusic';
import { OnlineProviderError } from '../../../types/onlineMusic';
import { normalizeQishuiCollection, normalizeQishuiSong, record, type QishuiRecord } from './qishuiNormalize';
import { requestQishui } from './qishuiTransport';
import { qishuiRecommendations } from './qishuiRecommendations';
import { createQishuiSceneCover } from './qishuiSceneCover';

// Catalogue and account collection reads; paging metadata is supplied by the car bridge.
const RECENT_ID = 'recent-played';
const recentCollection = async (): Promise<ProviderCollection> => ({ providerId: 'qishui', id: RECENT_ID, type: 'history',
    name: i18n.t('qishui.recentPlayed'), isOwned: false, coverUrl: await createQishuiSceneCover(RECENT_ID, '') });
export const qishuiCatalog: OnlineCatalogProvider = {
    async getPlaylistTracks(id, limit, offset, collection) {
        if (String(id).startsWith('scene-')) {
            if (offset > 0) return { items: [], hasMore: false, nextOffset: offset };
            const items = await qishuiRecommendations.getPersonalFm!({ mode: 'SCENE_RCMD', submode: String(id).slice(6) });
            return { items, hasMore: false, nextOffset: items.length };
        }
        if (id === RECENT_ID) {
            const page = await requestQishui<ProviderPage<unknown>>('recent_played', { limit, offset });
            return { ...page, items: page.items.map(normalizeQishuiSong) };
        }
        const page = await requestQishui<ProviderPage<unknown>>('playlist_tracks', { id: String(id), limit, offset,
            // 车机协议里「我喜欢」是 type=1 的歌单，普通歌单详情不带 type 只会回一条；
            // 安卓桥按这个标记改用 type=1 读全（桌面端该字段会被上游包忽略）。
            ...(collection?.isLiked === true ? { liked: true } : {}),
            ownerId: typeof collection?.providerData?.ownerId === 'string' ? collection.providerData.ownerId : '' });
        return { ...page, items: page.items.map(normalizeQishuiSong) };
    },
    async getPlaylistDetail(id, collection) {
        if (String(id).startsWith('scene-')) return collection ?? null;
        if (id === RECENT_ID) return recentCollection();
        const raw = await requestQishui('playlist_detail', { id: String(id), limit: 1,
            ...(collection?.isLiked === true ? { liked: true } : {}),
            ownerId: typeof collection?.providerData?.ownerId === 'string' ? collection.providerData.ownerId : '' });
        if (!raw) return null;
        const detail = normalizeQishuiCollection({ ...record(raw), isOwned: collection?.isOwned ?? record(raw).isOwned });
        return { ...collection, ...detail, ...(collection?.isLiked === true ? { isLiked: true } : {}) };
    },
    async getArtistSongs(id, limit, offset) {
        const page = await requestQishui<ProviderPage<unknown>>('artist_songs', { id: String(id), limit, offset });
        return { ...page, items: page.items.map(normalizeQishuiSong) };
    },
    async getArtistDetail(id) {
        const raw = await requestQishui('artist_detail', { id: String(id) });
        return raw ? normalizeQishuiCollection(raw, 'artist') : null;
    },
};
export const qishuiLibrary: OnlineLibraryProvider = {
    async getUserPlaylists(_userId, limit, offset) {
        // The read-only history card occupies one row; translate the library offset to playlist rows.
        const first = offset === 0;
        const page = await requestQishui<ProviderPage<QishuiRecord>>('user_playlists', {
            limit: first ? Math.max(1, limit - 1) : limit, offset: Math.max(0, offset - 1),
        });
        const rows = first && limit === 1 ? [] : page.items.map(item => normalizeQishuiCollection(item));
        const items = [...(first ? [await recentCollection()] : []), ...rows];
        return { items, hasMore: first && limit === 1 ? page.items.length > 0 || page.hasMore : page.hasMore,
            nextOffset: offset + items.length, ...(page.total === undefined ? {} : { total: page.total + 1 }) };
    },
    async getLikedSongIds() {
        const data = await requestQishui<{ ids: string[]; whole: boolean }>('liked_songs');
        if (!Array.isArray(data.ids) || data.ids.some(id => typeof id !== 'string' || !/^\d+$/.test(id)) || typeof data.whole !== 'boolean') {
            throw new OnlineProviderError('invalid-response', 'Qishui liked songs are missing', 'qishui');
        }
        console.info('[Qishui] Liked songs read', { count: data.ids.length, whole: data.whole });
        // Do not turn a partial set into an authoritative "unlike all missing" snapshot.
        if (!data.whole) throw new OnlineProviderError('invalid-response', 'Qishui liked-song list is incomplete', 'qishui');
        return data.ids;
    },
};
