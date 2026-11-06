// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativePageModel } from '../../../src/types/nativePages';
import type { LibraryHomeSurfaceProps } from '../../../src/library/core/contracts/suite';
import type { LocalSong } from '../../../src/types';

// test/unit/library/nativeLocalHomeOverview.test.ts
// 复现「选本地音乐后原生页接管失败」：把本地推荐首页真实渲染一遍。
// useNativePage 被替换为捕获器 —— 组件若在渲染期抛错，这里直接得到原始异常；
// 若渲染成功，还能核对发给 Compose 的模型（布局、字段、图片路径）是否符合原生解析约定。

const captured: { model: NativePageModel | null; actions: Record<string, unknown>; } = { model: null, actions: {} };

// 启动专项（录屏 68710）：曲库水合信号由测试控制，模拟「重建后 Dexie 读取完成前」与
// 「完成后」两个阶段，验证空曲库页面包只在水合后才发布。
const hydration = vi.hoisted(() => ({ settled: false }));
vi.mock('../../../src/services/localLibraryHydration', () => ({
    useLocalLibraryHydrated: () => hydration.settled,
    markLocalLibraryHydrated: () => { hydration.settled = true; },
    isLocalLibraryHydrated: () => hydration.settled,
}));

vi.mock('react-i18next', async importOriginal => ({
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: (key: string, args?: { count?: number }) => args?.count === undefined ? key : `${key}:${args.count}` }),
}));
vi.mock('../../../src/hooks/useLibraryTrackPlayback', () => ({
    useLibraryTrackPlayback: () => vi.fn(),
}));
vi.mock('../../../src/hooks/useNativePage', () => ({
    useNativePage: (_root: unknown, _id: string, _active: boolean, model: NativePageModel | null, actions: Record<string, unknown>) => {
        captured.model = model;
        captured.actions = actions;
    },
}));
vi.mock('../../../src/services/nativePages', () => ({
    absolutePageImage: (url?: string) => url ?? '',
    NATIVE_FIRST: false,
}));
// localMusicService 体量大（Dexie/在线 provider），这里只需要事件名常量。
vi.mock('../../../src/services/localMusicService', () => ({
    LOCAL_MUSIC_UPDATED_EVENT: 'folia-local-music-updated',
}));
vi.mock('../../../src/services/localPlayHistory', () => ({
    LOCAL_PLAY_HISTORY_UPDATED_EVENT: 'folia-local-play-history-updated',
    localDailySeed: () => '2026-11-6',
    pickDailyLocalSongs: (songs: LocalSong[]) => songs.slice(0, 30),
    pickLeastRecentlyPlayed: () => [],
    pickRandomLocalSongs: (songs: LocalSong[]) => songs.slice(0, 20),
    resolveLocalPlayHistory: async () => [],
    aggregateLocalAlbumPlays: () => [],
}));
vi.mock('../../../src/library/core/bindings/useLibraryHomeLocal', () => ({
    useLibraryHomeLocal: () => ({
        sections: [
            { key: 'songs', row: 0, label: 'songs', emptyMessage: '', groups: [], cards: [] },
            { key: 'playlists', row: 4, label: 'playlists', emptyMessage: '', groups: [], cards: [] },
            { key: 'albums', row: 2, label: 'albums', emptyMessage: '', groups: [], cards: [] },
            { key: 'artists', row: 3, label: 'artists', emptyMessage: '', groups: [], cards: [] },
        ],
        activeSection: { key: 'songs', row: 0, label: 'songs', emptyMessage: '', groups: [], cards: [] },
        batchSelectionType: null,
    }),
}));
vi.mock('../../../src/library/core/bindings/useLibraryHomeActions', () => {
    // getSnapshot 必须返回缓存的同一对象（useSyncExternalStore 的约定，真控制器也是这么做的）。
    const stable = {
        snapshot: { deviceScanAvailable: true, scanningDevice: false, importingFolder: false },
        importBusy: false,
        scanPercent: 0,
    };
    return { useLibraryHomeActions: () => stable };
});

import NativeLocalHomeOverview from '../../../src/library/suites/mobile/native/NativeLocalHomeOverview';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const song = (id: string, albumName: string): LocalSong => ({
    id,
    fileName: `${id}.mp3`,
    filePath: `Music/${id}.mp3`,
    duration: 200_000,
    fileSize: 1,
    mimeType: 'audio/mpeg',
    addedAt: 1000,
    title: `歌曲${id}`,
    titleOrigin: 'import',
    importedMetadata: { title: `歌曲${id}`, titleSource: 'filename', artistNames: ['歌手'], albumName },
    hasManualLyricSelection: false,
    noAutoMatch: false,
});

const makeProps = (localSongs: LocalSong[]): LibraryHomeSurfaceProps => ({
    isInteractive: true,
    localSongs,
    localPlaylists: [],
    localLibraryCatalog: { ready: false, entities: [], assignments: [] },
    localMusicState: { activeRow: 0, selectedGroup: null, detailStack: [], detailOriginView: null, focusedFolderIndex: 0, focusedAlbumIndex: 0, focusedArtistIndex: 0, focusedPlaylistIndex: 0 },
    setLocalMusicState: vi.fn(),
    onPlaySong: vi.fn(),
    onTogglePlayback: vi.fn(),
    onOpenGridView: vi.fn(),
    homeResources: {
        actions: {
            subscribe: () => () => {},
            getSnapshot: () => ({ deviceScanAvailable: true, scanningDevice: false, importingFolder: false, importingPlaylist: false, refreshingFolders: false, scan: null }),
            openLocalGroup: vi.fn(),
            scanDeviceMusic: vi.fn(),
            importFolder: vi.fn(),
            refreshFolders: vi.fn(),
        },
    },
    account: {},
} as unknown as LibraryHomeSurfaceProps);

