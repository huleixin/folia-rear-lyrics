import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeHomeProps } from '../NativeHomeOverview';
import { useNativePage } from '../../../../../hooks/useNativePage';
import { useDiscoveryFeed } from '../../../../../hooks/useDiscoveryFeed';
import { useDiscoverySettingsStore } from '../../../../../stores/useDiscoverySettingsStore';
import { useDiscoveryPreferences } from '../../../../../services/discovery/preferences';
import { rankDiscovery, type RadarKind } from '../../../../../services/discovery/ranking';
import { discoveryDay } from '../../../../../services/discovery/service';
import { useDiscoveryRoaming, endDiscoveryRoaming } from '../../../../../services/discovery/roaming';
import { useMobileLibraryStore } from '../../../../../stores/useMobileLibraryStore';
import { buildLocalQueue, LIST_ROW_COVER_SIZE } from '../../../../../services/playbackAdapters';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../../../../utils/appPlaybackGuards';
import { getSongArtistLabel, getSongCoverUrl } from '../../../../../services/onlineMusic/songMetadata';
import { absolutePageImage } from '../../../../../services/nativePages';
import { omni } from '../../../../../services/onlineMusic/omni';
import { catalogBadgePageFields } from '../../../../../utils/catalogAudioLabels';
import type { NativePageModel, PageActions, PageSection } from '../../../../../types/nativePages';
import type { SongResult } from '../../../../../types';
import OperationPanel from '../OperationPanel';
import DiscoverySettingsPanel from './DiscoverySettingsPanel';
import { useDiscoveryActions } from './useDiscoveryActions';
import { bindDiscoverySettingsPanel } from '../../../../../services/discovery/settingsPanel';

