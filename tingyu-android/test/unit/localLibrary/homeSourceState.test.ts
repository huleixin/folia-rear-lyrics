// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

// test/unit/localLibrary/homeSourceState.test.ts
// 1.5.78 本地音乐模式解耦：旧版全局 home_source_mode='local' 已彻底解耦并自愈为 'online'，
// 不再把推荐页、资料库与搜索页联动切回旧版本地模式。

const HOME_SOURCE_KEY = 'home_source_mode';
const LAST_TAB_KEY = 'last_home_view_tab';

describe('全局音乐来源解耦与历史状态自愈', () => {
    beforeEach(async () => {
        localStorage.clear();
        const { useHomeSourceStore } = await import('../../../src/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('../../../src/stores/useSearchNavigationStore');
        useSearchNavigationStore.setState({ homeViewTab: 'playlist' });
        useHomeSourceStore.getState().setSource('online');
    });

    it('调用 setSource("local") 时自动保持全局来源为 online，不劫持资料库与搜索页签', async () => {
        const { useHomeSourceStore } = await import('../../../src/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('../../../src/stores/useSearchNavigationStore');
        useSearchNavigationStore.getState().setHomeViewTab('albums');
        useHomeSourceStore.getState().setSource('local');
        expect(useHomeSourceStore.getState().source).toBe('online');
        expect(useSearchNavigationStore.getState().homeViewTab).toBe('albums');
        expect(localStorage.getItem(HOME_SOURCE_KEY)).toBe('online');
    });

    it('旧版本残留：home_source_mode=local 或 homeViewTab=local 时，冷启动自动自愈回 online 且保留独立搜索来源', async () => {
        localStorage.setItem(HOME_SOURCE_KEY, 'local');
        localStorage.setItem(LAST_TAB_KEY, 'local');
        const { useHomeSourceStore, reconcileSourceOnStartup } = await import('../../../src/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('../../../src/stores/useSearchNavigationStore');
        const { useOnlineProviderAccountStore } = await import('../../../src/stores/useOnlineProviderAccountStore');
        useOnlineProviderAccountStore.getState().setActiveProviderId('qq');
        useHomeSourceStore.setState({ source: 'local' });
        useSearchNavigationStore.setState({ homeViewTab: 'local', preferredSearchSource: 'local', searchSourceTab: 'local' });
        reconcileSourceOnStartup();
        expect(useHomeSourceStore.getState().source).toBe('online');
        expect(useSearchNavigationStore.getState().homeViewTab).toBe('playlist');
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('local');
        expect(localStorage.getItem(HOME_SOURCE_KEY)).toBe('online');
    });

    it('切换来源只改浏览状态，不动当前歌曲、队列与播放地址', async () => {
        const { useHomeSourceStore } = await import('../../../src/stores/useHomeSourceStore');
        const { usePlaybackStore } = await import('../../../src/stores/usePlaybackStore');
        const before = {
            currentSong: usePlaybackStore.getState().currentSong,
            playQueue: usePlaybackStore.getState().playQueue,
            audioSrc: usePlaybackStore.getState().audioSrc,
            playerState: usePlaybackStore.getState().playerState,
        };
        useHomeSourceStore.getState().setSource('local');
        useHomeSourceStore.getState().setSource('online');
        const after = usePlaybackStore.getState();
        expect(after.currentSong).toBe(before.currentSong);
        expect(after.playQueue).toBe(before.playQueue);
        expect(after.audioSrc).toBe(before.audioSrc);
        expect(after.playerState).toBe(before.playerState);
    });

    it('资料库浏览来源切换只对齐资料库页签，绝不覆盖独立搜索来源偏好', async () => {
        const { selectHomeSearchSource, resolveHomeSearchSource } = await import('@/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('@/stores/useSearchNavigationStore');
        const { useOnlineProviderAccountStore } = await import('@/stores/useOnlineProviderAccountStore');
        useOnlineProviderAccountStore.getState().setActiveProviderId('qq');
        useSearchNavigationStore.getState().selectSearchSource('aggregate');
        for (const source of ['local', 'navidrome', 'qq', 'navidrome', 'local', 'qq'] as const) {
            selectHomeSearchSource(source);
            expect(useSearchNavigationStore.getState().searchSourceTab).toBe('aggregate');
            expect(resolveHomeSearchSource()).toBe('aggregate');
            if (source === 'navidrome') {
                expect(useSearchNavigationStore.getState().homeViewTab).toBe('navidrome');
            }
            if (source === 'qq') {
                expect(useSearchNavigationStore.getState().homeViewTab).toBe('playlist');
            }
        }
    });

    it('启动恢复 Navidrome 时保留用户已选择的独立搜索来源', async () => {
        const { useHomeSourceStore, reconcileSourceOnStartup } = await import('@/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('@/stores/useSearchNavigationStore');
        useHomeSourceStore.setState({ source: 'online' });
        useSearchNavigationStore.setState({ homeViewTab: 'navidrome', preferredSearchSource: 'netease', searchSourceTab: 'netease' });
        reconcileSourceOnStartup();
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('netease');
        useSearchNavigationStore.getState().followOnlineProvider('qq');
        expect(useSearchNavigationStore.getState().searchSourceTab).toBe('netease');
    });
});
