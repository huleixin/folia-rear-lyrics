// @vitest-environment jsdom
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
    const entries = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: {
            getItem: (key: string) => (entries.has(key) ? entries.get(key)! : null),
            setItem: (key: string, value: string) => { entries.set(key, String(value)); },
            removeItem: (key: string) => { entries.delete(key); },
            clear: () => { entries.clear(); },
            key: (index: number) => Array.from(entries.keys())[index] ?? null,
            get length() { return entries.size; },
        },
    });
    return {
        entries,
        providerSearchCalls: [] as Array<{ providerId: string; query: string }>,
        activeProviders: ['qq', 'netease', 'qishui', 'kugou', 'bodian'],
    };
});

let latestNativeSearchProps: any = null;

vi.mock('@/components/app/search/useNativeSearchPage', () => ({
    useNativeSearchPage: (props: any) => {
        latestNativeSearchProps = props;
        return true;
    },
}));
vi.mock('@/services/nativePages', () => ({ NATIVE_FIRST: true, absolutePageImage: (v: string) => v }));
vi.mock('@/components/app/search/useSearchSuggestions', () => ({
    useSearchSuggestions: () => ({ items: [], status: 'idle' }),
}));
vi.mock('react-i18next', async original => ({
    ...(await original<typeof import('react-i18next')>()),
    useTranslation: () => ({ t: (key: string, opts?: any) => opts?.defaultValue ?? key }),
}));
vi.mock('framer-motion', async original => ({
    ...(await original<typeof import('framer-motion')>()),
    AnimatePresence: ({ children }: { children: unknown }) => children,
    motion: { section: ({ initial: _i, animate: _a, exit: _e, transition: _t, ...props }: any) => createElement('section', props) },
}));
vi.mock('@/services/onlineMusic/omni', () => ({
    omni: {
        subscribeProviders: () => () => {},
        getProviderRegistryVersion: () => storage.activeProviders.length,
        getProviderSummaries: () => storage.activeProviders.map(providerId => ({
            providerId,
            availability: { configured: true },
        })),
        getProviderLabel: (source: string) => {
            const labels: Record<string, string> = {
                qq: 'QQ音乐',
                netease: '网易云音乐',
                qishui: '汽水音乐',
                kugou: '酷狗音乐',
                bodian: '波点音乐',
            };
            return labels[source] ?? source;
        },
        getSearchCapabilities: () => ({ song: true, artist: true, album: true, playlist: true, suggest: true }),
        supportsSearchDiscovery: () => true,
        getSearchDiscovery: async (providerId: string) => ({
            suggestions: ['推荐词'],
            hot: ['多远都要在一起', '晴天'],
            providerId,
        }),
        searchProviderSongs: async (providerId: string, query: string) => {
            storage.providerSearchCalls.push({ providerId, query });
            return {
                items: [{
                    id: `${providerId}-1`,
                    name: `${query}-${providerId}`,
                    artists: [{ id: 'a1', name: 'G.E.M.邓紫棋' }],
                    album: { id: 'al1', name: '新的心跳' },
                    durationMs: 210000,
                    sourceRef: { kind: 'online', providerId, mediaId: `${providerId}-1` },
                }],
                hasMore: false,
                nextOffset: 1,
            };
        },
        searchProviderArtists: async () => ({ items: [], hasMore: false, nextOffset: 0 }),
        searchProviderAlbums: async () => ({ items: [], hasMore: false, nextOffset: 0 }),
        searchProviderPlaylists: async () => ({ items: [], hasMore: false, nextOffset: 0 }),
    },
}));

import SearchWorkspace from '@/components/app/search/SearchWorkspace';
import {
    LAST_SEARCH_SOURCE_KEY,
    getInitialSearchSourceTab,
    resolveCommandPaletteSearchSource,
    useSearchNavigationStore,
    type SearchSource,
} from '@/stores/useSearchNavigationStore';
import {
    reconcileSourceOnStartup,
    resolveHomeSearchSource,
    selectHomeSearchSource,
} from '@/stores/useHomeSourceStore';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useAppNavigation } from '@/hooks/useAppNavigation';

