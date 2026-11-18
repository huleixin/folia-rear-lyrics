import { useTranslation } from 'react-i18next';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ListPlus, SlidersHorizontal, TrendingUp, ArrowUpDown, RefreshCw,
    LayoutGrid, Smartphone, RotateCcw, ChevronUp, ChevronDown, GripVertical,
} from 'lucide-react';
import { useNativePage } from '../../../../hooks/useNativePage';
import { useUnifiedLibrary } from '../../../core/bindings/useUnifiedLibrary';
import {
    useLibraryOrganization,
    useLibraryOrganizationHydrated,
    collectionOrganizationKey,
    computeEffectivePlatformOrder,
    computeProviderRank,
    type LibrarySortKey,
} from '../../../core/state/useLibraryOrganization';
import { omni } from '../../../../services/onlineMusic/omni';
import { absolutePageImage } from '../../../../services/nativePages';
import { useMobileLibraryStore } from '../../../../stores/useMobileLibraryStore';
import { useSettingsModalStore } from '../../../../stores/useSettingsModalStore';
import {
    useDiscoverySettingsStore,
    useDiscoverySettingsHydrated,
    computeDiscoverySourceOrder,
} from '../../../../stores/useDiscoverySettingsStore';
import type { NativeHomeProps } from './NativeHomeOverview';
import type { PageActions, PageSection } from '../../../../types/nativePages';
import type { ProviderCollection } from '../../../../types/onlineMusic';
import OperationPanel from '../../../../components/shared/OperationPanel';
import MobileSheet from '../../../../components/shared/MobileSheet';
import { MobileLocalTools } from '../MobileHomeSources';
import { pageRowActions } from '../../../../utils/nativePageActions';
import { getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { privateLibrarySongs } from '../../../core/model/privateLibrarySongs';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import type { SongResult } from '../../../../types';
import { useLibraryInsights } from './useLibraryInsights';
import { useSheetThemeTokens } from './sheetThemeTokens';

// src/library/suites/mobile/native/NativeUnifiedLibrary.tsx
const SORT_LABELS: Array<{ id: LibrarySortKey; label: string }> = [
    { id: 'source', label: '平台顺序' },
    { id: 'recent_collect', label: '最近收藏' },
    { id: 'recent_play', label: '最近播放' },
    { id: 'count', label: '歌曲数量' },
    { id: 'name', label: '歌单名称' },
];

export default function NativeUnifiedLibrary({ root, props, sources, onSources, onReady }: NativeHomeProps) {
    const { t } = useTranslation();
    const tokens = useSheetThemeTokens();
    const organization = useLibraryOrganization();
    const discoverySettings = useDiscoverySettingsStore();
    const discoveryHydrated = useDiscoverySettingsHydrated();
    const [resource, setResource] = useState<'playlists' | 'albums'>('playlists');
    const [query, setQuery] = useState('');
    const [offset, setOffset] = useState(0);
    const [group, setGroup] = useState('');
    const [menu, setMenu] = useState<{ collection: ProviderCollection; key: string } | null>(null);
    const [manageOpen, setManageOpen] = useState(false);
    const [localManageOpen, setLocalManageOpen] = useState(false);
    const [platformOrderOpen, setPlatformOrderOpen] = useState(false);

    // Drag-to-reorder draft state for 平台排序 (never mutates library until 完成)
    const [draftOrder, setDraftOrder] = useState<string[]>([]);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOffsetY, setDragOffsetY] = useState(0);
    const dragStartY = useRef(0);
    const dragListRef = useRef<HTMLDivElement>(null);

    const isUnified = organization.source === 'all';
    const showPlatformGrouping = isUnified && organization.sort === 'source' && organization.groupByPlatform;
    const searchActive = query.trim().length > 0;
    const isGroupCollapsed = (groupId: string) => !searchActive && Boolean(organization.collapsedGroups?.[groupId]);

    const feed = useUnifiedLibrary(props.isInteractive, organization.source, resource);
    const sharedInsights = useLibraryInsights(
        props,
        organization.source,
        feed.owner,
        isGroupCollapsed('smart'),
        showPlatformGrouping ? () => organization.toggleGroup('smart') : undefined,
    );
    const { data: insights, footprint } = sharedInsights;

    const privateSongs = useMemo(
        () => privateLibrarySongs(insights.candidates, insights.sessions, query),
        [insights.candidates, insights.sessions, query],
    );

    const openSongs = (id: string, name: string, songs: SongResult[], description: string) => props.onOpenGridView({
        source: 'online',
        providerId: 'discovery',
        type: 'discovery',
        id: 'library:' + id,
        name,
        description,
        trackCount: songs.length,
        coverUrl: songs[0] ? getSongCoverUrl(songs[0]) : undefined,
        discoveryTracks: songs,
    });

    const availableProviderIds = useMemo(
        () => feed.providers.map(p => p.providerId),
        [feed.providers],
    );

    const orgHydrated = useLibraryOrganizationHydrated() && discoveryHydrated;

    // 统一权威来源：资料库顶部平台标签、分区顺序与隐藏状态完全遵循「推荐设置」配置
    const baseOrderedProviderIds = useMemo(() => {
        const preferredOrder = discoverySettings.sourceOrder.length > 0
            ? discoverySettings.sourceOrder
            : organization.platformOrder;
        return computeDiscoverySourceOrder(preferredOrder, availableProviderIds);
    }, [discoverySettings.sourceOrder, organization.platformOrder, availableProviderIds]);

    const effectivePlatformOrder = useMemo(
        () => baseOrderedProviderIds.filter(id => discoverySettings.enabled[id] !== false),
        [baseOrderedProviderIds, discoverySettings.enabled],
    );

    const visibleProviderSet = useMemo(
        () => new Set(effectivePlatformOrder),
        [effectivePlatformOrder],
    );

    const localVisible = discoverySettings.includeLocal !== false && discoverySettings.enabled.local !== false;

    useEffect(() => {
        if (organization.source !== 'all' && discoverySettings.enabled[organization.source] === false) {
            organization.patch({ source: 'all' });
        }
    }, [organization.source, discoverySettings.enabled]);

    useEffect(() => {
        if (platformOrderOpen) {
            setDraftOrder(effectivePlatformOrder);
            setDraggingId(null);
            setDragOffsetY(0);
        }
    }, [platformOrderOpen, effectivePlatformOrder]);

    const providerRank = useMemo(
        () => computeProviderRank(effectivePlatformOrder, effectivePlatformOrder),
        [effectivePlatformOrder],
    );

    const lastPlayedByProvider = useMemo(() => {
        const map = new Map<string, number>();
        for (const s of insights.sessions) {
            const prev = map.get(s.providerId) ?? 0;
            if (s.startedAt > prev) map.set(s.providerId, s.startedAt);
        }
        return map;
    }, [insights.sessions]);

    const keyOf = (item: ProviderCollection) =>
        collectionOrganizationKey(item.providerId, feed.accountKey(item.providerId), item.type, item.id);

    const all = feed.pages
        .filter(page => !isUnified || visibleProviderSet.has(page.providerId))
        .flatMap(page => page.items)
        .filter(collection => !isUnified || visibleProviderSet.has(collection.providerId))
        .map((collection, idx) => ({
            collection,
            key: keyOf(collection),
            idx,
        }));

    const groups = [...new Set(all.map(item => organization.collections[item.key]?.group).filter(Boolean))] as string[];
    const selected = all.filter(({ collection, key }) =>
        (!group || organization.collections[key]?.group === group)
        && `${collection.name} ${collection.description || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

    selected.sort((a, b) => {
        const x = organization.collections[a.key] || {};
        const y = organization.collections[b.key] || {};
        const pinned = Number(!!y.pinned) - Number(!!x.pinned);
        if (pinned) return pinned;
        switch (organization.sort) {
            case 'name':
                return a.collection.name.localeCompare(b.collection.name);
            case 'count':
                return (b.collection.trackCount || 0) - (a.collection.trackCount || 0) || a.idx - b.idx;
            case 'recent_collect':
            case 'updated':
                return (b.collection.updatedAt || 0) - (a.collection.updatedAt || 0) || a.idx - b.idx;
            case 'recent_play': {
                const pb = lastPlayedByProvider.get(b.collection.providerId) || b.collection.updatedAt || 0;
                const pa = lastPlayedByProvider.get(a.collection.providerId) || a.collection.updatedAt || 0;
                return pb - pa || a.idx - b.idx;
            }
            case 'manual':
                return (x.order ?? Number.MAX_SAFE_INTEGER) - (y.order ?? Number.MAX_SAFE_INTEGER) || a.idx - b.idx;
            case 'source':
            default: {
                const ra = providerRank.get(a.collection.providerId) ?? 999;
                const rb = providerRank.get(b.collection.providerId) ?? 999;
                return ra - rb || a.idx - b.idx;
            }
        }
    });

    const actions: PageActions = {
        sources: onSources,
        manage: () => setManageOpen(true),
        refresh: () => { feed.retry(); insights.retry(); },
        filter: event => { setQuery(event.text || ''); setOffset(0); },
        range: event => setOffset(Math.max(0, Math.floor((event.value || 0) / 100) * 100)),
        layout: () => organization.patch({ layout: organization.layout === 'list' ? 'grid' : 'list' }),
        'toggle-platform-group': () => organization.patch({ groupByPlatform: !organization.groupByPlatform }),
        'toggle-all-groups': () => organization.setAllGroupsCollapsed(visibleGroupIds, !allCollapsed),
        'platform-order': () => setPlatformOrderOpen(true),
        local: () => useMobileLibraryStore.getState().setLocalMusicOpen(true),
        'open-accounts': () => useSettingsModalStore.getState().openSettings('options', 'accounts'),
    };

    const visibleGroupIds = useMemo(() => {
        if (!showPlatformGrouping) return [];
        const ids: string[] = [];
        for (const pid of effectivePlatformOrder) {
            if (selected.some(e => e.collection.providerId === pid)) ids.push(pid);
        }
        if (sharedInsights.sections.some(s => s.id === 'smart-playlists')) ids.push('smart');
        return ids;
    }, [showPlatformGrouping, effectivePlatformOrder, selected, sharedInsights.sections]);

    const allCollapsed = visibleGroupIds.length > 0 && visibleGroupIds.every(id => isGroupCollapsed(id));

    const viewActionItems = [
        { id: 'layout', title: organization.layout === 'list' ? t('libraryV2.grid') : t('libraryV2.list'), image: 'layout-grid', action: 'layout' },
        ...(isUnified && organization.sort === 'source'
            ? [{ id: 'toggle-platform-group', title: organization.groupByPlatform ? '关闭平台分组' : '按平台分组显示', image: 'layers', action: 'toggle-platform-group' }]
            : []),
        ...(showPlatformGrouping && visibleGroupIds.length > 0
            ? [{ id: 'toggle-all-groups', title: allCollapsed ? '全部展开' : '全部收起', image: 'chevrons-up-down', action: 'toggle-all-groups' }]
            : []),
        ...(isUnified && effectivePlatformOrder.length > 1
            ? [{ id: 'platform-order', title: '平台顺序', image: 'arrow-up-down', action: 'platform-order' }]
            : []),
        { id: 'refresh', title: feed.syncing ? '同步中…' : t('libraryV2.refresh'), image: 'refresh-cw', action: 'refresh' },
    ];

    const sections: PageSection[] = [
        {
            id: 'library-sources',
            layout: 'chips',
            items: [{ providerId: 'all' }, ...effectivePlatformOrder.map(providerId => ({ providerId }))].map(provider => {
                const action = 'source:' + provider.providerId;
                actions[action] = () => { organization.patch({ source: provider.providerId }); setOffset(0); };
                return {
                    id: action,
                    title: provider.providerId === 'all' ? '综合' : omni.getProviderLabel(provider.providerId),
                    action,
                    selected: organization.source === provider.providerId,
                };
            }),
        },
        {
            id: 'library-categories',
            layout: 'chips',
            items: (['playlists', 'albums'] as const).map(value => {
                actions[value] = () => { setResource(value); setOffset(0); };
                return {
                    id: value,
                    title: value === 'playlists' ? t('libraryV2.playlists') : t('libraryV2.albums'),
                    action: value,
                    selected: resource === value,
                };
            }),
        },
        { id: 'filter', layout: 'input', value: query, placeholder: t('libraryV2.filter'), action: 'filter' },
        {
            id: 'sort',
            layout: 'chips',
            items: SORT_LABELS.map(item => {
                const action = 'sort:' + item.id;
                actions[action] = () => { organization.patch({ sort: item.id }); setOffset(0); };
                const active = organization.sort === item.id || (item.id === 'recent_collect' && organization.sort === 'updated');
                return { id: item.id, title: item.label, action, selected: active };
            }),
        },
        { id: 'library-view', layout: 'textActions', items: viewActionItems },
    ];

    if (groups.length) {
        sections.push({
            id: 'groups',
            layout: 'chips',
            items: ['', ...groups].map(value => {
                const action = 'group:' + value;
                actions[action] = () => { setGroup(value); setOffset(0); };
                return { id: action, title: value || t('libraryV2.groups'), action, selected: group === value };
            }),
        });
    }

    const toItem = ({ collection, key }: { collection: ProviderCollection; key: string }) => {
        const action = 'open:' + key;
        actions[action] = () => props.onOpenGridView({ ...collection, source: 'online', raw: collection });
        actions['menu:' + key] = () => setMenu({ collection, key });
        return {
            id: key,
            title: (organization.collections[key]?.pinned ? '↑ ' : '') + collection.name,
            subtitle: omni.getProviderLabel(collection.providerId)
                + (collection.trackCount == null ? '' : ' · ' + t('libraryV2.tracks', { count: collection.trackCount })),
            image: absolutePageImage(collection.coverUrl),
            action,
            secondary: 'menu:' + key,
            secondaryLabel: t('mobileLibrary.more'),
        };
    };

    if (showPlatformGrouping) {
        const byProvider = new Map<string, typeof selected>();
        for (const entry of selected) {
            const list = byProvider.get(entry.collection.providerId) ?? [];
            list.push(entry);
            byProvider.set(entry.collection.providerId, list);
        }
        for (const providerId of effectivePlatformOrder) {
            const entriesForProvider = byProvider.get(providerId);
            if (!entriesForProvider || !entriesForProvider.length) continue;
            const toggleAction = 'toggle-group:' + providerId;
            actions[toggleAction] = () => organization.toggleGroup(providerId);
            const unit = resource === 'playlists' ? '个歌单' : '张专辑';
            sections.push({
                id: 'directory-group:' + providerId,
                title: omni.getProviderLabel(providerId, false),
                layout: organization.layout === 'list' ? 'rows' : 'cards',
                more: toggleAction,
                moreLabel: `${entriesForProvider.length}${unit}`,
                text: isGroupCollapsed(providerId) ? 'collapsed' : '',
                key: `${feed.owner}:${providerId}:${query}:${group}:${organization.layout}`,
                items: entriesForProvider.slice(0, 100).map(toItem),
            });
        }
    } else {
        const items = selected.slice(offset, offset + 100).map(toItem);
        if (items.length || !isUnified) {
            sections.push({
                id: 'directory',
                layout: organization.layout === 'list' ? 'rows' : 'cards',
                key: `${feed.owner}:${query}:${group}:${organization.sort}:${organization.layout}`,
                items,
                total: selected.length,
                offset,
                request: 'range',
            });
        }
    }

    // 综合资料库：缓存优先，已有缓存时不插入阻塞性"正在同步"大段文字；隐藏未登录与已关闭平台及冗余加载提示。
    if (isUnified) {
        const visiblePages = feed.pages.filter(p => visibleProviderSet.has(p.providerId));
        const anyLoading = visiblePages.some(p => p.status === 'loading');
        if (anyLoading && !feed.hasCached && !selected.length) {
            sections.push({ id: 'unified-loading', layout: 'message', text: '正在初始化资料库…' });
        }
        const failed = visiblePages.filter(p => p.status === 'error');
        if (failed.length && !selected.length) {
            sections.push({
                id: 'unified-error',
                layout: 'message',
                text: '部分平台暂未同步成功',
                more: 'refresh',
                moreLabel: '重试',
            });
        }
        for (const page of visiblePages) {
            if (page.hasMore) {
                const label = omni.getProviderLabel(page.providerId);
                const action = 'more:' + page.providerId;
                actions[action] = () => { void feed.more(page.providerId); };
                sections.push({ id: action, layout: 'textActions', items: [{ id: action, title: '加载更多 · ' + label, action }] });
            }
        }
    } else {
        for (const page of feed.pages) {
            const label = omni.getProviderLabel(page.providerId);
            if (page.status === 'login') {
                sections.push({
                    id: 'state:' + page.providerId,
                    layout: 'message',
                    text: `${label}尚未登录，登录后可同步个人歌单与收藏。`,
                    more: 'open-accounts',
                    moreLabel: '前往账号管理',
                });
            } else if (page.status === 'loading' && !selected.length) {
                sections.push({ id: 'state:' + page.providerId, layout: 'message', text: `正在读取${label}资料库…` });
            } else if (page.status === 'empty' && !selected.length) {
                sections.push({ id: 'state:' + page.providerId, layout: 'message', text: `${label}暂无${resource === 'playlists' ? '歌单' : '收藏专辑'}` });
            } else if (page.status === 'error') {
                const action = 'retry:' + page.providerId;
                actions[action] = () => feed.retry();
                sections.push({ id: 'state:' + page.providerId, layout: 'message', text: `${label}加载失败`, more: action, moreLabel: '重试' });
            }
            if (page.hasMore) {
                const action = 'more:' + page.providerId;
                actions[action] = () => { void feed.more(page.providerId); };
                sections.push({ id: action, layout: 'textActions', items: [{ id: action, title: '加载更多 · ' + label, action }] });
            }
        }
    }

    if (query && privateSongs.matches.length) {
        actions['search-all'] = () => openSongs('search', t('libraryV2.privateSearch'), privateSongs.matches, t('libraryV2.loadedScope'));
        sections.push({
            id: 'private-songs',
            title: t('libraryV2.privateSongs'),
            layout: 'rows',
            key: query,
            more: 'search-all',
            moreLabel: t('libraryV2.allResults'),
            items: privateSongs.matches.slice(0, 30).map(song => {
                const action = 'private-song:' + getPlaybackSongKey(song);
                actions[action] = () => props.onPlaySong(song, privateSongs.matches);
                return {
                    id: action,
                    title: song.name,
                    subtitle: song.artists.map(artist => artist.name).join(' / '),
                    image: absolutePageImage(getSongCoverUrl(song)),
                    action,
                };
            }),
        });
    }

    if (query && !selected.length && !privateSongs.matches.length) {
        sections.push({ id: 'empty-query', layout: 'message', text: t('libraryV2.emptyQuery') });
    }

    actions.likes = () => openSongs('likes', t('libraryV2.likes'), privateSongs.liked, t('libraryV2.likesScope'));
    actions.recent = () => openSongs('recent', t('libraryV2.recent'), privateSongs.recent, t('libraryV2.recentScope'));
    sections.splice(3, 0, {
        id: 'personal-shortcuts',
        layout: 'quickLinks',
        items: [
            { id: 'likes', title: t('libraryV2.likes'), subtitle: t('libraryV2.tracks', { count: privateSongs.liked.length }), image: 'heart', action: 'likes' },
            { id: 'recent', title: t('libraryV2.recent'), subtitle: t('libraryV2.tracks', { count: privateSongs.recent.length }), image: 'clock', action: 'recent' },
            ...(localVisible
                ? [{ id: 'local', title: t('libraryV2.localMusic'), subtitle: t('libraryV2.tracks', { count: props.localSongs.length }), image: 'smartphone', action: 'local' }]
                : []),
        ],
    });

    sections.push(...sharedInsights.sections);
    Object.assign(actions, sharedInsights.actions);

    const rowActions = pageRowActions(actions, id => {
        const prefix = id.startsWith('open:') ? 'open:' : id.startsWith('menu:') ? 'menu:' : null;
        if (!prefix) return;
        const item = all.find(entry => entry.key === id.slice(prefix.length));
        if (!item) return;
        return () => prefix === 'open:'
            ? props.onOpenGridView({ ...item.collection, source: 'online', raw: item.collection })
            : setMenu(item);
    });

    // 关键修复：显示全屏 React 二级页（音乐足迹 / 本地目录管理）时必须将 active 置为 false，
    // 否则 useNativePage 会继续将 Compose 原生页保留在屏幕上遮挡 WebView 二级页面。
    useNativePage(
        root,
        'home',
        props.isInteractive && !footprint.opened && !localManageOpen,
        sources.online.accountView === 'resolving' || !orgHydrated ? null : {
            key: 'library:unified:' + feed.owner,
            title: t('libraryV2.library'),
            trailing: 'manage',
            trailingLabel: '资料库管理',
            trailingIcon: 'folder-cog',
            bottomClearance: 152,
            sections,
        },
        rowActions,
        onReady,
    );

    const current = menu && organization.collections[menu.key];

    const moveDraftPlatform = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= draftOrder.length) return;
        const next = [...draftOrder];
        const tmp = next[index];
        next[index] = next[target];
        next[target] = tmp;
        setDraftOrder(next);
    };

    const handleHandlePointerDown = (providerId: string, clientY: number) => {
        dragStartY.current = clientY;
        setDraggingId(providerId);
        setDragOffsetY(0);
        try { navigator.vibrate?.(10); } catch { /* Ignore unsupported vibration. */ }
    };

    const handleHandlePointerMove = (clientY: number) => {
        if (!draggingId) return;
        let delta = clientY - dragStartY.current;
        const rowStep = 64;
        if (Math.abs(delta) >= rowStep * 0.52) {
            const idx = draftOrder.indexOf(draggingId);
            const dir: -1 | 1 = delta > 0 ? 1 : -1;
            const target = idx + dir;
            if (idx >= 0 && target >= 0 && target < draftOrder.length) {
                moveDraftPlatform(idx, dir);
                dragStartY.current += dir * rowStep;
                delta = clientY - dragStartY.current;
                try { navigator.vibrate?.(6); } catch { /* Ignore unsupported vibration. */ }
            }
        }
        setDragOffsetY(Math.max(-44, Math.min(44, delta)));
        const box = dragListRef.current?.getBoundingClientRect();
        if (box) {
            if (clientY < box.top + 48) dragListRef.current?.scrollBy({ top: -12 });
            else if (clientY > box.bottom - 48) dragListRef.current?.scrollBy({ top: 12 });
        }
    };

    const handleHandlePointerUp = () => {
        setDraggingId(null);
        setDragOffsetY(0);
    };

    const manageRows: Array<{ id: string; title: string; subtitle: string; icon: React.ReactNode; onClick: () => void }> = [
        {
            id: 'create-smart',
            title: '创建智能歌单',
            subtitle: '通过模板或筛选条件自动整理歌单',
            icon: <ListPlus size={20} />,
            onClick: () => { setManageOpen(false); sharedInsights.openCreateSmart(); },
        },
        {
            id: 'manage-smart',
            title: '管理智能歌单',
            subtitle: '查看、编辑规则、更新或删除智能歌单',
            icon: <SlidersHorizontal size={20} />,
            onClick: () => { setManageOpen(false); sharedInsights.openManageSmart(); },
        },
        {
            id: 'footprint',
            title: '音乐足迹',
            subtitle: '查看真实有效收听时长、趋势与来源占比',
            icon: <TrendingUp size={20} />,
            onClick: () => { setManageOpen(false); sharedInsights.openFootprint(); },
        },
        {
            id: 'platform-order',
            title: '平台排序',
            subtitle: '长按拖拽调整综合资料库中各平台展示顺序',
            icon: <ArrowUpDown size={20} />,
            onClick: () => { setManageOpen(false); setPlatformOrderOpen(true); },
        },
        {
            id: 'refresh',
            title: '刷新资料库',
            subtitle: '重新同步已登录平台的歌单、专辑与本地统计',
            icon: <RefreshCw size={20} />,
            onClick: () => { setManageOpen(false); feed.retry(); insights.retry(); },
        },
        {
            id: 'layout',
            title: organization.layout === 'list' ? '切换为封面网格' : '切换为列表视图',
            subtitle: '调整歌单与专辑的卡片排列方式',
            icon: <LayoutGrid size={20} />,
            onClick: () => { setManageOpen(false); organization.patch({ layout: organization.layout === 'list' ? 'grid' : 'list' }); },
        },
        {
            id: 'local-manage',
            title: '本地音乐与目录管理',
            subtitle: `当前已索引 ${props.localSongs.length} 首 · 扫描目录与标签匹配`,
            icon: <Smartphone size={20} />,
            onClick: () => { setManageOpen(false); setLocalManageOpen(true); },
        },
        {
            id: 'reset-org',
            title: '清除本地置顶与分组',
            subtitle: '恢复歌单默认顺序（不改动云端歌单内容）',
            icon: <RotateCcw size={20} />,
            onClick: () => {
                setManageOpen(false);
                Object.keys(organization.collections).forEach(k => organization.organize(k, { pinned: false, group: '', order: undefined }));
                organization.patch({ sort: 'source' });
            },
        },
    ];

    return <>
        <OperationPanel
            id="library-organization"
            panel={menu ? {
                title: menu.collection.name,
                blocks: [
                    { id: 'pin', kind: 'toggle', label: t('libraryV2.pin'), value: !!current?.pinned },
                    { id: 'group', kind: 'input', label: t('libraryV2.group'), value: current?.group || '', placeholder: t('libraryV2.groupHint'), confirmLabel: t('libraryV2.saveGroup') },
                    { id: 'order', kind: 'actions', items: [{ id: 'first', label: t('libraryV2.first') }, { id: 'detail', label: t('libraryV2.manage') }] },
                ],
            } : null}
            onClose={() => setMenu(null)}
            onAction={(id, payload) => {
                if (!menu || keyOf(menu.collection) !== menu.key) { setMenu(null); return; }
                if (id === 'pin') organization.organize(menu.key, { pinned: payload?.text === '1' });
                if (id === 'group') organization.organize(menu.key, { group: payload?.text?.trim().slice(0, 60) || '' });
                if (id === 'first') {
                    organization.organize(menu.key, { order: Math.min(0, ...Object.values(organization.collections).map(value => value.order || 0)) - 1 });
                    organization.patch({ sort: 'manual' });
                }
                if (id === 'detail') props.onOpenGridView({ ...menu.collection, source: 'online', raw: menu.collection });
                if (id !== 'pin') setMenu(null);
            }}
        />

        {manageOpen && (
            <MobileSheet title="资料库管理" onClose={() => setManageOpen(false)}>
                <div className="flex flex-col gap-1 pb-6">
                    {manageRows.map(row => (
                        <button
                            key={row.id}
                            type="button"
                            onClick={row.onClick}
                            className="flex items-center text-left w-full rounded-2xl transition-colors"
                            style={{ minHeight: 64, padding: '10px 4px', gap: 12, color: tokens.text }}
                        >
                            <div
                                className="flex items-center justify-center rounded-xl shrink-0"
                                style={{
                                    width: 36,
                                    height: 36,
                                    background: tokens.accentSoft,
                                    color: tokens.accent,
                                }}
                            >
                                {row.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: '20px' }}>{row.title}</div>
                                <div className="truncate" style={{ fontSize: 12, color: tokens.muted, marginTop: 2 }}>{row.subtitle}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </MobileSheet>
        )}

        {localManageOpen && (
            <MobileSheet
                title="本地音乐与目录管理"
                subtitle={`当前已索引 ${props.localSongs.length} 首本地歌曲（移除目录不会删除手机音频文件）`}
                onClose={() => setLocalManageOpen(false)}
            >
                <div className="pb-6">
                    <MobileLocalTools homeResources={props.homeResources} />
                </div>
            </MobileSheet>
        )}

        {platformOrderOpen && (
            <MobileSheet
                title="平台排序"
                subtitle="长按右侧手柄，拖动调整平台显示顺序。"
                footer={
                    <div className="flex gap-2.5">
                        <button
                            type="button"
                            onClick={() => setDraftOrder(availableProviderIds.filter(id => discoverySettings.enabled[id] !== false))}
                            className="flex-1 flex items-center justify-center select-none"
                            style={{
                                height: 48,
                                borderRadius: 14,
                                fontSize: 14,
                                fontWeight: 600,
                                background: tokens.secondaryBtnBg,
                                color: tokens.secondaryBtnText,
                            }}
                        >
                            恢复默认顺序
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                // 将可见平台的新顺序合并回推荐设置的完整 sourceOrder（保留已隐藏平台与 local 的原有相对槽位）
                                const prevFull = discoverySettings.sourceOrder.length > 0
                                    ? discoverySettings.sourceOrder
                                    : [...availableProviderIds, 'local'];
                                const visibleQueue = [...draftOrder];
                                const visibleSet = new Set(draftOrder);
                                const mergedSourceOrder: string[] = [];
                                for (const id of prevFull) {
                                    if (visibleSet.has(id)) {
                                        const nextVis = visibleQueue.shift();
                                        if (nextVis) mergedSourceOrder.push(nextVis);
                                    } else {
                                        mergedSourceOrder.push(id);
                                    }
                                }
                                for (const rem of visibleQueue) mergedSourceOrder.push(rem);
                                discoverySettings.patch({ sourceOrder: mergedSourceOrder });
                                organization.patch({ platformOrder: mergedSourceOrder.filter(id => id !== 'local') });
                                setPlatformOrderOpen(false);
                            }}
                            className="flex-1 flex items-center justify-center select-none"
                            style={{
                                height: 48,
                                borderRadius: 14,
                                fontSize: 14,
                                fontWeight: 600,
                                background: tokens.primaryBtnBg,
                                color: tokens.primaryBtnText,
                            }}
                        >
                            完成
                        </button>
                    </div>
                }
                onClose={() => setPlatformOrderOpen(false)}
            >
                <div
                    ref={dragListRef}
                    className="flex flex-col pb-4 select-none"
                    style={{ gap: 8, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
                    onContextMenu={e => e.preventDefault()}
                    onPointerMove={e => handleHandlePointerMove(e.clientY)}
                    onPointerUp={handleHandlePointerUp}
                    onPointerCancel={handleHandlePointerUp}
                >
                    {draftOrder.map((providerId, idx) => {
                        const isDragging = draggingId === providerId;
                        return (
                            <div
                                key={providerId}
                                className="flex items-center justify-between select-none"
                                style={{
                                    minHeight: 56,
                                    borderRadius: 12,
                                    padding: '0 8px 0 12px',
                                    background: isDragging ? tokens.accentSoft : tokens.cardBg,
                                    border: `1px solid ${isDragging ? tokens.accent : tokens.border}`,
                                    transform: isDragging ? `translateY(${dragOffsetY}px) scale(1.02)` : 'translateY(0px) scale(1)',
                                    transition: isDragging ? 'box-shadow 120ms ease' : 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                                    zIndex: isDragging ? 10 : 1,
                                    position: 'relative',
                                    boxShadow: isDragging ? '0 10px 24px rgba(0,0,0,0.16)' : 'none',
                                    color: tokens.text,
                                    userSelect: 'none',
                                    WebkitUserSelect: 'none',
                                }}
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span
                                        className="w-6 text-center font-semibold shrink-0"
                                        style={{ fontSize: 13, color: tokens.muted }}
                                    >
                                        {idx + 1}
                                    </span>
                                    <span className="truncate font-medium" style={{ fontSize: 15 }}>
                                        {omni.getProviderLabel(providerId, false)}
                                    </span>
                                </div>
                                <div className="flex items-center">
                                    <button
                                        type="button"
                                        aria-label={`上移 ${omni.getProviderLabel(providerId, false)}`}
                                        disabled={idx === 0}
                                        onClick={() => moveDraftPlatform(idx, -1)}
                                        className="flex items-center justify-center disabled:opacity-30"
                                        style={{ minWidth: 36, minHeight: 48 }}
                                    >
                                        <ChevronUp size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`下移 ${omni.getProviderLabel(providerId, false)}`}
                                        disabled={idx === draftOrder.length - 1}
                                        onClick={() => moveDraftPlatform(idx, 1)}
                                        className="flex items-center justify-center disabled:opacity-30"
                                        style={{ minWidth: 36, minHeight: 48 }}
                                    >
                                        <ChevronDown size={18} />
                                    </button>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`拖动排序 ${omni.getProviderLabel(providerId, false)}`}
                                        onPointerDown={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            e.currentTarget.setPointerCapture?.(e.pointerId);
                                            handleHandlePointerDown(providerId, e.clientY);
                                        }}
                                        className="flex items-center justify-center touch-none cursor-grab select-none"
                                        style={{ width: 48, height: 48, color: isDragging ? tokens.accent : tokens.muted }}
                                    >
                                        <GripVertical size={20} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </MobileSheet>
        )}

        {sharedInsights.panels}
    </>;
}
