import type { OnlineMusicProvider, ProviderPage, QrLoginState } from '../../../types/onlineMusic';
import { OnlineProviderError } from '../../../types/onlineMusic';
import { createProviderSongMetadata } from '../../../utils/songMetadata';
import { requestQishui, getQishuiAvailability, getQishuiLastFailure, QishuiRequestError } from './qishuiTransport';
import { normalizeQishuiSong, normalizeQishuiUser, normalizeQishuiCollection } from './qishuiNormalize';
import { qishuiCatalog, qishuiLibrary } from './qishuiCatalog';
import { parseQishuiLyrics } from './qishuiLyrics';
import { qishuiRecommendations, clearQishuiRecommendations } from './qishuiRecommendations';
import { qishuiMutations, qishuiSongId as songId } from './qishuiMutations';
import { qishuiPlayback, clearQishuiPlayback, readQishuiSongs } from './qishuiPlayback';

// Car platform adapter; account and catalogue operations share the existing Omni entry points.
// What belongs to one sign-in: the explore stream's memory, the scene catalogue and the playability checks.
// Dropped together whenever the account changes: confirmed, signed out, or the sign-in ran out.
function clearAccountState() { clearQishuiRecommendations(); clearQishuiPlayback(); }
export const qishuiProvider: OnlineMusicProvider = {
    id: 'qishui', displayName: '汽水音乐', shortName: '汽水',
    getAvailability: getQishuiAvailability,
    capabilities: { search: true, playback: true, lyrics: true, wordByWordLyrics: true, auth: true,
        userLibrary: true, playlists: true, albums: false, artists: true, recommendations: true,
        mutations: true, likes: true, playlistTrackMutations: true, personalFmModes: false },
    normalizeSong: normalizeQishuiSong, normalizeUser: normalizeQishuiUser, normalizeCollection: normalizeQishuiCollection,
    songMetadata: { getSongMetadata: createProviderSongMetadata },
    getSongPageUrl: song => `https://music.douyin.com/qishui/share/track?track_id=${encodeURIComponent(songId(song))}`,
    search: {
        async searchPlaylists(query, limit, offset) {
            if (!query.trim()) return { items: [], hasMore: false, nextOffset: offset };
            const page = await requestQishui<ProviderPage<unknown>>('search_playlists', { query, limit, offset });
            return { ...page, items: page.items.map(raw => {
                const value = normalizeQishuiCollection(raw);
                return { providerId: 'qishui', id: value.id, name: value.name, coverUrl: value.coverUrl,
                    description: value.description, trackCount: value.trackCount, creatorName: value.creator?.nickname };
            }) };
        },
        async searchSongs(query, limit, offset) {
            if (!query.trim()) return { items: [], hasMore: false, nextOffset: offset };
            const page = await requestQishui<ProviderPage<unknown>>('search', { query, limit, offset });
            return { ...page, items: await readQishuiSongs(page.items) };
        },
    },
    playback: qishuiPlayback,
    lyrics: { getLyrics: async song => parseQishuiLyrics(await requestQishui('lyrics', { id: songId(song) })) },
    auth: {
        async getQrLoginDiagnostics() {
            const failure = getQishuiLastFailure();
            return failure ? [`stage=${failure.stage} code=${failure.code} upstreamCode=${failure.upstreamCode}`] : [];
        },
        async getLoginStatus() { const user = await requestQishui('login_status'); return user ? normalizeQishuiUser(user) : null; },
        async getQrKey() { return (await requestQishui<{ key: string }>('login_qr_key')).key; },
        async createQr(key) { return (await requestQishui<{ imageUrl: string }>('login_qr_create', { key })).imageUrl; },
        async checkQr(key) {
            try {
                const result = await requestQishui<QrLoginState>('login_qr_check', { key });
                if (result.state === 'confirmed') clearAccountState();
                return result;
            } catch (error) {
                if (error instanceof OnlineProviderError && error.code === 'network') return { state: 'error', transient: true, message: 'Network request failed' };
                throw error;
            }
        },
        async cancelQr(key) { await requestQishui('login_qr_cancel', { key }); },
        getQrTtlMs: () => 300000,
        async logout() { clearAccountState(); await requestQishui('logout'); },
    },
    catalog: qishuiCatalog, library: qishuiLibrary,
    recommendations: qishuiRecommendations,
    mutations: qishuiMutations,
};
