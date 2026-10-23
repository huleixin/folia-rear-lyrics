import React from 'react';
import type { ProbeDefinition } from './definition';
import SearchWorkspace from '../../src/components/app/search/SearchWorkspace';
import { useSearchNavigationStore } from '../../src/stores/useSearchNavigationStore';
import { useSearchExploreStore } from '../../src/stores/useSearchExploreStore';
import type { SongResult, UnifiedSong } from '../../src/types';
import type { GridViewCollectionDescriptor } from '../../src/library/core/contracts/collection';
import { omni } from '../../src/services/onlineMusic/omni';

// dev/probes/searchWorkspace.probe.tsx
// 综合搜索结果页的组件探针：固定结果，验证分类、最佳匹配与集合跳转，不访问网络。

const song = (id: string, name: string, album: string): UnifiedSong => ({
    id, name, artists: [{ id: 1, name: '许嵩' }], album: { id: 1, name: album, coverUrl: '' },
    durationMs: 240000, sourceRef: { kind: 'online', providerId: 'qq', mediaId: id },
} as UnifiedSong);

useSearchNavigationStore.setState({
    isSearchOpen: true,
    isSearching: false,
    searchError: null,
    searchQuery: '许嵩',
    searchSourceTab: 'qq',
    searchResults: [song('a', '天龙八部之宿敌', '天龙八部之宿敌'), song('b', '幻听', '梦游计'), song('c', '如果当时', '自定义')],
    hasMore: true,
    scrollTop: 0,
    offset: 3,
});
useSearchExploreStore.setState({
    query: '许嵩', source: 'qq', generation: 1,
    artists: { items: [{ providerId: 'qq', id: '000CK5xN3yZDJt', name: '许嵩', description: '歌曲:430  专辑:59  视频:1481', songCount: 430, albumCount: 59, coverUrl: 'http://y.gtimg.cn/music/photo_new/T001R150x150M000000CK5xN3yZDJt_3.jpg' }], status: 'ready', hasMore: false, offset: 1, error: null },
    albums: { items: [{ providerId: 'qq', id: '001Oqn952HAPRk', name: '安泊猜想', artistName: '许嵩', releaseDate: '2026-06-16' }], status: 'ready', hasMore: false, offset: 1, error: null },
    playlists: { items: [{ providerId: 'qq', id: '7039481526', name: '最动听的许嵩', creatorName: '牧兮君', trackCount: 89 }], status: 'ready', hasMore: false, offset: 1, error: null },
});

const opened: GridViewCollectionDescriptor[] = [];
declare global {
    interface Window {
        __searchProbeOpens: GridViewCollectionDescriptor[];
        __suggestCalls: string[];
        __stubOmniSuggest: () => void;
        __seedSearchLayout: () => void;
        __searchProbeActions: string[];
    }
}
if (typeof window !== 'undefined') {
    (window as unknown as { __searchProbeOpens: GridViewCollectionDescriptor[] }).__searchProbeOpens = opened;
    (window as unknown as { __searchProbeSeeded: boolean }).__searchProbeSeeded = true;
    // 测试用替身：只替换联想方法，其余 provider 行为保持不变。
    window.__suggestCalls = [];
    window.__searchProbeActions = [];
    window.__seedSearchLayout = () => {
        // 长列表夹具专门覆盖 Android 安全区、键盘收缩和分页末尾可达性。
        useSearchNavigationStore.setState({
            searchResults: Array.from({ length: 20 }, (_, i) => song(`layout-${i}`, `布局测试歌曲 ${i + 1}`, '测试专辑')),
            hasMore: true, scrollTop: 0,
        });
        omni.suggestProvider = async () => ({ items: Array.from({ length: 12 }, (_, i) => ({ kind: 'keyword' as const, text: `许嵩 联想 ${i + 1}` })) });
        omni.getSearchDiscovery = async () => ({ suggestions: [], hot: Array.from({ length: 30 }, (_, i) => `热门词 ${i + 1}`) });
    };
    window.__stubOmniSuggest = () => {
        window.__suggestCalls = [];
        (omni as unknown as { suggestProvider: unknown }).suggestProvider = async (_provider: string, query: string) => {
            window.__suggestCalls.push(query);
            await new Promise(resolve => setTimeout(resolve, 120));
            return { items: [{ kind: 'keyword', text: `${query} 测试` }] };
        };
    };
}

function Probe() {
    return <SearchWorkspace
        theme={{ backgroundColor: '#07100d', primaryColor: '#eef5ef', secondaryColor: '#9fe0c4', accentColor: '#9fe0c4' } as never}
        isDaylight={false}
        onClose={() => {}}
        onSubmitSearch={(source) => {
            // 真 App 的提交处理器会写回音源；探针照同一语义更新，才能验证分类随能力变化。
            if (source) useSearchNavigationStore.setState({ searchSourceTab: source });
        }}
        onLoadMore={() => {
            window.__searchProbeActions.push('loadMore');
            useSearchNavigationStore.setState(state => ({
                searchResults: [...(state.searchResults ?? []), song('next-page', '分页新增歌曲', '测试专辑')],
                hasMore: false,
            }));
        }}
        onPlayTrack={track => { window.__searchProbeActions.push(`play:${track.id}`); }}
        onAddTrackToQueue={track => { window.__searchProbeActions.push(`queue:${track.id}`); }}
        onOpenArtist={() => {}}
        onOpenAlbum={() => {}}
        onOpenSearchCollection={(collection) => { opened.push(collection); }}
        localPlaylists={[]}
    />;
}

export default {
    id: 'searchWorkspace',
    title: 'Tingyu unified search results',
    description: 'Tabs, best match, per-category rows and collection opening with fixed fixtures.',
    Component: Probe,
} satisfies ProbeDefinition;
