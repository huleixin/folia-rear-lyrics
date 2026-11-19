import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeHomeProps } from '../NativeHomeOverview';
import { useNativePage } from '../../../../../hooks/useNativePage';
import { useDiscoveryFeed } from '../../../../../hooks/useDiscoveryFeed';
import {
    useDiscoverySettingsStore,
    useDiscoverySettingsHydrated,
    resolveEffectiveDiscoverySource,
} from '../../../../../stores/useDiscoverySettingsStore';
import { useDiscoveryPreferences } from '../../../../../services/discovery/preferences';
import {
    rankDiscovery,
    diagnoseTimeRadar,
    setLatestTimeRadarDiagnostics,
    type RadarKind,
    type TimeRadarContext,
} from '../../../../../services/discovery/ranking';
import { useLibraryInsightsData } from '../../../../core/bindings/useLibraryInsightsData';
import { getNativeIdentityFailCount } from '../../../../../hooks/useDiscoveryListening';
import { discoveryDay, discoverySources, readDiscovery } from '../../../../../services/discovery/service';
import { useDiscoveryRoaming, switchRoamingMode, endDiscoveryRoaming, type RoamingFetchMore } from '../../../../../services/discovery/roaming';
import { useMobileLibraryStore } from '../../../../../stores/useMobileLibraryStore';
import { buildLocalQueue, LIST_ROW_COVER_SIZE } from '../../../../../services/playbackAdapters';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../../../../utils/appPlaybackGuards';
import { getSongArtistLabel, getSongCoverUrl } from '../../../../../services/onlineMusic/songMetadata';
import { absolutePageImage } from '../../../../../services/nativePages';
import { omni } from '../../../../../services/onlineMusic/omni';
import { visibleDiscoverySection } from '../../../../../services/discovery/visibility';
import { catalogBadgePageFields } from '../../../../../utils/catalogAudioLabels';
import type { NativePageModel, PageActions, PageSection } from '../../../../../types/nativePages';
import type { SongResult } from '../../../../../types';
import OperationPanel from '../../../../../components/shared/OperationPanel';
import { useSettingsModalStore } from '../../../../../stores/useSettingsModalStore';
import { useLibraryHomeLocal } from '../../../../core/bindings/useLibraryHomeLocal';
import { LOCAL_MUSIC_UPDATED_EVENT } from '../../../../../services/localMusicService';
import {
    LOCAL_PLAY_HISTORY_UPDATED_EVENT,
    localDailySeed,
    pickDailyLocalSongs,
    pickLeastRecentlyPlayed,
    resolveLocalPlayHistory,
    type ResolvedLocalPlay,
} from '../../../../../services/localPlayHistory';
import { loadNewReleaseChart } from '../../../../../services/onlineMusic/newReleaseCharts';
import DiscoveryHistoryPanel from './DiscoveryHistoryPanel';
import { useDiscoveryActions } from './useDiscoveryActions';
import { useUnifiedLibrary } from '../../../../core/bindings/useUnifiedLibrary';
import { useOnlineProviderAccountStore } from '../../../../../stores/useOnlineProviderAccountStore';