const makeSources = () => ({
    tab: 'playlist' as const, setTab: vi.fn(), isOnlineTab: true, personalFmModeLabel: '',
    online: { providerId: 'netease', providerLabel: '网易云', user: null, accountView: 'guest' as const, needsRelogin: false, collections: [], canUsePlaylists: true, canUseAlbums: false, canUseRadio: false, hasPersonalFmModes: false },
    tabs: [],
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    captured.model = null;
    captured.actions = {};
    hydration.settled = false;
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
});

describe('NativeLocalHomeOverview 渲染与模型', () => {
    it('有曲库时渲染成功且模型里没有原生不认识的布局', () => {
        const songs = [
            song('s1', '专辑A'),
            song('s2', '专辑A'),
            song('s3', '专辑B'),
        ];
        act(() => {
            root.render(h(NativeLocalHomeOverview, {
                root: { current: host },
                props: makeProps(songs),
                sources: makeSources(),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        const model = captured.model;
        expect(model).not.toBeNull();
        const layouts = new Set(model!.sections.map(section => section.layout));
        for (const layout of layouts) {
            expect(['rows', 'cards', 'hero', 'chips', 'input', 'message', 'quickLinks', 'discoverCards']).toContain(layout);
        }
        // 三张推荐卡都在，图片走 /assets 静态路径（非 blob，不依赖网络）。
        const hero = model!.sections.find(section => section.layout === 'hero');
        // 无播放历史时「常听精选」如实收缩；本地 30 首与最近添加不依赖历史，必须都在。
        expect(hero?.items?.map(item => item.id)).toEqual(['local-daily-30', 'local-recent-added']);
        // 原生路由契约：home 路由（非资料库页签）的页面 key 必须以 home: 开头，
        // 否则 NativePageRetention 按 route-target-mismatch 拒收 → 「首页没有完成加载」。
        expect(model!.key.startsWith('home:')).toBe(true);
        hero?.items?.forEach(item => expect(item.image).toMatch(/^\/assets\/mobile-home\//));
        // 快捷入口四个都在，图标用 lucide 几何名（Kotlin PageIcon 按 name 查 raw json）。
        const quick = model!.sections.find(section => section.layout === 'quickLinks');
        expect(quick?.items?.map(item => item.image)).toEqual(['heart', 'music2', 'disc-2', 'user-round']);
        // 每个可见 item 的 action 都注册了处理器（原生事件回来必须能找到）。
        model!.sections.forEach(section => {
            section.items?.forEach(item => {
                if (item.action) expect(captured.actions[item.action], `missing action ${item.action}`).toBeTypeOf('function');
                if (item.secondary) expect(captured.actions[item.secondary], `missing secondary ${item.secondary}`).toBeTypeOf('function');
            });
            if (section.more) expect(captured.actions[section.more], `missing more ${section.more}`).toBeTypeOf('function');
        });
        // 顶部音源胶囊：本地模式带设备图标。
        expect(model!.trailingIcon).toBe('smartphone');
        expect(model!.trailingLabel).toBe('mobileLibrary.localMusicSource');
    });

    it('空曲库时给出可点的扫描/导入入口，不产生假推荐', () => {
        // 空态页只在曲库水合完成后发布（未水合时由启动专项用例覆盖 hold 行为）。
        hydration.settled = true;
        act(() => {
            root.render(h(NativeLocalHomeOverview, {
                root: { current: host },
                props: makeProps([]),
                sources: makeSources(),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        const model = captured.model!;
        expect(model.sections.find(section => section.layout === 'hero')).toBeUndefined();
        const actions = model.sections.find(section => section.id === 'local-empty-actions');
        expect(actions?.items?.map(item => item.action)).toEqual(['local:scan', 'local:import']);
        expect(captured.actions['local:scan']).toBeTypeOf('function');
        expect(captured.actions['local:import']).toBeTypeOf('function');
    });

    it('启动专项：曲库未水合时暂不发布空态包，让原生继续显示缓存页；水合完成后恢复发布', () => {
        // 重建后 Dexie 读取未完成：localSongs=[] 不是真值，不发包顶掉原生缓存首页。
        act(() => {
            root.render(h(NativeLocalHomeOverview, {
                root: { current: host },
                props: makeProps([]),
                sources: makeSources(),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        expect(captured.model).toBeNull();
        // 水合完成（成功或失败都算 settle）：真正空曲库的用户照样拿到空态页。
        hydration.settled = true;
        act(() => {
            root.render(h(NativeLocalHomeOverview, {
                root: { current: host },
                props: makeProps([]),
                sources: makeSources(),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        expect(captured.model).not.toBeNull();
        expect(captured.model!.sections.find(section => section.id === 'local-empty-actions')).toBeDefined();
        // 曲库有数据时无论水合状态都直接发布（暖恢复/常规路径零影响）。
        hydration.settled = false;
        act(() => {
            root.render(h(NativeLocalHomeOverview, {
                root: { current: host },
                props: makeProps([song('s1', '专辑A')]),
                sources: makeSources(),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        expect(captured.model).not.toBeNull();
        expect(captured.model!.key.startsWith('home:')).toBe(true);
    });
});
