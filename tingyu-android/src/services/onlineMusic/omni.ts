import type { SongResult, UnifiedSong } from '../../types';
import type {
    AudioQualityPreference,
    MediaId,
    OmniAudioSource,
    OmniChorusRange,
    OmniCollection,
    OmniHistoryEntry,
    OmniLyricsResult,
    OmniPage,
    OmniPlaybackReport,
    OmniProviderCapabilities,
    OmniProviderId,
    OmniProviderSummary,
    OmniSongAvailability,
    OmniSongReplacement,
    OmniUser,
    OnlineMusicProvider,
    PersonalFmRequestOptions,
    ProviderCatalogEntityKind,
    LoginSelfCheckResult,
    QrLoginMethod,
    QrLoginState,
} from '../../types/onlineMusic';
import { resolveProviderLyricsChorus } from '../../utils/lyrics/chorusResolver';
import { OnlineProviderError } from '../../types/onlineMusic';
import {
    emptySearchCapabilities,
    type SearchAlbumHit,
    type SearchArtistHit,
    type SearchCapabilities,
    type SearchPage,
    type SearchPlaylistHit,
    type SearchSuggestions,
} from '../../types/search';
import { resolveSearchCapabilities } from '../../types/onlineMusic';
import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { saveSongReplayGain } from './resourceCache';
import {
    getOnlineMusicProvider,
    getOnlineMusicProviderForSong,
    getOnlineMusicProviderRegistryVersion,
    listOnlineMusicProviders,
    providerSupports,
    requireOnlineMusicProvider,
    subscribeOnlineMusicProviderRegistry,
} from './providerRegistry';
import { saveProviderAccountSnapshot } from './providerAccountCache';
import { applyOmniAudioHook, applyOmniLyricsHook } from '../hostExtensionHooks';
import { recordCollectionOrderPage } from '../../utils/collectionOrderDiagnostics';
import { noteOnlineMutationFailure } from '../../utils/onlineMutationDiagnostics';
import { noteOnlinePlaybackError, noteOnlinePlaybackOutcome } from '../../utils/onlinePlaybackDiagnostics';

// src/services/onlineMusic/omni.ts
// Online Music Network Interface (Omni) - a unified interface for interacting with multiple online music providers.


type PageInput = { limit: number; offset: number };

const activeProviderId = (): OmniProviderId => {
    const storedProviderId = useOnlineProviderAccountStore.getState().activeProviderId;
    // A persisted selection can outlive its provider when switching builds or branches.
    return getOnlineMusicProvider(storedProviderId) ? storedProviderId : 'netease';
};

const activeProvider = () => requireOnlineMusicProvider(activeProviderId());

const providerForSong = (song: SongResult) => {
    const provider = getOnlineMusicProviderForSong(song);
    if (!provider) throw new OnlineProviderError('unsupported', 'Song is not owned by an online provider');
    return provider;
};

const providerForCollection = (collection: OmniCollection) => requireOnlineMusicProvider(collection.providerId);

const unsupported = (providerId: OmniProviderId, capability: string): never => {
    throw new OnlineProviderError('unsupported', `${capability} is not supported by ${providerId}`, providerId);
};

const emptyPage = <T>(offset: number): OmniPage<T> => ({ items: [], hasMore: false, nextOffset: offset });
const emptyTypedPage = <T>(offset: number): SearchPage<T> => ({ items: [], hasMore: false, nextOffset: offset });

/**
 * 写入的公共出口：失败时留一条诊断再往上抛。
 *
 * 这些失败在报告里以前完全看不到 —— provider 在缺少 songmid / tid / mid 时是**提前拒绝**的
 * （一个请求都不发，桥的请求轨迹里自然什么都没有），用户只看到「收藏失败」，无法判断是缺标识、
 * 缺登录还是上游拒收。记下 provider / 操作 / 条目 / 原因，报告里单列一段。
 */
const runOnlineMutation = async <T>(
    providerId: string,
    operation: string,
    mediaId: string | number,
    run: () => Promise<T>,
): Promise<T> => {
    try {
        return await run();
    } catch (error) {
        noteOnlineMutationFailure({ providerId, operation, mediaId, error });
        throw error;
    }
};

// 点赞状态改完要落盘：只更内存的话，重启后靠快照 hydration 的那一帧会恢复旧心形，
// 后台刷新再失败就一直是旧的。行号是会话级的，不进快照。
const persistProviderLikedSongIds = async (providerId: OmniProviderId): Promise<void> => {
    const account = useOnlineProviderAccountStore.getState().accounts[providerId];
    if (!account?.user) return;
    try {
        await saveProviderAccountSnapshot(providerId, {
            user: account.user,
            collections: account.collections || [],
            likedSongIds: account.likedSongIds || [],
        });
    } catch (error) {
        // 落盘失败不能把一次成功的 mutation 变成失败，下一次刷新会补上。
        console.warn('[Omni] Failed to persist liked songs after a like mutation', {
            providerId,
            name: error instanceof Error ? error.name : 'Error',
        });
    }
};