// Niche is declared by the engine, but its card only appears when the source supplies trustworthy
// popularity; no such field exists in the current provider contract, so this UI does not show it.
const radarNames: Record<RadarKind, string> = { heart: '心动雷达', style: '风格雷达', time: '时光雷达', explore: '探索雷达', local: '本地雷达', niche: '小众雷达' };
export default function NativeDiscoveryHome({ root, props, sources, onReady, onSources }: NativeHomeProps) {
    const { t } = useTranslation();
    const settings = useDiscoverySettingsStore(), preferences = useDiscoveryPreferences();
    const settingsHydrated = useDiscoverySettingsHydrated();
    const effectiveSource = resolveEffectiveDiscoverySource(settings);
    const effectiveSettings = useMemo(
        () => effectiveSource === settings.source ? settings : { ...settings, source: effectiveSource },
        [settings, effectiveSource],
    );
    useEffect(() => {
        if (settingsHydrated && effectiveSource !== settings.source) {
            settings.patch({ source: effectiveSource });
        }
    }, [settingsHydrated, effectiveSource, settings.source]);
    const feed = useDiscoveryFeed(props.isInteractive), controls = useDiscoveryActions(props);
    const unifiedPlaylists = useUnifiedLibrary(props.isInteractive && effectiveSource !== 'local', effectiveSource === 'local' ? 'all' : effectiveSource, 'playlists');
    const onlineAccounts = useOnlineProviderAccountStore(state => state.accounts);
    const insightsData = useLibraryInsightsData(props, props.isInteractive, effectiveSource);
    const recent = useMobileLibraryStore(state => state.recentTracks);
    const roaming = useDiscoveryRoaming();
    const [batch, setBatch] = useState(0);
    const [shortcut, setShortcut] = useState<'daily'|'fm'|'charts'|null>(null);
    const [chartBusy,setChartBusy] = useState(false), [chartError,setChartError] = useState('');
    const chartRequest = useRef(0);
    useEffect(() => {
        chartRequest.current++;setChartBusy(false);setChartError('');setShortcut(null);
        return () => { chartRequest.current++; };
    }, [feed.owner, effectiveSource, props.isInteractive]);
    const openSettings = () => useSettingsModalStore.getState().openSettings('options','discovery');
    useEffect(() => {
        if (!props.isInteractive) return;
        const open = openSettings; document.addEventListener('tingyu-discovery-settings', open);
        return () => document.removeEventListener('tingyu-discovery-settings', open);
    }, [props.isInteractive]);
    const isLocalSource = effectiveSource === 'local';
    const localHome = useLibraryHomeLocal({
        localSongs: props.localSongs,
        localPlaylists: props.localPlaylists,
        catalog: props.localLibraryCatalog,
        activeRow: props.localMusicState.activeRow,
    });
    const [localPlays, setLocalPlays] = useState<ResolvedLocalPlay[]>([]);
    useEffect(() => {
        let cancelled = false;
        const reloadLocalPlays = () => {
            void resolveLocalPlayHistory(props.localSongs).then(items => {
                if (!cancelled) setLocalPlays(items);
            }).catch(() => {});
        };
        reloadLocalPlays();
        window.addEventListener(LOCAL_PLAY_HISTORY_UPDATED_EVENT, reloadLocalPlays);
        window.addEventListener(LOCAL_MUSIC_UPDATED_EVENT, reloadLocalPlays);
        return () => {
            cancelled = true;
            window.removeEventListener(LOCAL_PLAY_HISTORY_UPDATED_EVENT, reloadLocalPlays);
            window.removeEventListener(LOCAL_MUSIC_UPDATED_EVENT, reloadLocalPlays);
        };
    }, [props.localSongs]);

    const localAllTracks = useMemo(
        () => buildLocalQueue(props.localSongs.slice(0, 600), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE),
        [props.localSongs, props.localLibraryCatalog],
    );
    const localDailyTracks = useMemo(
        () => buildLocalQueue(pickDailyLocalSongs(props.localSongs, localDailySeed(), 30), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE),
        [props.localSongs, props.localLibraryCatalog],
    );
    const localMostPlayedTracks = useMemo(() => {
        const ordered = [...localPlays].sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt).map(p => p.song);
        return buildLocalQueue(ordered.slice(0, 30), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE);
    }, [localPlays, props.localLibraryCatalog]);
    const localRecentTracks = useMemo(
        () => buildLocalQueue(localPlays.slice(0, 24).map(p => p.song), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE),
        [localPlays, props.localLibraryCatalog],
    );
    const localForgottenTracks = useMemo(
        () => buildLocalQueue(pickLeastRecentlyPlayed(localPlays, 30).map(p => p.song), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE),
        [localPlays, props.localLibraryCatalog],
    );

    const local = useMemo(
        () => isLocalSource
            ? localAllTracks
            : (settings.includeLocal && effectiveSource === 'all' && settings.enabled.local !== false ? localAllTracks : []),
        [isLocalSource, localAllTracks, settings.includeLocal, effectiveSource, settings.enabled.local],
    );
    const scopedResults = useMemo(
        () => isLocalSource ? [] : feed.results.filter(result => effectiveSource === 'all' ? settings.enabled[result.providerId] !== false : result.providerId === effectiveSource),
        [isLocalSource, feed.results, effectiveSource, settings.enabled],
    );
    const candidates = useMemo(() => {
        if (isLocalSource) {
            return [...localMostPlayedTracks, ...localDailyTracks, ...localAllTracks];
        }
        return [
            ...scopedResults.flatMap(result => result.songs),
            ...recent.filter(song => {
                const source = getPlaybackSourceRef(song);
                return source.kind === 'online' && (effectiveSource === 'all' ? settings.enabled[source.providerId] !== false : source.providerId === effectiveSource);
            }),
            ...local,
        ];
    }, [isLocalSource, localMostPlayedTracks, localDailyTracks, localAllTracks, scopedResults, recent, local, effectiveSource, settings.enabled]);
    // Day and batch keep the snapshot stable; preference revision only re-ranks after a real
    // feedback event, so ordinary playback progress does not reshuffle the page.
    const seed = discoveryDay() + ':' + batch;
    const ranked = useMemo(() => rankDiscovery(candidates, preferences.values, effectiveSettings, 'heart', seed, Date.now(), 100), [candidates, preferences.values, effectiveSettings, seed]);
    const songs = controls.withoutHidden(ranked.map(item => item.song));
    const timeRadarContext = useMemo<TimeRadarContext>(() => {
        const likedKeys = new Set<string>();
        const platformLikedCounts: Record<string, number> = {};
        const sessionStats = new Map<string, { lastPlayed: number; plays: number }>();

        for (const candidate of insightsData.candidates) {
            const key = getPlaybackSongKey(candidate.song);
            if (candidate.liked) {
                likedKeys.add(key);
                const src = getPlaybackSourceRef(candidate.song);
                const label = src.kind === 'online' ? src.providerId : src.kind;
                platformLikedCounts[label] = (platformLikedCounts[label] ?? 0) + 1;
            }
            if (candidate.legacyLastPlayed) {
                const prev = sessionStats.get(key) ?? { lastPlayed: 0, plays: 0 };
                sessionStats.set(key, {
                    lastPlayed: Math.max(prev.lastPlayed, candidate.legacyLastPlayed),
                    plays: Math.max(prev.plays, 1),
                });
            }
        }
        for (const session of insightsData.sessions) {
            const prev = sessionStats.get(session.songKey) ?? { lastPlayed: 0, plays: 0 };
            sessionStats.set(session.songKey, {
                lastPlayed: Math.max(prev.lastPlayed, session.endedAt || session.startedAt || 0),
                plays: prev.plays + 1,
            });
        }
        return {
            likedKeys,
            sessionStats,
            preferencesReady: preferences.ready,
            nativeIdentityFailCount: getNativeIdentityFailCount(),
            platformLikedCounts,
        };
    }, [insightsData.candidates, insightsData.sessions, preferences.ready]);

    const timeRadarPool = useMemo(
        () => [...insightsData.candidates.map(item => item.song), ...candidates, ...recent],
        [insightsData.candidates, candidates, recent],
    );

    useEffect(() => {
        const diag = diagnoseTimeRadar(timeRadarPool, preferences.values, effectiveSettings, Date.now(), 30, timeRadarContext);
        setLatestTimeRadarDiagnostics(diag);
    }, [timeRadarPool, preferences.values, effectiveSettings, timeRadarContext]);

    // Local radar reads the local library even while the selected recommendation source is online.
    // Time radar merges complete listening sessions, platform/local likes, and recent history.
    const radar = (kind: RadarKind) => {
        if (kind === 'time') {
            return rankDiscovery(timeRadarPool, preferences.values, effectiveSettings, 'time', seed, Date.now(), 30, timeRadarContext).map(item => item.song);
        }
        const pool = kind === 'local'
            ? buildLocalQueue(props.localSongs.slice(0, 600), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE)
            : candidates;
        return rankDiscovery(pool, preferences.values, effectiveSettings, kind, seed).map(item => item.song);
    };
    const openRadar = (kind: RadarKind) => {
        const list = radar(kind);
        const emptyHint = kind === 'time'
            ? (insightsData.loading
                ? '正在同步你的收听历史与收藏歌曲…'
                : '等待与你的旧旋律重逢\n听屿会根据真实的收听历史与收藏歌曲，为你找回曾经喜欢的音乐。')
            : kind === 'local' ? '暂无本地音乐，可在资料库导入本地曲库。'
            : '当前平台候选数据不足，请先收听或收藏一些歌曲，或切换其他平台。';
        const desc = list.length ? (kind === 'style' ? '依据真实歌手关联；未推测音乐流派。' : '根据本机收听历史、收藏记录及当前筛选来源生成。') : emptyHint;
        const radarCoverMap: Partial<Record<RadarKind, string>> = {
            style: '/assets/discovery/radar-style.webp',
            time: '/assets/discovery/radar-time.webp',
            explore: '/assets/discovery/radar-explore.webp',
        };
        controls.openSongs(radarNames[kind], list, desc, true, radarCoverMap[kind]);
    };
    const fetchMoreRoamingCandidates: RoamingFetchMore = async () => {
        if (isLocalSource) {
            return buildLocalQueue(props.localSongs.slice(0, 600), undefined, props.localLibraryCatalog, LIST_ROW_COVER_SIZE);
        }
        const enabledProviders = discoverySources()
            .filter(source => effectiveSource === 'all' ? settings.enabled[source.providerId] !== false : source.providerId === effectiveSource)
            .map(source => source.providerId);
        if (!enabledProviders.length) return [];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const tasks = enabledProviders.flatMap(providerId => [
                readDiscovery(providerId, 'fm', controller.signal).catch(() => null),
                readDiscovery(providerId, 'daily', controller.signal).catch(() => null),
            ]);
            const results = await Promise.all(tasks);
            return results.flatMap(result => (result?.status === 'ready' ? result.songs : []));
        } finally {
            clearTimeout(timer);
        }
    };
    const roamModeLabel = roaming.mode === 'familiar' ? '偏熟悉' : roaming.mode === 'explore' ? '多探索' : '听屿漫游';
    const roamActiveSubtitle = roaming.status === 'replenishing'
        ? `正在补充漫游歌曲（${roamModeLabel}）…`
        : roaming.status === 'error'
            ? (roaming.notice || '网络波动，稍后自动重试补充歌曲')
            : roaming.exhausted
                ? '当前曲库已全部漫游完毕'
                : `正在漫游（${roamModeLabel}）· 下一首继续发现`;
    const pullRefreshActiveRef = useRef(false);
    useEffect(() => {
        if (!pullRefreshActiveRef.current || feed.busy) return;
        pullRefreshActiveRef.current = false;
        if (!isLocalSource && scopedResults.length > 0 && scopedResults.every(result => result.status === 'error')) {
            controls.setNotice('推荐刷新失败，已保留当前内容，请稍后重试');
        }
    }, [feed.busy, isLocalSource, scopedResults, controls]);
    const actions: PageActions = { settings: openSettings, sources: onSources,
        refresh: () => {
            if (isLocalSource) {
                setBatch(value => value + 1);
                return;
            }
            if (feed.busy) return;
            pullRefreshActiveRef.current = true;
            feed.retry();
        },
        next: () => setBatch(value => value + 1),
        roam: () => roaming.active ? endDiscoveryRoaming() : controls.roam(songs, 'balanced', fetchMoreRoamingCandidates),
        roamBalanced: () => roaming.active ? switchRoamingMode('balanced', songs) : controls.roam(songs, 'balanced', fetchMoreRoamingCandidates),
        roamFamiliar: () => roaming.active ? switchRoamingMode('familiar', songs) : controls.roam(songs, 'familiar', fetchMoreRoamingCandidates),
        roamExplore: () => roaming.active ? switchRoamingMode('explore', songs) : controls.roam(songs, 'explore', fetchMoreRoamingCandidates),
        allSongs: () => controls.openSongs(isLocalSource ? '常听精选与本地推荐' : '猜你想听', songs), allRadar: () => setRadarOpen(true),
        history: () => setHistoryOpen(true), allCollections: () => setCollectionsOpen(true),
        recentAll: () => controls.openSongs('最近播放', isLocalSource ? localRecentTracks : recent),
        library: () => {
            useMobileLibraryStore.getState().setPage('library');
            if (isLocalSource) useMobileLibraryStore.getState().setLocalMusicOpen(true);
        },
        openLocalSubpage: () => {
            useMobileLibraryStore.getState().setPage('library');
            useMobileLibraryStore.getState().setLocalMusicOpen(true);
        },
    };
    const [radarOpen, setRadarOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false), [collectionsOpen, setCollectionsOpen] = useState(false);
    const sourceItems = [{ providerId: 'all', displayName: '综合推荐' }, ...feed.visibleSourceTabs].map(source => {
        const action = 'source:' + source.providerId; actions[action] = () => settings.patch({ source: source.providerId });
        const title = source.providerId === 'all' ? '综合推荐' : source.providerId === 'local' ? '本地音乐' : omni.getProviderLabel(source.providerId);
        return { id: action, title, selected: effectiveSource === source.providerId, action };
    });
    const activePlatformLabel = effectiveSource === 'all' ? '' : effectiveSource === 'local' ? '本地音乐' : omni.getProviderLabel(effectiveSource);
    const rows = (list: SongResult[], prefix: string) => list.map(song => {
        const key = prefix + getPlaybackSongKey(song), source = getPlaybackSourceRef(song);
        const reason = ranked.find(item => getPlaybackSongKey(item.song) === getPlaybackSongKey(song))?.reason;
        actions[key] = () => props.onPlaySong(song, list); actions[key + ':menu'] = () => controls.setMenu({ song, queue: list, reason });
        return { id: key, title: song.name, subtitle: getSongArtistLabel(song) + ' · ' + (source.kind === 'online' ? omni.getProviderLabel(source.providerId) : '本地'),
            image: absolutePageImage(getSongCoverUrl(song)), action: key, secondary: key + ':menu', secondaryLabel: '⋮', ...catalogBadgePageFields(song, t) };
    });
    const selectedSources = effectiveSource === 'all' ? feed.visibleSources : feed.visibleSources.filter(source => source.providerId === effectiveSource);
    const capableSources = (kind:'daily'|'fm'|'charts') => selectedSources.filter(source => kind==='charts'
        ? ['netease','qq'].includes(source.providerId) : omni.getRecommendationCapabilities(source.providerId)[kind]);
    const openChartFor = (providerId: string) => {
        const request=++chartRequest.current;
        setChartBusy(true);setChartError('');void loadNewReleaseChart(providerId).then(collection=>{if(request===chartRequest.current){setShortcut(null);controls.openCollection(collection);}})
            .catch(()=>{if(request===chartRequest.current){setChartError('榜单暂时无法加载，请重试。');controls.setNotice('榜单暂时无法加载，请重试。');}}).finally(()=>{if(request===chartRequest.current)setChartBusy(false);});
    };
    const shortcuts = isLocalSource
        ? [
            {
                id: 'quick:local-daily',
                title: '本地日推',
                image: 'calendar',
                disabled: localDailyTracks.length === 0,
                run: () => controls.openSongs('本地每日推荐', localDailyTracks, '依据本机曲库每日稳定精选30首，跨天自动更新。'),
            },
            {
                id: 'quick:local-heart',
                title: '心动模式',
                image: 'heart',
                disabled: songs.length === 0,
                run: () => actions.roamFamiliar({}),
            },
            {
                id: 'quick:local-frequent',
                title: '常听精选',
                image: 'flame',
                disabled: localMostPlayedTracks.length === 0 && localDailyTracks.length === 0,
                run: () => controls.openSongs(
                    '常听精选',
                    localMostPlayedTracks.length > 0 ? localMostPlayedTracks : localDailyTracks,
                    localMostPlayedTracks.length > 0 ? '依据本机真实播放次数排序。' : '尚无常听记录，先为你展示今日精选本地歌曲。',
                ),
            },
            {
                id: 'quick:local-forgotten',
                title: '好久不见',
                image: 'clock',
                disabled: localForgottenTracks.length === 0 && songs.length === 0,
                run: () => controls.openSongs(
                    '好久不见',
                    localForgottenTracks.length > 0 ? localForgottenTracks : songs.slice(0, 30),
                    localForgottenTracks.length > 0 ? '曾经听过但近期未播的本机歌曲。' : '从本机曲库中为你探索更多歌曲。',
                ),
            },
        ].map(entry => {
            actions[entry.id] = entry.run;
            return { id: entry.id, title: entry.title, action: entry.id, image: entry.image, disabled: entry.disabled };
        })
        : (['daily','heart','fm','charts'] as const).filter(kind => kind === 'heart' ? songs.length > 0 : capableSources(kind).length > 0).map(kind=>{
            const targets = kind==='heart' ? [] : capableSources(kind);
            const available = kind==='heart' ? songs.length>0 : targets.length>0;
            const action='quick:'+kind;
            actions[action]=()=>{
                if(kind==='heart'){actions.roamFamiliar({});return;}
                if(!available){controls.setNotice((activePlatformLabel||'当前启用平台')+'暂不支持'+({daily:'每日推荐',fm:'私人 FM',charts:'排行榜'}[kind])+'。');return;}
                if(effectiveSource!=='all' && targets.length===1 && kind!=='daily'){
                    if(kind==='charts') openChartFor(targets[0].providerId);
                    else void controls.load(targets[0].providerId, kind);
                    return;
                }
                setShortcut(kind);
            };
            return {id:action,title:{daily:'每日推荐',heart:'心动模式',fm:'私人 FM',charts:'排行榜'}[kind],action,
                image:{daily:'calendar',heart:'heart',fm:'radio',charts:'chart-no-axes-column'}[kind],disabled:controls.busy||!available};
        });
    const roamIdleSubtitle = activePlatformLabel ? `在${activePlatformLabel}发现属于你的下一首` : '让熟悉与未知，在下一首相遇';
    const localAlbums = localHome.sections.find(s => s.key === 'albums')?.groups ?? [];
    const localPlaylists = localHome.sections.find(s => s.key === 'playlists')?.groups ?? [];
    const myOnlinePlaylists = useMemo(() => {
        if (isLocalSource) return [];
        const providerOrder = effectiveSource === 'all'
            ? [
                ...feed.visibleSources.map(source => source.providerId),
                ...(sources.online.providerId && settings.enabled[sources.online.providerId] !== false ? [sources.online.providerId] : []),
            ]
            : [effectiveSource];
        const orderedPids = [...new Set(providerOrder)];
        const pageByProvider = new Map(unifiedPlaylists.pages.map(page => [page.providerId, page.items]));
        const seen = new Set<string>();
        const merged = [];
        for (const pid of orderedPids) {
            const unifiedItems = pageByProvider.get(pid) ?? [];
            const accountItems = onlineAccounts[pid]?.collections ?? [];
            const activeItems = pid === sources.online.providerId ? sources.online.collections : [];
            // Prefer unified library's complete playlist list while preserving any account/snapshot extras.
            for (const collection of [...unifiedItems, ...accountItems, ...activeItems]) {
                const key = `${collection.providerId || pid}:${collection.type}:${String(collection.id)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(collection);
            }
        }
        return merged;
    }, [isLocalSource, effectiveSource, feed.visibleSources, sources.online.providerId, sources.online.collections, settings.enabled, unifiedPlaylists.pages, onlineAccounts]);
    const radarCardKinds: RadarKind[] = isLocalSource ? ['local', 'time', 'style'] : ['style', 'time', 'explore'];
    const sections: Record<string, PageSection> = {
        roam: { id: 'discovery-brand', layout: 'discoveryHero', items: [{ id: 'roam', title: '听屿漫游', subtitle: roaming.active ? roamActiveSubtitle : roamIdleSubtitle, action: 'roam', secondaryLabel:roaming.active?'退出漫游':'立即漫游',disabled:!roaming.active&&!songs.length }] },
        roamModes: { id: 'discovery-roam-modes', layout: 'chips', items: [
            { id: 'roam-balanced', title: '听屿漫游', action: 'roamBalanced', selected: roaming.active && roaming.mode === 'balanced' },
            { id: 'roam-familiar', title: '偏熟悉', action: 'roamFamiliar', selected: roaming.active && roaming.mode === 'familiar' },
            { id: 'roam-explore', title: '多探索', action: 'roamExplore', selected: roaming.active && roaming.mode === 'explore' },
        ] },
        shortcuts: { id: 'shortcuts', layout: 'quickLinks', items: shortcuts },
        radars: { id: 'discovery-radars', title: '你的专属雷达', layout: 'radarCards', more: 'allRadar', moreLabel: '全部', items: radarCardKinds.filter(kind => radar(kind).length > 0).map(kind => {
            const action = 'radar:' + kind, list = radar(kind);
            actions[action] = () => openRadar(kind);
            actions[action+':play'] = () => { if(list.length)props.onPlaySong(list[0],list); };
            return { id: kind, title: radarNames[kind], subtitle: kind === 'local' ? '离线本机曲库' : kind === 'style' ? '歌手与音乐的关联' : kind === 'time' ? (insightsData.loading && !list.length ? '正在整理收听记忆…' : '重逢旧日旋律') : '发现未听过的音乐', action, secondary:list.length?action+':play':'' };
        }) },
        songs: { id: 'discovery-songs', title: isLocalSource ? '常听精选' : '猜你想听', layout: 'rows', more: 'next', moreLabel: '换一批', footerAction: 'allSongs', footerLabel: '全部推荐歌曲', items: rows(songs.slice(0, 6), 'song:') },
        collections: isLocalSource
            ? {
                id: 'discovery-collections',
                title: '本地专辑精选',
                layout: 'cards',
                items: localAlbums.slice(0, 24).map((group, idx) => {
                    const action = `local-album:${idx}:${group.id}`;
                    actions[action] = () => props.homeResources.actions.openLocalGroup(group, props.onOpenGridView);
                    return {
                        id: action,
                        title: group.name,
                        subtitle: `${group.description ? `${group.description} · ` : ''}${group.trackCount ?? group.songs.length}首`,
                        image: typeof group.coverUrl === 'string' ? absolutePageImage(group.coverUrl) : undefined,
                        action,
                    };
                }),
                more: 'openLocalSubpage',
                moreLabel: '全部',
            }
            : { id: 'discovery-collections', title: '为你精选歌单', layout: 'cards', items: scopedResults.flatMap(result => result.collections).filter(collection => collection.id && collection.name && collection.trackCount !== 0).slice(0, 24).map(collection => {
                const action = 'collection:' + collection.providerId + ':' + collection.id; actions[action] = () => controls.openCollection(collection);
                return { id: action, title: collection.name, subtitle: omni.getProviderLabel(collection.providerId) + (collection.trackCount != null ? ' · ' + collection.trackCount + '首' : ''), image: absolutePageImage(collection.coverUrl), action };
            }), more: 'allCollections', moreLabel: '全部' },
        recent: { id: 'recent', title: t('mobileLibrary.recent'), layout: 'cards', more: 'recentAll', moreLabel: '全部', items: rows((isLocalSource ? localRecentTracks : recent).slice(0, 12), 'recent:') },
        playlists: isLocalSource
            ? {
                id: 'playlists',
                title: '本地歌单',
                layout: 'cards',
                more: 'openLocalSubpage',
                moreLabel: '全部',
                items: localPlaylists.slice(0, 24).map((group, idx) => {
                    const action = `local-pl:${idx}:${group.id}`;
                    actions[action] = () => props.homeResources.actions.openLocalGroup(group, props.onOpenGridView);
                    return {
                        id: action,
                        title: group.name,
                        subtitle: `${group.trackCount ?? group.songs.length}首`,
                        image: typeof group.coverUrl === 'string' ? absolutePageImage(group.coverUrl) : undefined,
                        action,
                    };
                }),
            }
            : {
                id: 'playlists',
                title: '我的歌单',
                layout: 'cards',
                more: 'library',
                moreLabel: '全部',
                items: myOnlinePlaylists.slice(0, 24).map(collection => {
                    const action = 'mine:' + collection.providerId + ':' + collection.id;
                    actions[action] = () => controls.openCollection(collection);
                    const subtitle = [
                        collection.providerId ? omni.getProviderLabel(collection.providerId) : '',
                        typeof collection.trackCount === 'number' && collection.trackCount >= 0 ? `${collection.trackCount}首` : '',
                    ].filter(Boolean).join(' · ');
                    return {
                        id: action,
                        title: collection.name,
                        ...(subtitle ? { subtitle } : {}),
                        image: absolutePageImage(collection.coverUrl),
                        action,
                    };
                }),
            },
    };
    const collectionsSupported = isLocalSource || selectedSources.some(source => omni.getRecommendationCapabilities(source.providerId).collections);
    const visible: PageSection[] = [{ id: 'discovery-sources', layout: 'chips', items: sourceItems }, ...settings.modules.filter(id => !settings.hidden.includes(id) && sections[id] && visibleDiscoverySection(id, sections[id], collectionsSupported)).flatMap(id => {
        if(id==='roam'&&roaming.active)return [sections[id],sections.roamModes];
        return [sections[id]];
    })];
    if (feed.busy && !isLocalSource && !songs.length) visible.push({ id: 'discovery-loading', layout: 'message', text: '正在读取推荐，已有内容可继续使用…' });
    if (!feed.busy && !songs.length) {
        const emptyText = isLocalSource
            ? '暂无本地音乐，可进入「本地音乐」扫描或导入手机音频目录。'
            : feed.visibleSources.length === 0
                ? '已关闭所有在线推荐来源。可在推荐设置中开启平台来源，或导入本地音乐。'
                : '暂时没有可用推荐。可登录音乐平台或将本地音乐纳入综合推荐。';
        visible.push({
            id: 'discovery-empty',
            layout: 'message',
            text: emptyText,
            ...(isLocalSource ? { more: 'openLocalSubpage', moreLabel: '进入本地音乐' } : {}),
        });
    }
    const hideUnloggedIn = settings.hideUnloggedInPrompts !== false && effectiveSource === 'all';
    scopedResults.filter(result => {
        if (result.status === 'login') return !hideUnloggedIn;
        return result.status === 'error';
    }).forEach(result => {
        if (result.status === 'login') {
            const loginAction = 'login:' + result.providerId;
            actions[loginAction] = () => { useSettingsModalStore.getState().openSettings('options', 'accounts'); };
            visible.push({ id: 'status:' + result.providerId + result.kind, layout: 'message', text: omni.getProviderLabel(result.providerId) + '：部分个性化内容需登录后获取。', more: loginAction, moreLabel: '去登录' });
        } else {
            visible.push({ id: 'status:' + result.providerId + result.kind, layout: 'message', text: omni.getProviderLabel(result.providerId) + '：暂时加载失败，其他来源仍可使用。' });
        }
    });
    if (controls.notice) visible.push({ id: 'notice', layout: 'message', text: controls.notice });
    const orderTag = feed.visibleSourceTabs.map(s => s.providerId).join(',');
    const model: NativePageModel = { key: `home:discovery:${effectiveSource}:${orderTag}:${feed.owner}`, title: '推荐', subtitle: '发现属于你的下一首', trailing: 'settings', trailingLabel: '推荐设置', trailingIcon: 'settings', background: 'home', bottomClearance: 152, refreshAction: 'refresh', refreshing: !isLocalSource && feed.busy, sections: visible };
    // Keep the existing account/bootstrap gate: never replace a retained native page with a false empty state.
    useNativePage(root, 'home', props.isInteractive, sources.online.accountView === 'resolving' || !preferences.ready || !settingsHydrated ? null : model, actions, onReady);
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
        <OperationPanel id="discovery-collections" panel={collectionsOpen ? { title: '全部推荐歌单', blocks: [{ kind: 'actions', id: 'collections', items: scopedResults.flatMap(result => result.collections).map(collection => ({ id: 'pick:' + collection.providerId + ':' + collection.id, label: collection.name, hint: omni.getProviderLabel(collection.providerId) })) }] } : null} onClose={() => setCollectionsOpen(false)} onAction={id => {
            const collection = scopedResults.flatMap(result => result.collections).find(item => id === 'pick:' + item.providerId + ':' + item.id);
            setCollectionsOpen(false); if (collection) controls.openCollection(collection);
        }}/>
        <OperationPanel id="discovery-track" panel={controls.menu ? { title: controls.menu.song.name, subtitle: controls.menu.reason, blocks: [{ kind: 'actions', id: 'track', items: [{ id: 'play', label: '播放', icon: 'play' }, { id: 'enqueue', label: '添加到队列', icon: 'plus' }, ...(getPlaybackSourceRef(controls.menu.song).kind === 'online' ? [{ id: 'like', label: omni.isSongLiked(controls.menu.song) ? '取消收藏' : '收藏', icon: 'heart' }] : []), { id: 'dislike', label: '不感兴趣' }] }] } : null} onClose={() => controls.setMenu(null)} onAction={id => { void controls.menuAction(id); }}/>
    </>;
}
