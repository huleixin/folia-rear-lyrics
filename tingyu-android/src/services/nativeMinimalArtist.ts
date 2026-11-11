import type { GridViewCollectionDescriptor } from '../library/core/contracts/collection';
import type { UnifiedSong } from '../types';
import { createSearchArtistCollection } from '../components/app/search/searchCollectionAdapters';
import { canResolveSongCatalogRef } from './onlineMusic/catalogRefs';
import { resolveTrackArtistLinks } from '../library/core/model/trackLinks';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
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
let request = 0;
let pending = '';

/** The already session-checked minimal action subscription owns artist clicks too. */
export function registerNativeArtistOpener(next: ArtistOpener | null): void {
    opener = next;
    request += 1;
    pending = '';
}

/** Match the displayed segments before using IDs; cached songs can have only a display string. */
export async function openNativeMinimalArtist(index: number, displayArtist?: string): Promise<void> {
    const navigate = opener;
    const song = usePlaybackStore.getState().currentSong;
    if (!navigate || !song) return;
    const links = resolveTrackArtistLinks(song, canResolveSongCatalogRef);
    const names = (displayArtist ?? song.artists?.map(artist => artist.name).join(' / ') ?? '').split(/\s*[/、，,;；&]\s*/u).map(name => name.trim()).filter(Boolean);
    const selected = Number.isFinite(index) && index >= 0 ? Math.trunc(index) : 0;
    const shownName = names[selected];
    const artist = links.find(link => shownName && link.artist.name.trim() === shownName)?.artist
        ?? (names.length === links.length || !shownName ? links[selected]?.artist : undefined);
    const name = shownName || artist?.name || '';
    if (!name && !artist?.id) {
        setStatusMessage({ type: 'error', text: i18n.t('search.catalogUnavailable') });
        return;
    }
    const songKey = getPlaybackSongKey(song);
    const key = `${songKey}:${selected}:${name}`;
    if (pending === key) return;
    pending = key;
    const generation = ++request;
    try {
        const collection = await createSearchArtistCollection(
            song as UnifiedSong,
            name,
            artist?.id,
            artist?.entityId,
        );
        const currentSong = usePlaybackStore.getState().currentSong;
        if (generation !== request || opener !== navigate || !currentSong || getPlaybackSongKey(currentSong) !== songKey) return;
        if (collection) {
            navigate(collection);
            return;
        }
    } catch (error) {
        if (generation !== request) return;
        console.warn('[CatalogNavigation] Player artist lookup failed', error, getPlaybackSongKey(song));
    } finally {
        if (generation === request) pending = '';
    }
    if (generation === request) setStatusMessage({ type: 'error', text: i18n.t('search.catalogUnavailable') });
}
