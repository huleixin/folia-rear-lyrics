import { useRef, useState } from 'react';
import type { SongResult } from '../../../../../types';
import type { ProviderCollection } from '../../../../../types/onlineMusic';
import type { NativeHomeProps } from '../NativeHomeOverview';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../../../../utils/appPlaybackGuards';
import { getSongCoverUrl } from '../../../../../services/onlineMusic/songMetadata';
import { omni } from '../../../../../services/onlineMusic/omni';
import { readDiscovery, discoveryOwner } from '../../../../../services/discovery/service';
import { useDiscoverySettingsStore } from '../../../../../stores/useDiscoverySettingsStore';
import { recordDiscoveryFeedback } from '../../../../../services/discovery/preferences';
import { startDiscoveryRoaming, endDiscoveryRoaming } from '../../../../../services/discovery/roaming';
import { setStatusMessage } from '../../../../../stores/useStatusMessageStore';
import { usePlaybackStore } from '../../../../../stores/usePlaybackStore';
import { excludeSongs, mixRoaming } from '../../../../../services/discovery/ranking';
import { useDiscoveryPreferences } from '../../../../../services/discovery/preferences';

export function useDiscoveryActions(props: NativeHomeProps['props']) {
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const pending = useRef(false);
    const [menu, setMenu] = useState<{ song: SongResult; queue: SongResult[]; reason?: string } | null>(null);
    const [hidden, setHidden] = useState<Set<string>>(() => new Set());
    const openSongs = (title: string, songs: SongResult[], description = '') => {
        if (!songs.length) { setNotice('候选数据不足，请先播放或收藏一些歌曲，或启用其他推荐来源。'); return false; }
        props.onOpenGridView({ source: 'online', providerId: 'discovery', type: 'discovery',
            id: title + ':' + Date.now(), name: title, description, trackCount: songs.length,
            coverUrl: getSongCoverUrl(songs[0]), discoveryTracks: songs });
        return true;
    };
    const openCollection = (collection: ProviderCollection) => props.onOpenGridView({ ...collection, source: 'online', raw: collection });
    const load = async (providerId: string, kind: 'daily' | 'fm') => {
        if (pending.current) return;
        pending.current = true; setBusy(true); setNotice('');
        const owner = discoveryOwner(providerId), selection = useDiscoverySettingsStore.getState().source;
        try {
            const result = await readDiscovery(providerId, kind);
            if (owner !== discoveryOwner(providerId) || selection !== useDiscoverySettingsStore.getState().source) return;
            if (result.status === 'login') { void props.account.startLogin(providerId); return; }
            if (result.status === 'error') { setNotice('推荐暂时无法加载，请稍后重试。'); return; }
            openSongs(omni.getProviderLabel(providerId) + (kind === 'daily' ? ' · 每日推荐' : ' · 私人 FM'), result.songs);
        } catch { setNotice('推荐来源已变化，请重新打开。'); }
        finally { pending.current = false; setBusy(false); }
    };
    const roam = (songs: SongResult[], mode: 'balanced' | 'familiar' | 'explore' = 'balanced') => {
        if (!songs.length) { setNotice('暂时没有可漫游的歌曲。'); return; }
        const mixed = mixRoaming(songs, useDiscoveryPreferences.getState().values, mode, new Date().toLocaleDateString('sv-SE'));
        const before = usePlaybackStore.getState().playQueue;
        startDiscoveryRoaming(mixed, (song, queue) => props.onPlaySong(song, queue, false), songs => { props.onAddAllToQueue?.(songs, { suppressToast: true }); });
        if (usePlaybackStore.getState().playQueue === before) endDiscoveryRoaming(false);
    };
    const menuAction = async (id: string) => {
        if (!menu) return;
        const { song, queue } = menu;
        try {
            if (id === 'play') { endDiscoveryRoaming(false); props.onPlaySong(song, queue); }
            else if (id === 'enqueue') props.onAddSongToQueue?.(song);
            else if (id === 'dislike') {
                const source = getPlaybackSourceRef(song);
                // A provider's own dislike changes its daily list; a local-only preference must not
                // claim that remote action happened.
                if (source.kind === 'online' && omni.canDislikeSong(song)) await omni.dislikeSong(song);
                recordDiscoveryFeedback(song, 'dislike'); setHidden(previous => new Set(previous).add(getPlaybackSongKey(song)));
                setStatusMessage({ type: 'success', text: '已减少这类推荐' });
            }
            else if (id === 'like') { const liked = await omni.toggleSongLike(song); recordDiscoveryFeedback(song, liked ? 'like' : 'unlike'); setStatusMessage({ type: 'success', text: liked ? '已收藏' : '已取消收藏' }); }
        } catch { setNotice('操作未完成，请检查账号和网络后重试。'); }
        finally { setMenu(null); }
    };
    return { notice, setNotice, busy, menu, setMenu, openSongs, openCollection, load, roam, menuAction,
        withoutHidden: (songs: SongResult[]) => excludeSongs(songs, hidden) };
}
