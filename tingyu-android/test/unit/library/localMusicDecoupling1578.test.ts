// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativePageModel, PageActions } from '@/types/nativePages';
import type { LocalSong } from '@/types';

let capturedModel: NativePageModel | null = null;
let capturedActions: PageActions = {};
let capturedPageId = '';
let capturedActive = false;

vi.mock('@/hooks/useNativePage', () => ({
    useNativePage: (_root: unknown, id: string, active: boolean, model: NativePageModel | null, actions: PageActions) => {
        capturedPageId = id;
        capturedActive = active;
        capturedModel = model;
        capturedActions = actions;
        return true;
    },
    useNativePagesAvailable: () => true,
}));

vi.mock('@/services/nativePages', () => ({
    NATIVE_FIRST: true,
    absolutePageImage: (value?: string) => value ?? '',
}));

vi.mock('react-i18next', async original => ({
    ...(await original<typeof import('react-i18next')>()),
    useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/services/localPlaylistService', () => ({
    getFavoriteLocalPlaylist: async () => ({ id: 'fav', name: '我喜欢的本地音乐', songIds: ['song-1'], isFavorite: true }),
    setLocalSongIdFavorite: async () => undefined,
}));

import NativeLocalMusicSubpage from '@/library/suites/mobile/native/NativeLocalMusicSubpage';
import { useMobileLibraryStore } from '@/stores/useMobileLibraryStore';
import { useHomeSourceStore, reconcileSourceOnStartup } from '@/stores/useHomeSourceStore';
import {
    useDiscoverySettingsStore,
    defaultDiscoverySettings,
    computeVisibleDiscoverySources,
    resolveEffectiveDiscoverySource,
} from '@/stores/useDiscoverySettingsStore';
import { useLibraryOrganization } from '@/library/core/state/useLibraryOrganization';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { nativeShellRoute } from '@/utils/nativeShellState';
import { discoverySettingsModel, discoverySettingsPatch } from '@/components/modal/settings/discoverySettingsModel';
import { runTopModalBack } from '@/services/modalBackStack';

function makeLocalSong(id: string, title: string, artist: string, album: string, folderPath: string): LocalSong {
    return {
        id,
        title,
        titleOrigin: 'tag',
        fileName: `${title}.flac`,
        filePath: `/${folderPath}/${title}.flac`,
        folderName: folderPath,
        fileSize: 28_000_000,
        mimeType: 'audio/flac',
        relativePath: `${folderPath}/${title}.flac`,
        addedAt: 1_700_000_000_000,
        fileLastModified: 1_700_000_000_000,
        duration: 245_000,
        audioSpec: { codec: 'FLAC', lossless: true, sampleRateHz: 44100, bitDepth: 16 },
        importedMetadata: {
            title,
            artistNames: [artist],
            albumName: album,
        },
    } as unknown as LocalSong;
}