// 歌单内的行号（KuGou fileid）只在解析它的那一刻有效，失败后必须丢掉，下次重新解析。
const dropProviderLikedFileId = (providerId: OmniProviderId, songKey: string): void => {
    const account = useOnlineProviderAccountStore.getState().accounts[providerId];
    if (!account?.likedSongFileIds || account.likedSongFileIds[songKey] === undefined) return;
    const likedSongFileIds = { ...account.likedSongFileIds };
    delete likedSongFileIds[songKey];
    useOnlineProviderAccountStore.getState().updateAccount(providerId, { likedSongFileIds });
};

let activeRequestGeneration = 0;

// Rejects late active-provider responses after an account switch transaction begins.
const withActiveProvider = async <T>(run: (provider: OnlineMusicProvider) => Promise<T>): Promise<T> => {
    const providerId = activeProviderId();
    const generation = activeRequestGeneration;
    const result = await run(requireOnlineMusicProvider(providerId));
    if (generation !== activeRequestGeneration || providerId !== activeProviderId()) {
        throw new DOMException('Active online provider changed', 'AbortError');
    }
    return result;
};

export const omni = {
    invalidateActiveRequests(): void {
        activeRequestGeneration += 1;
    },

    getActiveRequestGeneration(): number {
        return activeRequestGeneration;
    },

    // The provider list changes at runtime (Folium mods). A useSyncExternalStore pair for the UI.
    subscribeProviders(listener: () => void): () => void {
        return subscribeOnlineMusicProviderRegistry(listener);
    },

    getProviderRegistryVersion(): number {
        return getOnlineMusicProviderRegistryVersion();
    },

    getProviderSummaries(): OmniProviderSummary[] {
        const accounts = useOnlineProviderAccountStore.getState().accounts;
        return listOnlineMusicProviders().map(provider => {
            const account = accounts[provider.id];
            return {
                providerId: provider.id,
                displayName: provider.displayName,
                shortName: provider.shortName || provider.displayName,
                availability: provider.getAvailability?.() ?? { configured: true },
                requiresAccount: provider.capabilities.auth,
                status: account?.status || 'unknown',
                user: account?.user || null,
                collections: account?.collections || [],
                error: account?.error,
                hydration: account?.hydration || 'loading',
                freshness: account?.freshness || 'stale',
                lastUpdatedAt: account?.lastUpdatedAt,
            };
        });
    },

    getActiveProviderSummary(): OmniProviderSummary | undefined {
        const providerId = activeProviderId();
        return this.getProviderSummaries().find(provider => provider.providerId === providerId);
    },

    // Reads cached like state through Omni while preserving Netease's local state during account refreshes.
    isSongLiked(song: SongResult, fallbackLikedSongIds?: Iterable<MediaId>): boolean {
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') return false;

        const accountLikedSongIds = useOnlineProviderAccountStore.getState().accounts[source.providerId]?.likedSongIds;
        const likedSongIds = source.providerId === 'netease' && fallbackLikedSongIds
            ? fallbackLikedSongIds
            : accountLikedSongIds || [];
        const songKey = String(source.mediaId);
        for (const id of likedSongIds) {
            if (String(id) === songKey) return true;
        }
        return false;
    },

    // Toggles a song through its source provider. `likeSong` is what keeps the account cache in
    // sync, so every entry point - this one, the liked grid, a command - lands in the same state.
    async toggleSongLike(song: SongResult, fallbackLikedSongIds?: Iterable<MediaId>): Promise<boolean> {
        const nextLiked = !this.isSongLiked(song, fallbackLikedSongIds);
        await this.likeSong(song, nextLiked);
        return nextLiked;
    },

    getActiveCapabilities(): OmniProviderCapabilities {
        return activeProvider().capabilities;
    },

    getProviderCapabilities(providerId: OmniProviderId): OmniProviderCapabilities {
        return requireOnlineMusicProvider(providerId).capabilities;
    },

    supportsDailySongs(providerId: OmniProviderId): boolean {
        return typeof requireOnlineMusicProvider(providerId).recommendations?.getDailySongs === 'function';
    },

    getProviderAvailability(providerId: OmniProviderId) {
        return requireOnlineMusicProvider(providerId).getAvailability?.() ?? { configured: true };
    },

    getProviderLabel(providerId: OmniProviderId): string {
        const provider = getOnlineMusicProvider(providerId);
        return provider?.shortName || provider?.displayName || providerId;
    },

    async getSearchDiscovery(providerId: OmniProviderId) {
        return requireOnlineMusicProvider(providerId).search?.getDiscovery?.() ?? { suggestions: [], hot: [] };
    },

    async searchSongs(query: string, page: PageInput): Promise<OmniPage<UnifiedSong>> {
        return withActiveProvider(async provider => {
            if (!providerSupports(provider, 'search') || !provider.search) return emptyPage(page.offset);
            return provider.search.searchSongs(query, page.limit, page.offset);
        });
    },

    async searchProviderSongs(providerId: OmniProviderId, query: string, page: PageInput): Promise<OmniPage<UnifiedSong>> {
        const provider = requireOnlineMusicProvider(providerId);
        if (!providerSupports(provider, 'search') || !provider.search) return emptyPage(page.offset);
        return provider.search.searchSongs(query, page.limit, page.offset);
    },

    /** 搜索能力只看 provider 上真正实现的方法；界面据此隐藏未实现的分类。 */
    getSearchCapabilities(providerId: OmniProviderId): SearchCapabilities {
        const provider = getOnlineMusicProvider(providerId);
        if (!provider || !providerSupports(provider, 'search')) return emptySearchCapabilities;
        return resolveSearchCapabilities(provider.search);
    },

    async searchProviderArtists(providerId: OmniProviderId, query: string, page: PageInput, signal?: AbortSignal): Promise<SearchPage<SearchArtistHit>> {
        const search = getOnlineMusicProvider(providerId)?.search;
        if (!search?.searchArtists) return emptyTypedPage(page.offset);
        return search.searchArtists(query, page.limit, page.offset, signal);
    },

    async searchProviderAlbums(providerId: OmniProviderId, query: string, page: PageInput, signal?: AbortSignal): Promise<SearchPage<SearchAlbumHit>> {
        const search = getOnlineMusicProvider(providerId)?.search;
        if (!search?.searchAlbums) return emptyTypedPage(page.offset);
        return search.searchAlbums(query, page.limit, page.offset, signal);
    },

    async searchProviderPlaylists(providerId: OmniProviderId, query: string, page: PageInput, signal?: AbortSignal): Promise<SearchPage<SearchPlaylistHit>> {
        const search = getOnlineMusicProvider(providerId)?.search;
        if (!search?.searchPlaylists) return emptyTypedPage(page.offset);
        return search.searchPlaylists(query, page.limit, page.offset, signal);
    },

    /** 输入联想；音源没有实现时直接返回空，不发任何请求。 */
    async suggestProvider(providerId: OmniProviderId, query: string, signal?: AbortSignal): Promise<SearchSuggestions> {
        const search = getOnlineMusicProvider(providerId)?.search;
        if (!search?.suggestKeywords) return { items: [] };
        return search.suggestKeywords(query, signal);
    },

    async getLoginStatus(providerId: OmniProviderId): Promise<OmniUser | null> {
        const provider = requireOnlineMusicProvider(providerId);
        if (!provider.auth) return unsupported(providerId, 'auth');
        return provider.auth.getLoginStatus();
    },

    async logout(providerId: OmniProviderId): Promise<void> {
        const provider = requireOnlineMusicProvider(providerId);
        if (!provider.auth) return unsupported(providerId, 'auth');
        await provider.auth.logout();
    },

    // 没有这个能力就回空数组，UI 据此走单步流程；netease / kugou 完全不受影响。
    getQrLoginMethods(providerId: OmniProviderId): QrLoginMethod[] {
        return requireOnlineMusicProvider(providerId).auth?.getQrLoginMethods?.() ?? [];
    },

    async resolveQrLoginMethods(providerId: OmniProviderId): Promise<QrLoginMethod[]> {
        const auth = requireOnlineMusicProvider(providerId).auth;
        if (!auth) return [];
        return auth.resolveQrLoginMethods?.() ?? auth.getQrLoginMethods?.() ?? [];
    },

    async createQrLogin(providerId: OmniProviderId, methodId?: string): Promise<{ key: string; imageUrl: string }> {
        const provider = requireOnlineMusicProvider(providerId);
        const auth = provider.auth;
        if (!auth?.getQrKey || !auth.createQr) return unsupported(providerId, 'qr-login');
        const key = await auth.getQrKey(methodId);
        return { key, imageUrl: await auth.createQr(key) };
    },

    async checkQrLogin(providerId: OmniProviderId, key: string): Promise<QrLoginState> {
        const provider = requireOnlineMusicProvider(providerId);
        if (!provider.auth?.checkQr) return unsupported(providerId, 'qr-login');
        return provider.auth.checkQr(key);
    },

    // 没有这个能力就静默 no-op：netease / kugou 的扫码流程完全不受影响。
    async cancelQrLogin(providerId: OmniProviderId, key: string): Promise<void> {
        await requireOnlineMusicProvider(providerId).auth?.cancelQr?.(key);
    },

    // 诊断是失败之后的补救手段，自己不能再失败：provider 没实现就回空，抛错就把错误写进报告。
    async getQrLoginDiagnostics(providerId: OmniProviderId): Promise<string[]> {
        try {
            return await requireOnlineMusicProvider(providerId).auth?.getQrLoginDiagnostics?.() ?? [];
        } catch (error) {
            return [`provider diagnostics unavailable: ${error instanceof Error ? error.message : String(error)}`];
        }
    },

    // 扫码失败后的主动自检：没有这个能力的 provider（kugou、bodian、mod 源）回 false / null。
    // 自检本身出错时照常抛出，由登录会话记进时间线与报告。
    canRunQrLoginSelfCheck(providerId: OmniProviderId): boolean {
        return Boolean(requireOnlineMusicProvider(providerId).auth?.canRunQrLoginSelfCheck?.());
    },

    async runQrLoginSelfCheck(providerId: OmniProviderId): Promise<LoginSelfCheckResult | null> {
        return await requireOnlineMusicProvider(providerId).auth?.runQrLoginSelfCheck?.() ?? null;
    },

    // 只有明确声明了二维码寿命的 provider 才由前端计时；其余照旧只认后端报出的过期状态。
    getQrTtlMs(providerId: OmniProviderId): number | null {
        const ttlMs = requireOnlineMusicProvider(providerId).auth?.getQrTtlMs?.();
        return typeof ttlMs === 'number' && ttlMs > 0 ? ttlMs : null;
    },

    async getUserPlaylists(userId: MediaId, page: PageInput): Promise<OmniPage<OmniCollection>> {
        return withActiveProvider(async provider => provider.library?.getUserPlaylists?.(userId, page.limit, page.offset) ?? emptyPage(page.offset));
    },

    async getProviderUserPlaylists(providerId: OmniProviderId, userId: MediaId, page: PageInput): Promise<OmniPage<OmniCollection>> {
        const library = requireOnlineMusicProvider(providerId).library;
        if (!library?.getUserPlaylists) return emptyPage(page.offset);
        return library.getUserPlaylists(userId, page.limit, page.offset);
    },

    // Refreshes one provider's playlist catalog and keeps the Omni account cache current.
    async refreshProviderPlaylists(providerId: OmniProviderId): Promise<OmniCollection[]> {
        const account = useOnlineProviderAccountStore.getState().accounts[providerId];
        const userId = account?.user?.id;
        if (userId === undefined || userId === null) return [];
        useOnlineProviderAccountStore.getState().updateAccount(providerId, {
            freshness: 'refreshing',
            error: undefined,
        });

        try {
            const playlists: OmniCollection[] = [];
            // 分页是串行的：一页 50 条时，1000 条的上限要走 20 轮网络往返，歌单多的账号每次
            // 回到主页都要排队等完。拉到 500 只需要两轮。三家适配器各自兜底 —— 酷狗会把 limit
            // 夹到 KUGOU_MAX_PAGE_SIZE，QQ 是本地 slice，只有网易云原样透传（该接口上限 1000）。
            const limit = 500;
            let offset = 0;
            let hasMore = true;
            while (hasMore && offset < 1000) {
                const page = await this.getProviderUserPlaylists(providerId, userId, { limit, offset });
                playlists.push(...page.items.filter(collection => collection.type === 'playlist'));
                hasMore = page.hasMore && page.nextOffset > offset;
                offset = page.nextOffset;
            }

            const existingCollections = account.collections || [];
            const collections = [
                ...existingCollections.filter(collection => collection.type !== 'playlist'),
                ...playlists,
            ];
            const snapshot = await saveProviderAccountSnapshot(providerId, {
                user: account.user!,
                collections,
                likedSongIds: account.likedSongIds || [],
            });
            useOnlineProviderAccountStore.getState().updateAccount(providerId, {
                collections,
                freshness: 'fresh',
                lastUpdatedAt: snapshot.savedAt,
            });
            return playlists;
        } catch (error) {
            useOnlineProviderAccountStore.getState().updateAccount(providerId, {
                freshness: 'error',
                error: error instanceof Error ? error.message : 'provider_playlist_refresh_failed',
            });
            throw error;
        }
    },

    // Returns the cached playlists owned by the provider that owns the current song.
    getPlaylistsForSong(song: SongResult): OmniCollection[] {
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') return [];
        const provider = getOnlineMusicProvider(source.providerId);
        if (
            !providerSupports(provider, 'mutations')
            || !providerSupports(provider, 'playlistTrackMutations')
            || !provider?.mutations?.updatePlaylistTracks
        ) {
            return [];
        }
        const collections = useOnlineProviderAccountStore.getState().accounts[source.providerId]?.collections || [];
        return collections.filter(collection => (
            collection.type === 'playlist'
            && (provider.mutations?.canAddToPlaylist?.(collection) ?? true)
        ));
    },

    canAddSongToPlaylist(song: SongResult): boolean {
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') return false;
        const provider = getOnlineMusicProvider(source.providerId);
        return providerSupports(provider, 'mutations')
            && providerSupports(provider, 'playlistTrackMutations')
            && Boolean(provider?.mutations?.updatePlaylistTracks);
    },

    canLikeSong(song: SongResult): boolean {
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') return false;
        const provider = getOnlineMusicProvider(source.providerId);
        return providerSupports(provider, 'mutations')
            && providerSupports(provider, 'likes')
            && Boolean(provider?.mutations?.likeSong);
    },

    canEditCollectionTracks(collection: OmniCollection): boolean {
        const provider = getOnlineMusicProvider(collection.providerId);
        if (!providerSupports(provider, 'mutations')) return false;
        if (collection.isLiked === true) {
            return providerSupports(provider, 'likes') && Boolean(provider?.mutations?.likeSong);
        }
        return providerSupports(provider, 'playlistTrackMutations')
            && Boolean(provider?.mutations?.updatePlaylistTracks)
            && (provider?.mutations?.canEditPlaylistTracks?.(collection) ?? true);
    },

    canDislikeSong(song: SongResult): boolean {
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') return false;
        const provider = getOnlineMusicProvider(source.providerId);
        return providerSupports(provider, 'recommendations')
            && Boolean(provider?.recommendations?.dislikeSong);
    },

    /** 每日推荐里「不喜欢并换一首」：集合所属 provider 有 dislikeSong 才能管理推荐（QQ 有日推，没有不喜欢）。 */
    canDislikeCollectionSongs(collection: OmniCollection): boolean {
        const provider = getOnlineMusicProvider(collection.providerId);
        return providerSupports(provider, 'recommendations')
            && Boolean(provider?.recommendations?.dislikeSong);
    },

    canSubscribeCollection(collection: OmniCollection): boolean {
        const provider = getOnlineMusicProvider(collection.providerId);
        if (
            !providerSupports(provider, 'mutations')
            || !providerSupports(provider, 'playlistSubscription')
        ) {
            return false;
        }
        if (collection.type === 'album') return Boolean(provider?.mutations?.subscribeAlbum);
        // 自己的歌单（含「我喜欢」）谈不上收藏。以前靠「能编辑就不显示收藏」挡住，但 QQ 能收藏歌单却不能红心，
        // 「我喜欢」编辑不了，会落到收藏分支，一点就是去收藏自己的 201 目录。
        if (collection.isOwned === true || collection.isLiked === true) return false;
        return Boolean(provider?.mutations?.subscribePlaylist);
    },

    async getUserAlbums(userId: MediaId, page: PageInput): Promise<OmniPage<OmniCollection>> {
        return withActiveProvider(async provider => provider.library?.getUserAlbums?.(userId, page.limit, page.offset) ?? emptyPage(page.offset));
    },

    async getLikedSongIds(userId: MediaId): Promise<MediaId[]> {
        return withActiveProvider(async provider => provider.library?.getLikedSongIds?.(userId) ?? []);
    },

    async getProviderLikedSongIds(providerId: OmniProviderId, userId: MediaId): Promise<MediaId[]> {
        return requireOnlineMusicProvider(providerId).library?.getLikedSongIds?.(userId) ?? [];
    },

    async getProviderLikedSongs(providerId: OmniProviderId, userId: MediaId): Promise<UnifiedSong[]> {
        const library = requireOnlineMusicProvider(providerId).library;
        if (library?.getLikedSongs) return library.getLikedSongs(userId);
        return [];
    },

    async getCloudCollection(user?: OmniUser): Promise<OmniCollection | null> {
        return withActiveProvider(async provider => provider.library?.getCloudCollection?.(user) ?? null);
    },

    async getProviderCloudCollection(providerId: OmniProviderId, user?: OmniUser): Promise<OmniCollection | null> {
        return requireOnlineMusicProvider(providerId).library?.getCloudCollection?.(user) ?? null;
    },

    normalizeCachedUser(providerId: OmniProviderId, raw: unknown): OmniUser | null {
        return requireOnlineMusicProvider(providerId).normalizeUser?.(raw) ?? null;
    },

    normalizeCachedCollection(providerId: OmniProviderId, raw: unknown, type?: string): OmniCollection | null {
        return requireOnlineMusicProvider(providerId).normalizeCollection?.(raw, type) ?? null;
    },

    async getHomeFeed(limit = 35): Promise<{
        personalFm: UnifiedSong[];
        dailySongs: UnifiedSong[];
        recommendedCollections: OmniCollection[];
        /** 有一块失败、按空处理了：调用方可以照常显示，但下次应该再读一遍。 */
        partial?: true;
    }> {
        return withActiveProvider(async provider => {
            const recommendations = provider.recommendations;
            // 三块各自成败：一块失败（例如 QQ 日推被上游拒绝）只让那一块为空、结果标成 partial，不把 FM 与推荐歌单
            // 一起拖下去；三块都失败才算这次首页推荐失败。作废（AbortError）不算某一块的失败，整次照常作废。
            const [personalFm, dailySongs, recommendedCollections] = await Promise.allSettled([
                recommendations?.getPersonalFm?.() ?? [],
                recommendations?.getDailySongs?.() ?? [],
                recommendations?.getRecommendedCollections?.(limit) ?? [],
            ]);
            const settled = [personalFm, dailySongs, recommendedCollections];
            const failures = settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
            const aborted = failures.find(failure => (failure.reason as { name?: unknown } | null)?.name === 'AbortError');
            if (aborted) throw aborted.reason;
            if (failures.length === settled.length) throw failures[0].reason;
            failures.forEach(failure => console.warn('[Omni] Home feed section failed', {
                providerId: provider.id,
                name: failure.reason instanceof Error ? failure.reason.name : 'Error',
                message: failure.reason instanceof Error ? failure.reason.message : String(failure.reason),
            }));
            const valueOf = <T>(result: PromiseSettledResult<T[]>): T[] => (result.status === 'fulfilled' ? result.value : []);
            return {
                personalFm: valueOf(personalFm),
                dailySongs: valueOf(dailySongs),
                recommendedCollections: valueOf(recommendedCollections),
                ...(failures.length > 0 ? { partial: true as const } : {}),
            };
        });
    },

    async getPersonalFm(options?: PersonalFmRequestOptions): Promise<UnifiedSong[]> {
        return withActiveProvider(async provider => provider.recommendations?.getPersonalFm?.(options) ?? []);
    },

    async getDailySongs(refresh?: boolean): Promise<UnifiedSong[]> {
        return withActiveProvider(async provider => provider.recommendations?.getDailySongs?.(refresh) ?? []);
    },

    async getRecommendationHistory(): Promise<OmniHistoryEntry[]> {
        return withActiveProvider(async provider => provider.recommendations?.getHistoryEntries?.() ?? []);
    },

    async getRecommendationHistoryDates(): Promise<string[]> {
        return withActiveProvider(async provider => provider.recommendations?.getHistoryDates?.() ?? []);
    },

    async getRecommendationHistorySongs(entry: OmniHistoryEntry | string): Promise<UnifiedSong[]> {
        return withActiveProvider(async provider => provider.recommendations?.getHistorySongs?.(entry) ?? []);
    },

    async getSongDetail(providerId: OmniProviderId, id: MediaId): Promise<UnifiedSong | null> {
        return requireOnlineMusicProvider(providerId).playback?.getSongDetail(id) ?? null;
    },

    canPlaySong(song: SongResult): boolean {
        return Boolean(getOnlineMusicProviderForSong(song)?.playback);
    },

    async getAudioSource(song: SongResult, quality: AudioQualityPreference): Promise<OmniAudioSource | null> {
        const provider = providerForSong(song);
        // 取流是「暂时无法播放这首歌」所有来源里唯一必经的入口：三档结果都留痕，报告才分得清
        // 是「provider 没给地址」还是「provider 抛错（权限/地区/会员/网络）」。
        const startedAt = Date.now();
        const mediaId = getPlaybackSourceRef(song)?.kind === 'online' ? getPlaybackSourceRef(song)?.mediaId : undefined;
        let source: OmniAudioSource | null;
        try {
            source = await (provider.playback?.getAudioSource(song, quality) ?? null);
        } catch (error) {
            // The provider refused (network, auth, entitlement...). An installed audio hook may still
            // supply a URL; without one, or when it has none, rethrow the very same error instance so
            // the caller classifies the provider's evidence. Nothing is saved on this path.
            const rescued = await applyOmniAudioHook(song, null);
            if (rescued?.url) {
                noteOnlinePlaybackOutcome({
                    stage: 'resolve', outcome: 'ok', providerId: provider.id, mediaId, quality,
                    kind: 'hook-rescued', elapsedMs: Date.now() - startedAt,
                });
                return rescued;
            }
            noteOnlinePlaybackError({
                stage: 'resolve', providerId: provider.id, mediaId, quality,
                elapsedMs: Date.now() - startedAt, error,
            });
            throw error;
        }
        // Written here rather than at either caller because this is the only moment a provider ever
        // states a track's ReplayGain, and both callers - the prefetch pass and playback itself -
        // may be the one that happens to see it. See getCachedSongReplayGain for what is lost
        // otherwise: the URL is never fetched again once the bytes are cached.
        if (source?.replayGain) void saveSongReplayGain(song, source.replayGain);
        // Extension layers (Folium omni hooks) may swap the URL; the ReplayGain above stays the provider's.
        const resolved = await applyOmniAudioHook(song, source);
        noteOnlinePlaybackOutcome({
            stage: 'resolve',
            outcome: resolved?.url ? 'ok' : 'no-source',
            providerId: provider.id,
            mediaId,
            quality,
            kind: resolved?.url ? '' : 'empty-url',
            detail: resolved?.url ? '' : 'provider returned no playable url',
            elapsedMs: Date.now() - startedAt,
        });
        return resolved;
    },

    // Asked once per track, including for local and Navidrome songs, so an unsupported source is a
    // plain `false` rather than the throw `providerForSong` would raise.
    canReportPlayback(song: SongResult): boolean {
        const provider = getOnlineMusicProviderForSong(song);
        return providerSupports(provider, 'playbackReports') && Boolean(provider?.playbackReports);
    },

    async reportPlayback(song: SongResult, report: OmniPlaybackReport): Promise<void> {
        const provider = providerForSong(song);
        if (!provider.playbackReports) return unsupported(provider.id, 'playbackReports');
        await provider.playbackReports.reportPlayback(song, report);
    },

    async getLyrics(song: SongResult, context?: { userId?: MediaId | null }): Promise<OmniLyricsResult> {
        const provider = providerForSong(song);
        if (!provider.lyrics) return unsupported(provider.id, 'lyrics');
        const providerUserId = useOnlineProviderAccountStore.getState().accounts[provider.id]?.user?.id ?? context?.userId;
        const providerResult = await provider.lyrics.getLyrics(song, { ...context, userId: providerUserId });
        const resolved = (await resolveProviderLyricsChorus(providerResult, {
            providerId: provider.id,
            songId: song.id,
        })).result;
        // Extension layers (Folium omni hooks) may rewrite the lyrics after the provider answered.
        return applyOmniLyricsHook(song, resolved);
    },

    async getChorusRanges(song: SongResult): Promise<OmniChorusRange[]> {
        const provider = providerForSong(song);
        return provider.lyrics?.getChorusRanges?.(song.id) ?? [];
    },

    getSongAvailability(song: SongResult): OmniSongAvailability {
        return providerForSong(song).playback?.getAvailability?.(song) ?? { state: 'unknown' };
    },

    async getSongReplacement(song: SongResult): Promise<OmniSongReplacement | null> {
        return providerForSong(song).playback?.getReplacement?.(song) ?? null;
    },

    async getProviderNewReleaseCollection(providerId: OmniProviderId): Promise<OmniCollection> {
        const provider = requireOnlineMusicProvider(providerId);
        if (!provider.catalog?.getNewReleaseCollection) return unsupported(providerId, 'new-release-chart');
        return provider.catalog.getNewReleaseCollection();
    },

    async getCollectionTracks(collection: OmniCollection, page: PageInput): Promise<OmniPage<UnifiedSong>> {
        const provider = providerForCollection(collection);
        let result: OmniPage<UnifiedSong>;
        if (collection.type === 'album') {
            result = await provider.catalog?.getAlbumTracks?.(collection.id, page.limit, page.offset, collection) ?? emptyPage(page.offset);
        } else if (collection.type === 'cloud') {
            result = await provider.catalog?.getCloudTracks?.(page.limit, page.offset, collection) ?? emptyPage(page.offset);
        } else {
            result = await provider.catalog?.getPlaylistTracks?.(collection.id, page.limit, page.offset, collection) ?? emptyPage(page.offset);
        }
        recordCollectionOrderPage({
            phase: 'page',
            source: 'provider-page',
            providerId: provider.id,
            collectionId: String(collection.id),
            collectionType: collection.type,
            offset: page.offset,
            requestedLimit: page.limit,
            itemCount: result.items.length,
            hasMore: result.hasMore,
            nextOffset: result.nextOffset,
            tracks: result.items,
        });
        return result;
    },

    async getAlbumDetail(collection: OmniCollection): Promise<OmniCollection | null> {
        return providerForCollection(collection).catalog?.getAlbumDetail?.(collection.id, collection) ?? null;
    },

    async getCollectionDetail(collection: OmniCollection): Promise<OmniCollection | null> {
        const catalog = providerForCollection(collection).catalog;
        if (collection.type === 'album') return catalog?.getAlbumDetail?.(collection.id, collection) ?? collection;
        if (collection.type === 'playlist') return catalog?.getPlaylistDetail?.(collection.id, collection) ?? collection;
        return collection;
    },

    async getArtistDetail(collection: OmniCollection): Promise<OmniCollection | null> {
        return providerForCollection(collection).catalog?.getArtistDetail?.(collection.id) ?? null;
    },

    async getArtistSongs(collection: OmniCollection, page: PageInput): Promise<OmniPage<UnifiedSong>> {
        return providerForCollection(collection).catalog?.getArtistSongs?.(collection.id, page.limit, page.offset) ?? emptyPage(page.offset);
    },

    async getArtistAlbums(collection: OmniCollection, page: PageInput): Promise<OmniPage<OmniCollection>> {
        return providerForCollection(collection).catalog?.getArtistAlbums?.(collection.id, page.limit, page.offset) ?? emptyPage(page.offset);
    },

    async getSubscriptionStatus(collection: OmniCollection): Promise<boolean> {
        const type = collection.type === 'album' ? 'album' : 'playlist';
        return providerForCollection(collection).catalog?.getSubscriptionStatus?.(type, collection.id, collection) ?? false;
    },

    async subscribe(collection: OmniCollection, subscribed: boolean): Promise<void> {
        const mutations = providerForCollection(collection).mutations;
        if (!this.canSubscribeCollection(collection)) {
            return unsupported(collection.providerId, 'collection-subscription');
        }
        if (collection.type === 'album') {
            if (!mutations?.subscribeAlbum) return unsupported(collection.providerId, 'album-subscription');
            return runOnlineMutation(collection.providerId, subscribed ? 'album-subscribe' : 'album-unsubscribe', collection.id, () => mutations.subscribeAlbum!(collection.id, subscribed));
        }
        if (!mutations?.subscribePlaylist) return unsupported(collection.providerId, 'playlist-subscription');
        return runOnlineMutation(collection.providerId, subscribed ? 'playlist-subscribe' : 'playlist-unsubscribe', collection.id, () => mutations.subscribePlaylist!(collection, subscribed));
    },

    async updateCollectionTracks(collection: OmniCollection, operation: 'add' | 'del', tracks: SongResult[]): Promise<void> {
        const provider = providerForCollection(collection);
        const mutations = provider.mutations;
        if (
            !providerSupports(provider, 'mutations')
            || !providerSupports(provider, 'playlistTrackMutations')
            || !mutations?.updatePlaylistTracks
        ) {
            return unsupported(collection.providerId, 'playlist-track-mutations');
        }
        return runOnlineMutation(
            collection.providerId,
            operation === 'add' ? 'playlist-tracks-add' : 'playlist-tracks-del',
            collection.id,
            () => mutations.updatePlaylistTracks!(operation, collection, tracks),
        );
    },

    async addSongToPlaylist(song: SongResult, playlist: OmniCollection): Promise<void> {
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') {
            throw new OnlineProviderError('unsupported', 'Only online songs can be added to online playlists');
        }
        if (playlist.providerId !== source.providerId || playlist.type !== 'playlist') {
            throw new OnlineProviderError('unsupported', 'Playlist does not belong to the song provider', source.providerId);
        }
        if (!this.canAddSongToPlaylist(song)) {
            throw new OnlineProviderError('unsupported', 'Song provider does not support playlist track mutations', source.providerId);
        }
        const provider = providerForCollection(playlist);
        if (provider.mutations?.canAddToPlaylist && !provider.mutations.canAddToPlaylist(playlist)) {
            throw new OnlineProviderError('unsupported', 'Playlist does not accept track mutations', source.providerId);
        }
        await this.updateCollectionTracks(playlist, 'add', [song]);
        try {
            await this.refreshProviderPlaylists(playlist.providerId);
            // Netease owns its liked state in useNeteaseLibrary; avoid its cached /likelist here.
            if (playlist.isLiked === true && playlist.providerId !== 'netease' && providerSupports(provider, 'likes')) {
                const account = useOnlineProviderAccountStore.getState().accounts[playlist.providerId];
                if (account?.user?.id !== undefined && account?.user?.id !== null) {
                    const userId = account.user.id;
                    // A full liked list may be large. Do not delay success or overwrite a newer account/mutation.
                    void this.getProviderLikedSongIds(playlist.providerId, userId).then(async likedSongIds => {
                        const latest = useOnlineProviderAccountStore.getState().accounts[playlist.providerId];
                        if (latest?.user?.id !== userId || latest.likedSongIds !== account.likedSongIds) return;
                        useOnlineProviderAccountStore.getState().updateAccount(playlist.providerId, { likedSongIds });
                        await persistProviderLikedSongIds(playlist.providerId);
                    }).catch(error => {
                        console.warn('[Omni] Failed to refresh liked songs after playlist mutation', {
                            providerId: playlist.providerId,
                            name: error instanceof Error ? error.name : 'Error',
                        });
                    });
                }
            }
        } catch (error) {
            console.warn('[Omni] Failed to refresh provider playlists after mutation', {
                providerId: playlist.providerId,
                name: error instanceof Error ? error.name : 'Error',
            });
        }
    },

    async likeSong(song: SongResult, liked: boolean): Promise<void> {
        const provider = providerForSong(song);
        if (!this.canLikeSong(song) || !provider.mutations?.likeSong) return unsupported(provider.id, 'likes');

        // canLikeSong 已经保证了这一点，这里只是把类型收窄；真走到就说明上面的判断被绕过了。
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') return unsupported(provider.id, 'likes');

        const songKey = String(source.mediaId);
        const account = useOnlineProviderAccountStore.getState().accounts[source.providerId];
        const cachedFileId = account?.likedSongFileIds?.[songKey];

        try {
            if (cachedFileId === undefined) {
                await provider.mutations.likeSong(song, liked);
            } else {
                await provider.mutations.likeSong(song, liked, { likedFileId: cachedFileId });
            }
        } catch (error) {
            // 失败时只丢掉可能已经失效的 fileId，点赞状态保持原样——调用方会把错误往上抛。
            dropProviderLikedFileId(source.providerId, songKey);
            noteOnlineMutationFailure({
                providerId: source.providerId,
                operation: liked ? 'song-like' : 'song-unlike',
                mediaId: songKey,
                error,
            });
            throw error;
        }

        // 成功之后 likedSongIds 和 likedSongFileIds 一次提交：直接调 likeSong 的入口（例如"我喜欢"
        // 网格里删歌）也必须让账号缓存跟着走，否则和 toggleSongLike 两个入口语义不同。
        // 加收藏拿不到新的 fileId，取消收藏让旧的失效，两种情况都得把这一行删掉，下次取消时重新解析。
        //
        // @note 网易云是例外：它的点赞集合由 useNeteaseLibrary 的本地 state 当家，再单向镜像到这个
        // store（见 useNeteaseLibrary 里的 updateProviderAccount effect），而 isSongLiked 对网易云
        // 优先读调用方传进来的那一份。所以从 GridView 直接调用这里，网易云的播放器心形不会跟着变，
        // 要等下一次账号刷新。真要统一得把那份 state 挪进 store，不在这次改动范围内。
        const latest = useOnlineProviderAccountStore.getState().accounts[source.providerId];
        const likedSongIds = (latest?.likedSongIds || []).filter(id => String(id) !== songKey);
        const likedSongFileIds = { ...(latest?.likedSongFileIds || {}) };
        delete likedSongFileIds[songKey];
        useOnlineProviderAccountStore.getState().updateAccount(source.providerId, {
            likedSongIds: liked ? [...likedSongIds, source.mediaId] : likedSongIds,
            likedSongFileIds,
        });
        await persistProviderLikedSongIds(source.providerId);
    },

    async dislikeSong(song: SongResult): Promise<{ replacement?: UnifiedSong; limitReached?: boolean }> {
        const provider = providerForSong(song);
        if (!this.canDislikeSong(song) || !provider.recommendations?.dislikeSong) {
            return unsupported(provider.id, 'recommendation-dislike');
        }
        return provider.recommendations.dislikeSong(song.id);
    },

    canResolveCatalogRef(song: UnifiedSong, _kind: ProviderCatalogEntityKind): boolean {
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') return false;
        const catalog = getOnlineMusicProvider(source.providerId)?.catalog;
        return Boolean(catalog?.resolveSongCatalogRefs || catalog?.canResolveSongCatalogRefs?.(song));
    },

    async resolveCatalogRefs(song: UnifiedSong): Promise<UnifiedSong> {
        const source = getPlaybackSourceRef(song);
        if (source.kind !== 'online') return song;
        return getOnlineMusicProvider(source.providerId)?.catalog?.resolveSongCatalogRefs?.(song) ?? song;
    },

    getSongPageUrl(song: SongResult): string | null {
        return providerForSong(song).getSongPageUrl?.(song) ?? null;
    },
};

export type OmniService = typeof omni;
