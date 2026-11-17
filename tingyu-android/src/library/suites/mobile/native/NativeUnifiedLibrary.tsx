import React, { useMemo, useState } from 'react';
import { useNativePage } from '../../../../hooks/useNativePage';
import { useUnifiedLibrary } from '../../../core/bindings/useUnifiedLibrary';
import { useLibraryOrganization, collectionOrganizationKey } from '../../../core/state/useLibraryOrganization';
import { omni } from '../../../../services/onlineMusic/omni';
import { absolutePageImage } from '../../../../services/nativePages';
import { useHomeSourceStore } from '../../../../stores/useHomeSourceStore';
import type { NativeHomeProps } from './NativeHomeOverview';
import type { PageActions, PageSection } from '../../../../types/nativePages';
import type { ProviderCollection } from '../../../../types/onlineMusic';
import OperationPanel from '../../../../components/shared/OperationPanel';
import { pageRowActions } from '../../../../utils/nativePageActions';
import { getSongCoverUrl } from '../../../../services/onlineMusic/songMetadata';
import { privateLibrarySongs } from '../../../core/model/privateLibrarySongs';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import type { SongResult } from '../../../../types';

import { useLibraryInsights } from './useLibraryInsights';

// src/library/suites/mobile/native/NativeUnifiedLibrary.tsx
export default function NativeUnifiedLibrary({ root, props, sources, onSources, onReady }: NativeHomeProps) {
    const organization = useLibraryOrganization();
    const [resource, setResource] = useState<'playlists' | 'albums'>('playlists');
    const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [group, setGroup] = useState('');
    const [menu, setMenu] = useState<{ collection: ProviderCollection; key: string } | null>(null);
    const feed = useUnifiedLibrary(props.isInteractive, organization.source, resource);
    const sharedInsights = useLibraryInsights(props, organization.source, feed.owner);
    const { data: insights, footprint } = sharedInsights;
    const privateSongs = useMemo(() => privateLibrarySongs(insights.candidates, insights.sessions, query), [insights.candidates, insights.sessions, query]);
    const openSongs = (id: string, name: string, songs: SongResult[], description: string) => props.onOpenGridView({
        source: 'online', providerId: 'discovery', type: 'discovery', id: 'library:' + id, name, description,
        trackCount: songs.length, coverUrl: songs[0] ? getSongCoverUrl(songs[0]) : undefined, discoveryTracks: songs });
    const keyOf = (item: ProviderCollection) => collectionOrganizationKey(item.providerId, feed.accountKey(item.providerId), item.type, item.id);
    const all = feed.pages.flatMap(page => page.items).map(collection => ({ collection, key: keyOf(collection) }));
    const groups = [...new Set(all.map(item => organization.collections[item.key]?.group).filter(Boolean))] as string[];
    const selected = all.filter(({ collection, key }) => (!group || organization.collections[key]?.group === group)
        && `${collection.name} ${collection.description || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    selected.sort((a,b) => {
        const x = organization.collections[a.key] || {}, y = organization.collections[b.key] || {};
        const pinned = Number(!!y.pinned) - Number(!!x.pinned);
        if (pinned) return pinned;
        switch (organization.sort) {
            case 'name': return a.collection.name.localeCompare(b.collection.name);
            case 'count': return (b.collection.trackCount || 0) - (a.collection.trackCount || 0);
            case 'updated': return (b.collection.updatedAt || 0) - (a.collection.updatedAt || 0);
            case 'manual': return (x.order ?? Number.MAX_SAFE_INTEGER) - (y.order ?? Number.MAX_SAFE_INTEGER);
            default: return 0;
        }
    });
    const actions: PageActions = { sources: onSources, refresh: () => { feed.retry(); insights.retry(); },
        filter: event => { setQuery(event.text || ''); setOffset(0); }, range: event => setOffset(Math.max(0, Math.floor((event.value || 0) / 100) * 100)),
        layout: () => organization.patch({ layout: organization.layout === 'list' ? 'grid' : 'list' }),
        local: () => useHomeSourceStore.getState().setSource('local') };
    const sections: PageSection[] = [{ id: 'library-sources', layout: 'chips', items: [{ providerId: 'all' }, ...feed.providers].map(provider => {
        const action = 'source:' + provider.providerId;
        actions[action] = () => { organization.patch({ source: provider.providerId }); setOffset(0); };
        return { id: action, title: provider.providerId === 'all' ? '综合资料库' : omni.getProviderLabel(provider.providerId), action, selected: organization.source === provider.providerId };
    }).concat([{ id: 'local', title: '本地', action: 'local', selected: false }]) },
    { id: 'library-categories', layout: 'chips', items: (['playlists', 'albums'] as const).map(value => {
        actions[value] = () => { setResource(value); setOffset(0); };
        return { id: value, title: value === 'playlists' ? '歌单' : '收藏专辑', action: value, selected: resource === value };
    }) }, { id: 'filter', layout: 'input', value: query, placeholder: '搜索我的资料库', action: 'filter' },
    { id: 'sort', title: resource === 'playlists' ? '我的歌单' : '收藏专辑', layout: 'chips', items: (['source','name','count','updated','manual'] as const).map(sort => {
        actions['sort:' + sort] = () => { organization.patch({ sort }); setOffset(0); };
        return { id: sort, title: { source: '平台顺序', name: '名称', count: '歌曲数量', updated: '最近更新', manual: '手动排序' }[sort], action: 'sort:' + sort, selected: organization.sort === sort };
    }) }, { id: 'library-view', layout: 'textActions', items: [
        { id: 'layout', title: organization.layout === 'list' ? '封面网格' : '紧凑列表', image: 'layout-grid', action: 'layout' },
        { id: 'refresh', title: '刷新', image: 'refresh-cw', action: 'refresh' }] }];
    if (groups.length) sections.push({ id: 'groups', layout: 'chips', items: ['', ...groups].map(value => {
        const action = 'group:' + value; actions[action] = () => { setGroup(value); setOffset(0); };
        return { id: action, title: value || '全部分组', action, selected: group === value };
    }) });
    const items = selected.slice(offset, offset + 100).map(({ collection, key }) => {
        const action = 'open:' + key; actions[action] = () => props.onOpenGridView({ ...collection, source: 'online', raw: collection });
        actions['menu:' + key] = () => setMenu({ collection, key });
        return { id: key, title: (organization.collections[key]?.pinned ? '↑ ' : '') + collection.name,
            subtitle: omni.getProviderLabel(collection.providerId) + (collection.trackCount == null ? '' : ` · ${collection.trackCount} 首`),
            image: absolutePageImage(collection.coverUrl), action, secondary: 'menu:' + key, secondaryLabel: '⋮' };
    });
    sections.push({ id: 'directory', layout: organization.layout === 'list' ? 'rows' : 'cards', key: feed.owner + query + group + organization.sort, items, total: selected.length, offset, request: 'range' });
    for (const page of feed.pages) {
        const label = omni.getProviderLabel(page.providerId);
        if (!['ready', 'unsupported'].includes(page.status)) {
            const text = { loading: '正在读取…', login: '登录后显示私人收藏', empty: '暂无收藏', error: '加载失败，其他来源仍可使用' }[page.status as 'loading' | 'login' | 'empty' | 'error'];
            const action = 'retry:' + page.providerId; actions[action] = () => page.status === 'login' ? void props.account.startLogin(page.providerId) : feed.retry();
            sections.push({ id: 'state:' + page.providerId, layout: 'message', text: label + '：' + text, more: ['error','login'].includes(page.status) ? action : undefined, moreLabel: page.status === 'login' ? '登录' : '重试' });
        }
        if (page.hasMore) { const action = 'more:' + page.providerId; actions[action] = () => { void feed.more(page.providerId); };
            sections.push({ id: action, layout: 'textActions', items: [{ id: action, title: '加载更多 · ' + label, action }] }); }
    }
    if (query && privateSongs.matches.length) {
        actions['search-all'] = () => openSongs('search', '资料库搜索', privateSongs.matches, '仅匹配已加载的私人资料');
        sections.push({ id: 'private-songs', title: '资料库中的歌曲', layout: 'rows', key: query, more: 'search-all', moreLabel: '全部结果', items: privateSongs.matches.slice(0, 30).map(song => {
            const action = 'private-song:' + getPlaybackSongKey(song); actions[action] = () => props.onPlaySong(song, privateSongs.matches);
            return { id: action, title: song.name, subtitle: song.artists.map(artist => artist.name).join(' / '), image: absolutePageImage(getSongCoverUrl(song)), action };
        }) });
    }
    if (query && !selected.length && !privateSongs.matches.length) sections.push({ id: 'empty-query', layout: 'message', text: '已加载的私人资料中没有匹配结果，可加载更多后继续查找。' });
    actions.likes = () => openSongs('likes', '我喜欢的音乐', privateSongs.liked, '当前来源与账户已加载的收藏');
    actions.recent = () => openSongs('recent', '最近播放', privateSongs.recent, '当前来源与账户的有效收听记录');
    sections.splice(3, 0, { id: 'personal-shortcuts', layout: 'quickLinks', items: [
        { id: 'likes', title: '我喜欢的音乐', subtitle: privateSongs.liked.length + ' 首', image: 'heart', action: 'likes' },
        { id: 'recent', title: '最近播放', subtitle: privateSongs.recent.length + ' 首', image: 'history', action: 'recent' },
        { id: 'local', title: '本地音乐', subtitle: props.localSongs.length + ' 首', image: 'smartphone', action: 'local' },
    ] });
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
    useNativePage(root, 'home', props.isInteractive, sources.online.accountView === 'resolving' ? null : footprint.opened ? footprint.model
        : { key: 'library:unified:' + feed.owner, title: '资料库', trailing: 'sources', trailingLabel: '音乐来源', bottomClearance: 152, sections },
        footprint.opened ? footprint.actions : rowActions, onReady);
    // Organization is local only; remote edits remain on the existing permission-aware detail page.
    const current = menu && organization.collections[menu.key];
    return <>
    <OperationPanel id="library-organization" panel={menu ? { title: menu.collection.name, blocks: [
        { id: 'pin', kind: 'toggle', label: '置顶', value: !!current?.pinned },
        { id: 'group', kind: 'input', label: '本地分组', value: current?.group || '', placeholder: '输入分组名称，留空移出分组', confirmLabel: '保存分组' },
        { id: 'order', kind: 'actions', items: [{ id: 'first', label: '移到最前' }, { id: 'detail', label: '打开歌单与管理' }] }
    ] } : null} onClose={() => setMenu(null)} onAction={(id, payload) => {
        if (!menu || keyOf(menu.collection) !== menu.key) { setMenu(null); return; }
        if (id === 'pin') organization.organize(menu.key, { pinned: payload?.text === '1' });
        if (id === 'group') organization.organize(menu.key, { group: payload?.text?.trim().slice(0, 60) || '' });
        if (id === 'first') { organization.organize(menu.key, { order: Math.min(0, ...Object.values(organization.collections).map(value => value.order || 0)) - 1 }); organization.patch({ sort: 'manual' }); }
        if (id === 'detail') props.onOpenGridView({ ...menu.collection, source: 'online', raw: menu.collection });
        if (id !== 'pin') setMenu(null);
    }}/>
    {sharedInsights.panels}
    </>;
}
