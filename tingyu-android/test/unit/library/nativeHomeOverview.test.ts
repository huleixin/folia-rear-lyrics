// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NativePageModel } from '../../../src/types/nativePages';
import type { LibraryHomeSurfaceProps } from '../../../src/library/core/contracts/suite';
import type { LibraryHomeSources } from '../../../src/library/core/bindings/useLibraryHomeSources';
import type { SongResult } from '../../../src/types';

// test/unit/library/nativeHomeOverview.test.ts
// 在线首页「解析期闪烁」回归（录屏 68804，1.467s 单帧）：账号身份还在 resolving 时，
// NativeHomeOverview 曾把「hero 暂不可用 + 空歌单 + 空态文案」的过渡模型作为可呈现
// 页面发给原生 —— 36ms 后解析完成，真实模型整包顶掉它，中间那一帧就是用户看到的
// 底部闪烁。修复后 resolving 阶段必须走 useNativePage 的既定 hold 语义（model=null，
// 不发包、原生继续呈递缓存页）；guest/accountless 的空态是真实状态，照常发布。
// 本地首页（NativeLocalHomeOverview.libraryHydrated）早就是这个门控，本文件同时
// 锁住「resolving→authenticated 重渲染」的冷启动时序。

const captured: { model: NativePageModel | null; actions: Record<string, unknown>; } = { model: null, actions: {} };

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
vi.mock('../../../src/library/core/bindings/useLibraryHomeOnline', () => ({
    // 私人雷达（id 约定 personal_fm）+ 每日推荐：hero 前两张卡就绪 → CTA 可用。
    useLibraryHomeOnline: () => ({ items: [
        { id: 'personal_fm', name: '私人雷达', type: 'personal_fm' },
        { id: 'daily', name: '每日三十首', type: 'daily_recommendations' },
    ] }),
}));
const chart = vi.hoisted(() => ({ supported: true, status: 'loading' as string, collection: undefined as unknown, retry: vi.fn() }));
vi.mock('../../../src/hooks/useNewReleaseChart', () => ({
    useNewReleaseChart: () => chart,
}));
vi.mock('../../../src/stores/useMobileLibraryStore', () => {
    const state = { recentTracks: [] as SongResult[], requestCollectionPlay: vi.fn(), setPage: vi.fn() };
    const use = (selector: (s: typeof state) => unknown) => selector(state);
    return { useMobileLibraryStore: Object.assign(use, { getState: () => state }) };
});
vi.mock('../../../src/services/onlineMusic/songMetadata', () => ({
    getSongArtistLabel: () => '梁汉文',
    getSongCoverUrl: () => '/cover.jpg',
}));
vi.mock('../../../src/services/onlineMusic/songAvailability', () => ({
    isSongUnavailable: () => false,
}));

vi.mock('../../../src/library/core/bindings/useCollectionResource', () => ({ useWarmCachedOnlineCollections: vi.fn() }));
import { useWarmCachedOnlineCollections } from '../../../src/library/core/bindings/useCollectionResource';
import NativeHomeOverview from '../../../src/library/suites/mobile/native/NativeHomeOverview';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const recent = { id: 's1', name: '七友' } as unknown as SongResult;
const collections = [{ id: 'pl1', name: '我喜欢的音乐', coverUrl: '/pl1.jpg', trackCount: 9, type: 'playlist' }];

const makeSources = (accountView: 'resolving' | 'guest' | 'authenticated', withUser = false): LibraryHomeSources => ({
    tab: 'radio', setTab: vi.fn(), isOnlineTab: true, personalFmModeLabel: '',
    online: {
        providerId: 'qq', providerLabel: 'QQ 音乐',
        user: withUser ? { id: '2473297053' } : null,
        accountView, needsRelogin: false,
        collections: accountView === 'authenticated' ? collections : [],
        canUsePlaylists: true, canUseAlbums: false, canUseRadio: false, hasPersonalFmModes: false,
    },
    tabs: [],
} as unknown as LibraryHomeSources);