describe('1.5.78 本地音乐模式解耦、独立二级页面与推荐整合测试', () => {
    beforeEach(() => {
        (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        localStorage.clear();
        capturedModel = null;
        capturedActions = {};
        capturedPageId = '';
        capturedActive = false;

        useHomeSourceStore.setState({ source: 'online' });
        useMobileLibraryStore.setState({ page: 'library', localMusicOpen: false });
        useDiscoverySettingsStore.setState({ ...defaultDiscoverySettings });
        useLibraryOrganization.setState({
            source: 'qq',
            sort: 'source',
            groupByPlatform: true,
            collapsedGroups: { kugou: true },
            platformOrder: ['qq', 'netease'],
        });
        useSearchNavigationStore.setState({
            isSearchOpen: false,
            searchSourceTab: 'aggregate',
            homeViewTab: 'playlist',
        });
    });

    it('打开与返回独立本地音乐二级页时，绝不污染推荐页、资料库、搜索页及播放队列状态', async () => {
        const sampleSongs = [
            makeLocalSong('song-1', '茶花开了', '王睿卓', '茶花', 'Music/Favorites'),
            makeLocalSong('song-2', '发如雪', '周杰伦', '十一月的萧邦', 'Music/Jay'),
        ];
        const playbackBefore = {
            currentSong: usePlaybackStore.getState().currentSong,
            playQueue: usePlaybackStore.getState().playQueue,
        };

        // Open standalone local music subpage
        useMobileLibraryStore.getState().setLocalMusicOpen(true);

        const shellWhileOpen = nativeShellRoute({
            settingsOpen: false,
            settingsIndex: false,
            searchOpen: false,
            collectionOpen: useMobileLibraryStore.getState().localMusicOpen,
            view: 'home',
            libraryPage: useMobileLibraryStore.getState().page,
        });
        expect(shellWhileOpen).toEqual({ route: 'collection', selectedTab: 1 });

        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);

        const stableActionSnapshot = { importing: false, scanning: false, deviceScanAvailable: true };
        const mockProps = {
            isInteractive: true,
            localSongs: sampleSongs,
            localPlaylists: [{ id: 'pl-1', name: '深夜本地精选', songIds: ['song-1', 'song-2'], createdAt: 1, updatedAt: 1 }],
            localLibraryCatalog: { ready: true, entities: [], assignments: [], reload: async () => {} },
            localMusicState: { activeRow: 0 },
            setLocalMusicState: vi.fn(),
            onPlaySong: vi.fn(),
            onTogglePlayback: vi.fn(),
            onOpenGridView: vi.fn(),
            homeResources: {
                actions: {
                    subscribe: () => () => {},
                    getSnapshot: () => stableActionSnapshot,
                    openLocalGroup: vi.fn(),
                },
            },
        } as never;

        try {
            await act(async () => {
                root.render(createElement(NativeLocalMusicSubpage, {
                    props: mockProps,
                    open: true,
                    onClose: () => useMobileLibraryStore.getState().setLocalMusicOpen(false),
                }));
            });

            expect(capturedPageId).toBe('collection');
            expect(capturedActive).toBe(true);
            expect(capturedModel?.key).toBe('collection:local-music');
            expect(capturedModel?.title).toBe('本地音乐');

            const categories = capturedModel?.sections.find(s => s.id === 'categories');
            expect(categories?.items?.map(i => i.title)).toEqual(['歌曲', '文件夹', '专辑', '歌手', '歌单']);

            const overview = capturedModel?.sections.find(s => s.id === 'overview');
            expect(overview?.total).toBe(2);

            const songsSection = capturedModel?.sections.find(s => s.id === 'local-songs');
            expect(songsSection?.total).toBe(2);

            // Switch to folders -> drill into subfolder -> back steps up folder first, then exits subpage
            await act(async () => {
                capturedActions['tab:folders']?.({});
            });
            expect(capturedModel?.sections.some(s => s.id === 'folder-groups')).toBe(true);

            await act(async () => {
                capturedActions['open-folder:Music']?.({});
            });
            expect(capturedModel?.sections.find(s => s.id === 'subheader')?.description).toBe('Music');

            // Back inside subfolder steps up to root folder first
            let consumedFolderStep = false;
            await act(async () => {
                consumedFolderStep = runTopModalBack();
            });
            expect(consumedFolderStep).toBe(true);
            expect(useMobileLibraryStore.getState().localMusicOpen).toBe(true);

            // Back at root exits standalone local music page back to Library
            await act(async () => {
                const consumedExit = runTopModalBack();
                expect(consumedExit).toBe(true);
            });
            expect(useMobileLibraryStore.getState().localMusicOpen).toBe(false);

            // Verify zero cross-page state pollution
            expect(useHomeSourceStore.getState().source).toBe('online');
            expect(useDiscoverySettingsStore.getState().source).toBe('all');
            expect(useLibraryOrganization.getState().source).toBe('qq');
            expect(useLibraryOrganization.getState().collapsedGroups).toEqual({ kugou: true });
            expect(useLibraryOrganization.getState().platformOrder).toEqual(['qq', 'netease']);
            expect(useSearchNavigationStore.getState().searchSourceTab).toBe('aggregate');
            expect(usePlaybackStore.getState().currentSong).toBe(playbackBefore.currentSong);
            expect(usePlaybackStore.getState().playQueue).toBe(playbackBefore.playQueue);
        } finally {
            await act(async () => root.unmount());
            host.remove();
        }
    });

    it('冷启动检测到历史残留 home_source_mode=local 时，自动恢复为新版在线多平台架构', () => {
        localStorage.setItem('home_source_mode', 'local');
        useHomeSourceStore.setState({ source: 'local' });
        useSearchNavigationStore.setState({ homeViewTab: 'local', searchSourceTab: 'local' });

        reconcileSourceOnStartup();

        expect(useHomeSourceStore.getState().source).toBe('online');
        expect(localStorage.getItem('home_source_mode')).toBe('online');
        expect(useSearchNavigationStore.getState().homeViewTab).toBe('playlist');
    });

    it('推荐页支持独立「本地音乐」来源排序、显示/隐藏，且不影响资料库与搜索状态', () => {
        const sources = [
            { providerId: 'netease', displayName: '网易云音乐', loggedIn: true },
            { providerId: 'qq', displayName: 'QQ音乐', loggedIn: true },
            { providerId: 'local', displayName: '本地音乐', statusText: '本机曲库' },
        ];

        useDiscoverySettingsStore.getState().patch({
            source: 'local',
            sourceOrder: ['local', 'qq', 'netease'],
        });

        const state1 = useDiscoverySettingsStore.getState();
        expect(resolveEffectiveDiscoverySource(state1)).toBe('local');
        expect(computeVisibleDiscoverySources(sources, state1).map(s => s.providerId))
            .toEqual(['local', 'qq', 'netease']);

        const flow = discoverySettingsModel(state1, sources);
        const sourceNode = flow.nodes.find(n => n.id === 'sourceOrder');
        const payload = JSON.parse(sourceNode!.value!) as Array<{ id: string; label: string; status: string }>;
        expect(payload[0]).toMatchObject({ id: 'local', label: '本地音乐', status: '本机曲库' });

        // Library & Search remain completely unaffected
        expect(useLibraryOrganization.getState().source).toBe('qq');
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('aggregate');

        // Hiding 'local' in discovery settings falls back discovery source to 'all'
        const hidePatch = discoverySettingsPatch(state1, 'sourceOrder', { text: 'toggle:local' }, ['netease', 'qq', 'local']);
        expect(hidePatch).toEqual({ enabled: { local: false }, source: 'all' });
    });
});
