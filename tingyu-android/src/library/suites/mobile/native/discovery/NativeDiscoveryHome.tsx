import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useSettingsModalStore } from '../../../../../stores/useSettingsModalStore';
import { useHomeSourceStore } from '../../../../../stores/useHomeSourceStore';
import { loadNewReleaseChart } from '../../../../../services/onlineMusic/newReleaseCharts';
import DiscoveryHistoryPanel from './DiscoveryHistoryPanel';
import { useDiscoveryActions } from './useDiscoveryActions';

// Niche is declared by the engine, but its card only appears when the source supplies trustworthy
// popularity; no such field exists in the current provider contract, so this UI does not show it.
const radarNames: Record<RadarKind, string> = { heart: '心动雷达', style: '风格雷达', time: '时光雷达', explore: '探索雷达', local: '本地雷达', niche: '小众雷达' };
export default function NativeDiscoveryHome({ root, props, sources, onReady, onSources }: NativeHomeProps) {
    const { t } = useTranslation();
    const settings = useDiscoverySettingsStore(), preferences = useDiscoveryPreferences();
    const feed = useDiscoveryFeed(props.isInteractive), controls = useDiscoveryActions(props);
    const recent = useMobileLibraryStore(state => state.recentTracks);
    const roaming = useDiscoveryRoaming();
    const [batch, setBatch] = useState(0);
    const [shortcut, setShortcut] = useState<'daily'|'fm'|'charts'|null>(null);
    const [chartBusy,setChartBusy] = useState(false), [chartError,setChartError] = useState('');
    const chartRequest = useRef(0);
    useEffect(() => {
        chartRequest.current++;setChartBusy(false);setChartError('');setShortcut(null);
        return () => { chartRequest.current++; };
    }, [feed.owner, settings.source, props.isInteractive]);
    const openSettings = () => useSettingsModalStore.getState().openSettings('options','discovery');
    useEffect(() => {
        if (!props.isInteractive) return;
        const open = openSettings; document.addEventListener('tingyu-discovery-settings', open);
        return () => document.removeEventListener('tingyu-discovery-settings', open);
    }, [props.isInteractive]);
    const local = useMemo(() => settings.includeLocal ? buildLocalQueue(props.localSongs.slice(0, 600), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE) : [], [props.localSongs, props.localLibraryCatalog, settings.includeLocal]);
    const candidates = useMemo(() => [...feed.results.flatMap(result => result.songs), ...recent.filter(song => {
        const source = getPlaybackSourceRef(song); return source.kind === 'online' && (settings.source === 'all' ? settings.enabled[source.providerId] !== false : source.providerId === settings.source);
    }), ...(settings.source === 'all' ? local : [])], [feed.results, recent, local, settings.source, settings.enabled]);
    // Day and batch keep the snapshot stable; preference revision only re-ranks after a real
    // feedback event, so ordinary playback progress does not reshuffle the page.
    const seed = discoveryDay() + ':' + batch;
    const ranked = useMemo(() => rankDiscovery(candidates, preferences.values, settings, 'heart', seed, Date.now(), 100), [candidates, preferences.values, settings, seed]);
    const songs = controls.withoutHidden(ranked.map(item => item.song));
    // Local radar reads the local library even while the selected recommendation source is online.
    const radar = (kind: RadarKind) => rankDiscovery(kind === 'local' ? local : candidates, preferences.values, settings, kind, seed).map(item => item.song);
    const openRadar = (kind: RadarKind) => controls.openSongs(radarNames[kind], radar(kind), kind === 'style' ? '依据真实歌手关联；未推测音乐流派。' : '根据本机偏好及已启用的真实推荐来源生成。');
    const actions: PageActions = { settings: openSettings, sources: onSources, refresh: feed.retry,
        next: () => setBatch(value => value + 1), roam: () => roaming.active ? endDiscoveryRoaming() : controls.roam(songs),
        roamFamiliar: () => roaming.active ? endDiscoveryRoaming() : controls.roam(songs, 'familiar'),
        roamExplore: () => roaming.active ? endDiscoveryRoaming() : controls.roam(songs, 'explore'),
        allSongs: () => controls.openSongs('猜你想听', songs), allRadar: () => setRadarOpen(true),
        history: () => setHistoryOpen(true), allCollections: () => setCollectionsOpen(true),
        recentAll: () => controls.openSongs('最近播放', recent), library: () => useMobileLibraryStore.getState().setPage('library') };
    const [radarOpen, setRadarOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false), [collectionsOpen, setCollectionsOpen] = useState(false);
    const sourceItems = [{ providerId: 'all', displayName: '综合推荐' }, ...feed.sources].map(source => {
        const action = 'source:' + source.providerId; actions[action] = () => settings.patch({ source: source.providerId });
        return { id: action, title: source.providerId==='all'?'综合推荐':omni.getProviderLabel(source.providerId), selected: settings.source === source.providerId, action };
    });
    actions.local = () => useHomeSourceStore.getState().setSource('local');
    sourceItems.push({id:'local',title:omni.getProviderLabel('local'),selected:false,action:'local'});
    const rows = (list: SongResult[], prefix: string) => list.map(song => {
        const key = prefix + getPlaybackSongKey(song), source = getPlaybackSourceRef(song);
        const reason = ranked.find(item => getPlaybackSongKey(item.song) === getPlaybackSongKey(song))?.reason;
        actions[key] = () => props.onPlaySong(song, list); actions[key + ':menu'] = () => controls.setMenu({ song, queue: list, reason });
        return { id: key, title: song.name, subtitle: getSongArtistLabel(song) + ' · ' + (source.kind === 'online' ? omni.getProviderLabel(source.providerId) : '本地'),
            image: absolutePageImage(getSongCoverUrl(song)), action: key, secondary: key + ':menu', secondaryLabel: '⋮', ...catalogBadgePageFields(song, t) };
    });
    const selectedSources = feed.sources.filter(source => settings.source === 'all' ? settings.enabled[source.providerId] !== false : source.providerId === settings.source);
    const capableSources = (kind:'daily'|'fm'|'charts') => selectedSources.filter(source => kind==='charts'
        ? ['netease','qq'].includes(source.providerId) : omni.getRecommendationCapabilities(source.providerId)[kind]);
    const shortcuts = (['daily','heart','fm','charts'] as const).filter(kind => kind==='heart'||capableSources(kind).length>0).map(kind=>{
        const action='quick:'+kind;actions[action]=()=>kind==='heart'?actions.roamFamiliar({}):setShortcut(kind);
        return {id:action,title:{daily:'每日推荐',heart:'心动模式',fm:'私人 FM',charts:'排行榜'}[kind],action,
            image:{daily:'calendar',heart:'heart',fm:'radio',charts:'chart-no-axes-column'}[kind],disabled:controls.busy||(kind==='heart'&&!songs.length)};
    });
    const sections: Record<string, PageSection> = {
        roam: { id: 'discovery-brand', layout: 'discoveryHero', items: [{ id: 'roam', title: '听屿漫游', subtitle: roaming.active ? (roaming.exhausted ? '本批已全部加入' : '正在漫游 · 下一首继续发现') : '让熟悉与未知，在下一首相遇', action: 'roam', secondaryLabel:roaming.active?'退出漫游':'立即漫游',disabled:!roaming.active&&!songs.length }] },
        roamModes: { id: 'discovery-roam-modes', layout: 'chips', items: [
            { id: 'roam-familiar', title: '偏熟悉', action: 'roamFamiliar' },
            { id: 'roam-explore', title: '多探索', action: 'roamExplore' },
        ] },
        shortcuts: { id: 'shortcuts', layout: 'quickLinks', items: shortcuts },
        radars: { id: 'discovery-radars', title: '你的专属雷达', layout: 'radarCards', more: 'allRadar', moreLabel: '全部', items: (['style','time','explore'] as RadarKind[]).map(kind => {
            const action = 'radar:' + kind, list = radar(kind);
            actions[action] = () => openRadar(kind);
            actions[action+':play'] = () => { if(list.length)props.onPlaySong(list[0],list); };
            return { id: kind, title: radarNames[kind], subtitle: kind === 'style' ? '歌手与音乐的关联' : kind === 'time' ? '重逢旧日旋律' : '发现未听过的音乐', action, secondary:list.length?action+':play':'' };
        }) },
        songs: { id: 'discovery-songs', title: '猜你想听', layout: 'rows', more: 'next', moreLabel: '换一批', items: rows(songs.slice(0, 6), 'song:') },
        collections: { id: 'discovery-collections', title: '为你精选歌单', layout: 'cards', items: feed.results.flatMap(result => result.collections).slice(0, 24).map(collection => {
            const action = 'collection:' + collection.providerId + ':' + collection.id; actions[action] = () => controls.openCollection(collection);
            return { id: action, title: collection.name, subtitle: omni.getProviderLabel(collection.providerId) + (collection.trackCount != null ? ' · ' + collection.trackCount + '首' : ''), image: absolutePageImage(collection.coverUrl), action };
        }), more: 'allCollections', moreLabel: '查看更多' },
        recent: { id: 'recent', title: t('mobileLibrary.recent'), layout: 'cards', more: 'recentAll', moreLabel: '全部', items: rows(recent.slice(0, 12), 'recent:') },
        playlists: { id: 'playlists', title: '我的歌单', layout: 'cards', more: 'library', moreLabel: '全部', items: sources.online.collections.slice(0, 8).map(collection => { const action = 'mine:' + collection.id; actions[action] = () => controls.openCollection(collection); return { id: action, title: collection.name, image: absolutePageImage(collection.coverUrl), action }; }) },
    };
    const visible: PageSection[] = [{ id: 'discovery-sources', layout: 'chips', items: sourceItems }, ...settings.modules.filter(id => !settings.hidden.includes(id) && sections[id]).flatMap(id => {
        if(id==='roam'&&roaming.active)return [sections[id],sections.roamModes];
        if(id==='songs')return [sections[id],{id:'discovery-song-actions',layout:'textActions' as const,items:[{id:'allSongs',title:'全部推荐歌曲',action:'allSongs'}]}];
        return [sections[id]];
    }),{id:'discovery-refresh',layout:'textActions',items:[{id:'refresh',title:'刷新推荐',image:'refresh-cw',action:'refresh',disabled:feed.busy}]}];
    if (feed.busy) visible.push({ id: 'discovery-loading', layout: 'message', text: '正在读取推荐，已有内容可继续使用…' });
    if (!feed.busy && !songs.length) visible.push({ id: 'discovery-empty', layout: 'message', text: '暂时没有可用推荐。可登录音乐平台或将本地音乐纳入综合推荐。' });
    feed.results.filter(result => ['login','error'].includes(result.status)).forEach(result => visible.push({ id: 'status:' + result.providerId + result.kind, layout: 'message', text: omni.getProviderLabel(result.providerId) + (result.status === 'login' ? '：登录后可获取个性化歌曲。' : '：暂时加载失败，其他来源仍可使用。') }));
    if (controls.notice) visible.push({ id: 'notice', layout: 'message', text: controls.notice });
    const model: NativePageModel = { key: 'home:discovery:' + feed.owner, title: '推荐', subtitle: '发现属于你的下一首', trailing: 'settings', trailingLabel: '推荐设置', trailingIcon: 'settings', background: 'home', bottomClearance: 152, sections: visible };
    // Keep the existing account/bootstrap gate: never replace a retained native page with a false empty state.
    useNativePage(root, 'home', props.isInteractive, sources.online.accountView === 'resolving' || !preferences.ready ? null : model, actions, onReady);
    return <>
        <OperationPanel id="discovery-shortcut" panel={shortcut?{title:{daily:'每日推荐',fm:'私人 FM',charts:'排行榜'}[shortcut],blocks:[
            {id:'providers',kind:'actions',items:capableSources(shortcut).map(source=>({id:source.providerId,label:omni.getProviderLabel(source.providerId,false),hint:shortcut==='charts'?'新歌榜 · 平台真实榜单':undefined,disabled:controls.busy||chartBusy}))},
            ...(shortcut==='daily'&&selectedSources.some(source=>omni.getRecommendationCapabilities(source.providerId).history)?[{id:'history',kind:'actions' as const,items:[{id:'history',label:'历史每日推荐',icon:'calendar'}]}]:[]),
            ...(chartError?[{id:'error',kind:'note' as const,text:chartError}]:[])
        ]}:null} onClose={()=>{chartRequest.current++;setChartBusy(false);setShortcut(null);setChartError('');}} onAction={id=>{
            if(id==='history'){setShortcut(null);setHistoryOpen(true);return;}
            if(!shortcut||chartBusy||!capableSources(shortcut).some(source=>source.providerId===id))return;
            if(shortcut==='charts'){
                const request=++chartRequest.current;
                setChartBusy(true);setChartError('');void loadNewReleaseChart(id).then(collection=>{if(request===chartRequest.current){setShortcut(null);controls.openCollection(collection);}})
                    .catch(()=>{if(request===chartRequest.current)setChartError('榜单暂时无法加载，请重试。');}).finally(()=>{if(request===chartRequest.current)setChartBusy(false);});
            }else {void controls.load(id,shortcut);setShortcut(null);}
        }}/>
        <OperationPanel id="discovery-radars" panel={radarOpen ? { title: '听屿雷达', blocks: [{ kind: 'actions', id: 'radars', items: (['heart','style','explore','time','local'] as RadarKind[]).map(kind => ({ id: kind, label: radarNames[kind], hint: kind === 'local' ? '离线曲库' : '最多30首 · 真实推荐依据' })) }] } : null} onClose={() => setRadarOpen(false)} onAction={id => { setRadarOpen(false); openRadar(id as RadarKind); }}/>
        <DiscoveryHistoryPanel open={historyOpen} sources={selectedSources} onClose={() => setHistoryOpen(false)} onSongs={(title, list) => { setHistoryOpen(false); controls.openSongs(title, list); }}/>
        <OperationPanel id="discovery-collections" panel={collectionsOpen ? { title: '全部推荐歌单', blocks: [{ kind: 'actions', id: 'collections', items: feed.results.flatMap(result => result.collections).map(collection => ({ id: 'pick:' + collection.providerId + ':' + collection.id, label: collection.name, hint: omni.getProviderLabel(collection.providerId) })) }] } : null} onClose={() => setCollectionsOpen(false)} onAction={id => {
            const collection = feed.results.flatMap(result => result.collections).find(item => id === 'pick:' + item.providerId + ':' + item.id);
            setCollectionsOpen(false); if (collection) controls.openCollection(collection);
        }}/>
        <OperationPanel id="discovery-track" panel={controls.menu ? { title: controls.menu.song.name, subtitle: controls.menu.reason, blocks: [{ kind: 'actions', id: 'track', items: [{ id: 'play', label: '播放', icon: 'play' }, { id: 'enqueue', label: '添加到队列', icon: 'plus' }, ...(getPlaybackSourceRef(controls.menu.song).kind === 'online' ? [{ id: 'like', label: omni.isSongLiked(controls.menu.song) ? '取消收藏' : '收藏', icon: 'heart' }] : []), { id: 'dislike', label: '不感兴趣' }] }] } : null} onClose={() => controls.setMenu(null)} onAction={id => { void controls.menuAction(id); }}/>
    </>;
}