const radarNames: Record<RadarKind, string> = { heart: '心动雷达', style: '风格雷达', time: '时光雷达', explore: '探索雷达', local: '本地雷达' };
export default function NativeDiscoveryHome({ root, props, sources, onReady, onSources }: NativeHomeProps) {
    const { t } = useTranslation();
    const settings = useDiscoverySettingsStore(), preferences = useDiscoveryPreferences();
    const feed = useDiscoveryFeed(props.isInteractive), controls = useDiscoveryActions(props);
    const recent = useMobileLibraryStore(state => state.recentTracks);
    const roaming = useDiscoveryRoaming();
    const [settingsOpen, setSettingsOpen] = useState(false), [batch, setBatch] = useState(0);
    useEffect(() => bindDiscoverySettingsPanel(() => setSettingsOpen(true)), []);
    useEffect(() => {
        if (!props.isInteractive) return;
        const open = () => setSettingsOpen(true); document.addEventListener('tingyu-discovery-settings', open);
        return () => document.removeEventListener('tingyu-discovery-settings', open);
    }, [props.isInteractive]);
    const local = useMemo(() => settings.includeLocal ? buildLocalQueue(props.localSongs.slice(0, 600), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE) : [], [props.localSongs, props.localLibraryCatalog, settings.includeLocal]);
    const candidates = useMemo(() => [...feed.results.flatMap(result => result.songs), ...recent.filter(song => {
        const source = getPlaybackSourceRef(song); return source.kind === 'online' && (settings.source === 'all' ? settings.enabled[source.providerId] !== false : source.providerId === settings.source);
    }), ...(settings.source === 'all' ? local : [])], [feed.results, recent, local, settings.source, settings.enabled]);
    const seed = discoveryDay() + ':' + preferences.revision + ':' + batch;
    const ranked = useMemo(() => rankDiscovery(candidates, preferences.values, settings, 'heart', seed, Date.now(), 100), [candidates, preferences.values, settings, seed]);
    const songs = controls.withoutHidden(ranked.map(item => item.song));
    const radar = (kind: RadarKind) => rankDiscovery(candidates, preferences.values, settings, kind, seed).map(item => item.song);
    const openRadar = (kind: RadarKind) => controls.openSongs(radarNames[kind], radar(kind), kind === 'style' ? '依据真实歌手关联；未推测音乐流派。' : '根据本机偏好及已启用的真实推荐来源生成。');
    const actions: PageActions = { settings: () => setSettingsOpen(true), sources: onSources, refresh: feed.retry,
        next: () => setBatch(value => value + 1), roam: () => roaming.active ? endDiscoveryRoaming() : controls.roam(songs),
        allSongs: () => controls.openSongs('猜你想听', songs), allRadar: () => setRadarOpen(true),
        recentAll: () => controls.openSongs('最近播放', recent), library: () => useMobileLibraryStore.getState().setPage('library') };
    const [radarOpen, setRadarOpen] = useState(false);
    const sourceItems = [{ providerId: 'all', displayName: '综合推荐' }, ...feed.sources].map(source => {
        const action = 'source:' + source.providerId; actions[action] = () => settings.patch({ source: source.providerId });
        return { id: action, title: source.displayName, selected: settings.source === source.providerId, action };
    });
    const rows = (list: SongResult[], prefix: string) => list.map(song => {
        const key = prefix + getPlaybackSongKey(song), source = getPlaybackSourceRef(song);
        const reason = ranked.find(item => getPlaybackSongKey(item.song) === getPlaybackSongKey(song))?.reason;
        actions[key] = () => props.onPlaySong(song, list); actions[key + ':menu'] = () => controls.setMenu({ song, queue: list, reason });
        return { id: key, title: song.name, subtitle: getSongArtistLabel(song) + ' · ' + (source.kind === 'online' ? omni.getProviderLabel(source.providerId) : '本地'),
            image: absolutePageImage(getSongCoverUrl(song)), action: key, secondary: key + ':menu', secondaryLabel: '⋮', ...catalogBadgePageFields(song, t) };
    });
    const shortcuts = feed.sources.filter(source => settings.source === 'all' ? settings.enabled[source.providerId] !== false : source.providerId === settings.source).flatMap(source => {
        const capabilities = (() => { try { return omni.getRecommendationCapabilities(source.providerId); } catch { return { daily: false, fm: false }; } })();
        return (['daily','fm'] as const).filter(kind => capabilities[kind]).map(kind => {
            const action = kind + ':' + source.providerId; actions[action] = () => { void controls.load(source.providerId, kind); };
            return { id: action, title: kind === 'daily' ? '每日推荐' : '私人 FM', subtitle: source.shortName, action, image: kind === 'daily' ? 'calendar' : 'radio', disabled: controls.busy };
        });
    }).slice(0, 4);
    const sections: Record<string, PageSection> = {
        roam: { id: 'discovery-brand', layout: 'discoverCards', items: [{ id: 'roam', title: '听屿漫游', subtitle: roaming.active ? (roaming.exhausted ? '本批已全部加入 · 点击退出' : '漫游中 · 点击退出并恢复队列') : '让熟悉与未知，在下一首相遇', action: 'roam' }] },
        shortcuts: { id: 'shortcuts', layout: 'quickLinks', items: shortcuts },
        radars: { id: 'discovery-radars', title: '你的专属雷达', layout: 'discoverCards', more: 'allRadar', moreLabel: '全部', items: (['style','time','explore'] as RadarKind[]).map(kind => { const action = 'radar:' + kind; actions[action] = () => openRadar(kind); return { id: kind, title: radarNames[kind], subtitle: kind === 'style' ? '歌手与音乐的关联' : kind === 'time' ? '重逢旧日旋律' : '发现未听过的音乐', action }; }) },
        songs: { id: 'discovery-songs', title: '猜你想听', layout: 'rows', more: 'next', moreLabel: '换一批', items: rows(songs.slice(0, 6), 'song:') },
        collections: { id: 'discovery-collections', title: '为你精选歌单', layout: 'cards', items: feed.results.flatMap(result => result.collections).slice(0, 24).map(collection => {
            const action = 'collection:' + collection.providerId + ':' + collection.id; actions[action] = () => controls.openCollection(collection);
            return { id: action, title: collection.name, subtitle: omni.getProviderLabel(collection.providerId) + (collection.trackCount != null ? ' · ' + collection.trackCount + '首' : ''), image: absolutePageImage(collection.coverUrl), action };
        }) },
        recent: { id: 'recent', title: t('mobileLibrary.recent'), layout: 'cards', more: 'recentAll', moreLabel: '全部', items: rows(recent.slice(0, 12), 'recent:') },
        playlists: { id: 'playlists', title: '我的歌单', layout: 'cards', more: 'library', moreLabel: '全部', items: sources.online.collections.slice(0, 8).map(collection => { const action = 'mine:' + collection.id; actions[action] = () => controls.openCollection(collection); return { id: action, title: collection.name, image: absolutePageImage(collection.coverUrl), action }; }) },
    };
    const visible: PageSection[] = [{ id: 'discovery-sources', layout: 'chips', items: sourceItems }, { id: 'discovery-tools', layout: 'chips', items: [{ id: 'sources', title: '音乐来源管理', action: 'sources' }, { id: 'refresh', title: '刷新推荐', action: 'refresh' }, { id: 'allSongs', title: '全部推荐歌曲', action: 'allSongs' }] }, ...settings.modules.filter(id => !settings.hidden.includes(id)).map(id => sections[id])];
    if (feed.busy) visible.push({ id: 'discovery-loading', layout: 'message', text: '正在读取推荐，已有内容可继续使用…' });
    if (!feed.busy && !songs.length) visible.push({ id: 'discovery-empty', layout: 'message', text: '暂时没有可用推荐。可登录音乐平台或将本地音乐纳入综合推荐。' });
    feed.results.filter(result => ['login','error'].includes(result.status)).forEach(result => visible.push({ id: 'status:' + result.providerId + result.kind, layout: 'message', text: omni.getProviderLabel(result.providerId) + (result.status === 'login' ? '：登录后可获取个性化歌曲。' : '：暂时加载失败，其他来源仍可使用。') }));
    if (controls.notice) visible.push({ id: 'notice', layout: 'message', text: controls.notice });
    const model: NativePageModel = { key: 'home:discovery:' + feed.owner, title: '推荐', subtitle: '发现属于你的下一首', trailing: 'settings', trailingLabel: '推荐设置', trailingIcon: 'settings', background: 'home', bottomClearance: 152, sections: visible };
    // Keep the existing account/bootstrap gate: never replace a retained native page with a false empty state.
    useNativePage(root, 'home', props.isInteractive, sources.online.accountView === 'resolving' || !preferences.ready ? null : model, actions, onReady);
    return <>
        <DiscoverySettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}/>
        <OperationPanel id="discovery-radars" panel={radarOpen ? { title: '听屿雷达', blocks: [{ kind: 'actions', id: 'radars', items: (Object.keys(radarNames) as RadarKind[]).map(kind => ({ id: kind, label: radarNames[kind], hint: kind === 'local' ? '离线曲库' : '最多30首 · 真实推荐依据' })) }] } : null} onClose={() => setRadarOpen(false)} onAction={id => { setRadarOpen(false); openRadar(id as RadarKind); }}/>
        <OperationPanel id="discovery-track" panel={controls.menu ? { title: controls.menu.song.name, subtitle: controls.menu.reason, blocks: [{ kind: 'actions', id: 'track', items: [{ id: 'play', label: '播放', icon: 'play' }, { id: 'enqueue', label: '添加到队列', icon: 'plus' }, ...(getPlaybackSourceRef(controls.menu.song).kind === 'online' ? [{ id: 'like', label: omni.isSongLiked(controls.menu.song) ? '取消收藏' : '收藏', icon: 'heart' }] : []), { id: 'dislike', label: '不感兴趣' }] }] } : null} onClose={() => controls.setMenu(null)} onAction={id => { void controls.menuAction(id); }}/>
    </>;
}