const makeProps = (): LibraryHomeSurfaceProps => ({
    isInteractive: true,
    onPlaySong: vi.fn(),
    onTogglePlayback: vi.fn(),
    onOpenGridView: vi.fn(),
    homeResources: { actions: { openOnlineCard: vi.fn() } },
    account: {},
} as unknown as LibraryHomeSurfaceProps);

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    captured.model = null;
    captured.actions = {};
    chart.status = 'loading'; chart.collection = undefined;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe('NativeHomeOverview 解析期 hold（录屏 68804 回归）', () => {
    it('publishes all loaded playlist summaries while warming only the original four', async () => {
        const sources=makeSources('authenticated',true);
        sources.online.collections=Array.from({length:25},(_,i)=>({id:`pl${i}`,name:`歌单${i}`,coverUrl:'/cover.jpg',trackCount:i,type:'playlist'})) as typeof sources.online.collections;
        const props=makeProps();
        const open=props.homeResources.actions.openOnlineCard as ReturnType<typeof vi.fn>;
        open.mockResolvedValue({ok:true});
        act(()=>root.render(h(NativeHomeOverview,{root:{current:host},props,sources,onReady:vi.fn(),onSources:vi.fn()})));
        const rows=captured.model!.sections.find(section=>section.id==='playlists')!.items!;
        expect(rows).toHaveLength(25);
        const warm=vi.mocked(useWarmCachedOnlineCollections).mock.calls.at(-1)!;
        expect(warm[0]).toHaveLength(4);
        await act(async()=>{await (captured.actions[rows[24].action!] as () => Promise<void>)();});
        expect(open).toHaveBeenCalledWith(expect.objectContaining({id:'pl24'}),'qq',expect.any(Function));
    });

    it.each(['guess-you-like', 'daily-30', 'new-releases'])('%s opens the collection without autoplay', async (kind) => {
        chart.status = 'ready'; chart.collection = { id: 'new', type: 'playlist', name: 'New' };
        const props = makeProps();
        const open = props.homeResources.actions.openOnlineCard as ReturnType<typeof vi.fn>;
        open.mockImplementation(async (_card, _provider, ready) => {
            ready({ id: 'daily', type: 'playlist', name: '每日三十首', songs: [] });
            return { ok: true };
        });
        act(() => root.render(h(NativeHomeOverview, {
            root: { current: host }, props, sources: makeSources('authenticated', true),
            onReady: vi.fn(), onSources: vi.fn(),
        })));
        const { useMobileLibraryStore } = await import('../../../src/stores/useMobileLibraryStore');
        const request = useMobileLibraryStore.getState().requestCollectionPlay as ReturnType<typeof vi.fn>;
        request.mockClear();
        await act(async () => { (captured.actions['hero:' + kind] as () => void)(); });
        expect(props.onOpenGridView).toHaveBeenCalledTimes(1);
        expect(request).not.toHaveBeenCalled();
        expect(props.onPlaySong).not.toHaveBeenCalled();
    });
    it('resolving 阶段不发包：原生继续呈递缓存页，绝不让过渡模型上屏', () => {
        act(() => {
            root.render(h(NativeHomeOverview, {
                root: { current: host },
                props: makeProps(),
                sources: makeSources('resolving'),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        expect(captured.model).toBeNull();
    });

    it('解析完成后真实模型发布：key 带上 user id，hero 可用、歌单卡片在', () => {
        act(() => {
            root.render(h(NativeHomeOverview, {
                root: { current: host },
                props: makeProps(),
                sources: makeSources('authenticated', true),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        const model = captured.model;
        expect(model).not.toBeNull();
        expect(model!.key).toBe('home:qq:2473297053:false');
        const hero = model!.sections.find(section => section.id === 'hero');
        // 前两张推荐卡就绪 → CTA 是「立即播放」，不是「暂不可用」。
        expect(hero?.items?.[0]?.disabled).toBeFalsy();
        expect(hero?.items?.[1]?.disabled).toBeFalsy();
        const playlists = model!.sections.find(section => section.id === 'playlists');
        expect(playlists?.items?.map(item => item.id)).toEqual(['playlist:0:pl1']);
        // 解析完成的页面不允许再携带空态文案区块（那正是闪烁帧露出的内容）。
        expect(model!.sections.some(section => section.id === 'playlist-empty')).toBe(false);
    });

    it('guest 的空态是真实状态：照常发布，附空态文案', () => {
        act(() => {
            root.render(h(NativeHomeOverview, {
                root: { current: host },
                props: makeProps(),
                sources: makeSources('guest'),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        const model = captured.model;
        expect(model).not.toBeNull();
        expect(model!.key).toBe('home:qq::false');
        expect(model!.sections.some(section => section.id === 'playlist-empty')).toBe(true);
    });

    it('冷启动时序：同一挂载内 resolving→authenticated，模型从 hold 到发布', () => {
        act(() => {
            root.render(h(NativeHomeOverview, {
                root: { current: host },
                props: makeProps(),
                sources: makeSources('resolving'),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        expect(captured.model).toBeNull();
        act(() => {
            root.render(h(NativeHomeOverview, {
                root: { current: host },
                props: makeProps(),
                sources: makeSources('authenticated', true),
                onReady: vi.fn(),
                onSources: vi.fn(),
            }));
        });
        expect(captured.model?.key).toBe('home:qq:2473297053:false');
    });
});