describe('Search source independent persistence & actual request routing', () => {
    beforeEach(() => {
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
        vi.stubGlobal('cancelAnimationFrame', clearTimeout);
        vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
        vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));

        storage.entries.clear();
        storage.providerSearchCalls.length = 0;
        storage.activeProviders = ['qq', 'netease', 'qishui', 'kugou', 'bodian'];

        // 模拟当前首页/资料库活跃平台为 QQ 音乐（复现原问题触发条件）
        useOnlineProviderAccountStore.setState({ activeProviderId: 'qq' });
        const initial = getInitialSearchSourceTab();
        useSearchNavigationStore.setState({
            homeViewTab: 'playlist',
            preferredSearchSource: initial,
            searchSourceTab: initial,
            searchQuery: '',
            searchResults: null,
            isSearchOpen: false,
            searchCache: {},
            sourcePages: {},
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.replaceChildren();
    });

    const localSongFixture = [{
        id: 'local-1',
        fileName: 'gem.flac',
        filePath: '/music/gem.flac',
        duration: 200000,
        fileSize: 1024,
        mimeType: 'audio/flac',
        addedAt: 1,
        title: '多远都要在一起',
        titleOrigin: 'import' as const,
        importedMetadata: { title: '多远都要在一起', titleSource: 'filename' as const, artistNames: ['邓紫棋'], albumName: '新的心跳' },
    }];

    const execDeps = {
        localSongs: localSongFixture,
        localLibraryCatalog: { entities: [], assignments: [] },
        t: (_k: string, fb?: string) => fb ?? '',
    };

    it('1) fresh install with no history defaults to aggregate search (never QQ Music) and queries all enabled sources', async () => {
        expect(localStorage.getItem(LAST_SEARCH_SOURCE_KEY)).toBeNull();
        expect(getInitialSearchSourceTab()).toBe('aggregate');
        expect(resolveHomeSearchSource()).toBe('aggregate');

        // 模拟点击底部导航「搜索」进入搜索页
        const openedTab = resolveHomeSearchSource();
        useSearchNavigationStore.getState().restoreSearch({ query: '', sourceTab: openedTab });
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('aggregate');

        await useSearchNavigationStore.getState().submitSearch({
            query: '多远都要在一起',
            sourceTab: useSearchNavigationStore.getState().searchSourceTab,
            deps: execDeps,
        });
        expect(storage.providerSearchCalls.map(c => c.providerId).sort()).toEqual(
            ['bodian', 'kugou', 'netease', 'qishui', 'qq'],
        );
    });

    it('2) retains aggregate, qq, netease, qishui, kugou, bodian, and local across page switches and library platform switches, sending real requests to the exact chosen source', async () => {
        const allSources: SearchSource[] = ['aggregate', 'qq', 'netease', 'qishui', 'kugou', 'bodian', 'local'];

        for (const chosen of allSources) {
            storage.providerSearchCalls.length = 0;

            // 用户主动在搜索框右侧下拉菜单选择来源
            useSearchNavigationStore.getState().selectSearchSource(chosen);
            expect(localStorage.getItem(LAST_SEARCH_SOURCE_KEY)).toBe(chosen);

            // 模拟切回推荐页/资料库，并在资料库切换到 QQ 音乐、触发账户清理与冷启动自愈
            useSearchNavigationStore.getState().hideSearchOverlay();
            useOnlineProviderAccountStore.setState({ activeProviderId: 'qq' });
            selectHomeSearchSource('qq');
            useSearchNavigationStore.getState().resetRuntime('qq');
            useSearchNavigationStore.getState().followOnlineProvider('qq');
            reconcileSourceOnStartup();

            // 再次点击底部导航进入搜索页（走真实 resolveHomeSearchSource 入口）
            const reenteredSource = resolveHomeSearchSource();
            useSearchNavigationStore.getState().restoreSearch({ query: '', sourceTab: reenteredSource });
            expect(useSearchNavigationStore.getState().searchSourceTab).toBe(chosen);

            // 执行真实搜索请求并校验实际调用的平台
            await useSearchNavigationStore.getState().submitSearch({
                query: '雨爱',
                sourceTab: useSearchNavigationStore.getState().searchSourceTab,
                deps: execDeps,
            });

            if (chosen === 'aggregate') {
                expect(storage.providerSearchCalls.map(c => c.providerId).sort()).toEqual(
                    ['bodian', 'kugou', 'netease', 'qishui', 'qq'],
                );
            } else if (chosen === 'local') {
                expect(storage.providerSearchCalls).toEqual([]);
            } else {
                expect(storage.providerSearchCalls).toEqual([{ providerId: chosen, query: '雨爱' }]);
            }
        }
    });

    it('3) retains qishui when opening player and returning via history back, and ignores currently playing QQ Music song', async () => {
        let nav!: ReturnType<typeof useAppNavigation>;
        function NavHarness() {
            nav = useAppNavigation();
            return null;
        }
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);

        try {
            await act(async () => {
                root.render(React.createElement(NavHarness));
            });

            // 正在播放一首 QQ 音乐歌曲
            const qqPlayingSong = {
                id: 'qq-song-99',
                name: '丑八怪',
                artists: [{ id: '1', name: '薛之谦' }],
                album: { id: '1', name: '意外' },
                durationMs: 240000,
                sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'qq-song-99' },
            } as any;
            usePlaybackStore.setState({ currentSong: qqPlayingSong, playQueue: [qqPlayingSong] });

            // 进入搜索页（初始为综合搜索），随后用户在搜索页下拉菜单主动选择「汽水音乐」
            act(() => {
                nav.navigateToSearch({ query: '', sourceTab: resolveHomeSearchSource() });
            });
            expect(useSearchNavigationStore.getState().searchSourceTab).toBe('aggregate');

            act(() => {
                useSearchNavigationStore.getState().selectSearchSource('qishui');
            });
            expect(useSearchNavigationStore.getState().searchSourceTab).toBe('qishui');
            expect(window.history.state.search.sourceTab).toBe('qishui');

            // 打开播放器再返回搜索页
            act(() => {
                nav.navigateToPlayer();
            });
            // 模拟从播放器返回（恢复带 search 快照的历史记录）
            act(() => {
                useSearchNavigationStore.getState().restoreSearch(window.history.state.search);
            });

            expect(useSearchNavigationStore.getState().searchSourceTab).toBe('qishui');
            expect(resolveCommandPaletteSearchSource(qqPlayingSong, useSearchNavigationStore.getState().searchSourceTab, 'qq')).toBe('qishui');

            // 验证发起搜索时实际请求的是汽水音乐而非正在播放的 QQ 音乐
            storage.providerSearchCalls.length = 0;
            await useSearchNavigationStore.getState().submitSearch({
                query: '绅士',
                sourceTab: useSearchNavigationStore.getState().searchSourceTab,
                deps: execDeps,
            });
            expect(storage.providerSearchCalls).toEqual([{ providerId: 'qishui', query: '绅士' }]);
        } finally {
            await act(async () => root.unmount());
            host.remove();
        }
    });

    it('4) preserves chosen source across process kill restart, overwrite upgrade, hot search, history search, and clearing query', async () => {
        // 模拟升级前用户已保存「综合搜索」或「网易云音乐」
        localStorage.setItem(LAST_SEARCH_SOURCE_KEY, 'netease');

        // 模拟杀死进程或覆盖安装升级后重新冷启动初始化
        const coldRestored = getInitialSearchSourceTab();
        expect(coldRestored).toBe('netease');
        useSearchNavigationStore.setState({
            preferredSearchSource: coldRestored,
            searchSourceTab: coldRestored,
            isSearchOpen: true,
        });
        reconcileSourceOnStartup();

        const submittedSources: Array<SearchSource | undefined> = [];
        const root = createRoot(document.createElement('div'));
        try {
            await act(async () => {
                root.render(createElement(SearchWorkspace, {
                    theme: {} as never,
                    isDaylight: false,
                    onClose: vi.fn(),
                    onSubmitSearch: (src?: SearchSource) => {
                        submittedSources.push(src);
                        void useSearchNavigationStore.getState().submitSearch({
                            query: useSearchNavigationStore.getState().searchQuery,
                            sourceTab: src ?? useSearchNavigationStore.getState().searchSourceTab,
                            deps: execDeps,
                        });
                    },
                    onLoadMore: vi.fn(),
                    onPlayTrack: vi.fn(),
                    onAddTrackToQueue: vi.fn(),
                    onOpenArtist: vi.fn(),
                    onOpenAlbum: vi.fn(),
                    onOpenSearchCollection: vi.fn(),
                    localSongs: localSongFixture,
                    localPlaylists: [],
                    localLibraryCatalog: { entities: [], assignments: [], ready: true, reload: async () => {} },
                }));
            });

            expect(latestNativeSearchProps.source).toBe('netease');
            expect(latestNativeSearchProps.sourceLabel(latestNativeSearchProps.source)).toBe('网易云音乐');

            // 点击热门搜索词（或历史搜索词）：不得被热门搜索数据源重置，实际搜索请求仍走 netease
            storage.providerSearchCalls.length = 0;
            await act(async () => {
                latestNativeSearchProps.submit('多远都要在一起');
            });
            expect(submittedSources).toEqual(['netease']);
            expect(storage.providerSearchCalls).toEqual([{ providerId: 'netease', query: '多远都要在一起' }]);
            expect(latestNativeSearchProps.source).toBe('netease');

            // 清空输入框回到搜索默认页：来源仍然保持 netease
            await act(async () => {
                latestNativeSearchProps.change('', false);
            });
            expect(latestNativeSearchProps.source).toBe('netease');
            expect(localStorage.getItem(LAST_SEARCH_SOURCE_KEY)).toBe('netease');
        } finally {
            await act(async () => root.unmount());
        }
    });

    it('5) separates temporary fallback from persisted user preference when a custom source is deactivated and later re-enabled', async () => {
        storage.activeProviders = ['qq', 'netease', 'lx-custom'];
        useSearchNavigationStore.getState().selectSearchSource('lx-custom');
        expect(localStorage.getItem(LAST_SEARCH_SOURCE_KEY)).toBe('lx-custom');

        // 模拟扩展源 lx-custom 被临时停用
        storage.activeProviders = ['qq', 'netease'];
        expect(resolveHomeSearchSource()).toBe('aggregate');
        // 关键要求：用户持久化的真实偏好绝不被篡改！
        expect(localStorage.getItem(LAST_SEARCH_SOURCE_KEY)).toBe('lx-custom');
        expect(useSearchNavigationStore.getState().preferredSearchSource).toBe('lx-custom');

        // 当 lx-custom 恢复启用后，自动恢复为用户原本保存的 lx-custom
        storage.activeProviders = ['qq', 'netease', 'lx-custom'];
        expect(resolveHomeSearchSource()).toBe('lx-custom');
    });
});
