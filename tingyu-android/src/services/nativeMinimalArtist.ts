import type { GridViewCollectionDescriptor } from '../library/core/contracts/collection';
import type { UnifiedSong } from '../types';
import { createSearchArtistCollection } from '../components/app/search/searchCollectionAdapters';
import { canResolveSongCatalogRef } from './onlineMusic/catalogRefs';
import { resolveTrackArtistLinks } from '../library/core/model/trackLinks';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { chromeNative } from './nativeChrome';
import i18n from '../i18n/config';

// src/services/nativeMinimalArtist.ts
//
// 封面页歌手名点击（native → JS，第 19 轮）。Compose 封面页的歌手名可点，
// 走 `minimal` 动作总线发 `artistOpen`，value 是歌手串里的序号（-1 = 第一个）。
//
// 为什么 JS 侧拿序号而不是名字：动作总线的 value 只有一个 double；而当前歌的
// 歌手串 JS 本来就有（帧里推过、store 里也有），按同样的分隔序号映射即可。
// 目录身份优先（resolveTrackArtistLinks 的同名序号），取不到再按名字建集合 ——
// 与 usePlayerArtistNavigation 同一条链路，只是**没有** view==='player' 守卫：
// Compose 接管播放页时 JS 视图是 home，那个守卫会永远失败。

type ArtistOpener = (collection: GridViewCollectionDescriptor) => void;

let opener: ArtistOpener | null = null;
let actionListener: { remove: () => Promise<void> } | null = null;

/** App 启动时把集合导航注册进来；传 null 拆除监听。 */
export function registerNativeArtistOpener(next: ArtistOpener | null): void {
    opener = next;
    if (!next) {
        const listener = actionListener;
        actionListener = null;
        void listener?.remove().catch(() => { /* 桥已不在 */ });
        return;
    }
    void attachArtistActionListener();
}

async function attachArtistActionListener(): Promise<void> {
    if (actionListener) return;
    try {
        actionListener = await chromeNative.addListener('action', event => {
            if (event.id !== 'minimal' || event.action !== 'artistOpen') return;
            const index = typeof event.value === 'number' ? Math.trunc(event.value) : -1;
            void openArtistByIndex(Number.isFinite(index) ? index : -1);
        });
    } catch {
        // 非 Android 环境没有动作可接。
    }
}

async function openArtistByIndex(index: number): Promise<void> {
    const navigate = opener;
    const song = usePlaybackStore.getState().currentSong;
    if (!navigate || !song) return;
    const links = resolveTrackArtistLinks(song, canResolveSongCatalogRef);
    const link = index >= 0 ? links[index] : links[0];
    const artist = link?.artist;
    const name = artist?.name || '';
    if (!name && !artist?.id) return;
    try {
        const collection = await createSearchArtistCollection(
            song as UnifiedSong,
            name,
            artist?.id,
            artist?.entityId,
        );
        if (collection) {
            navigate(collection);
            return;
        }
    } catch (error) {
        console.warn('[CatalogNavigation] Player artist lookup failed', error, getPlaybackSongKey(song));
    }
    setStatusMessage({ type: 'error', text: i18n.t('search.catalogUnavailable') });
}
