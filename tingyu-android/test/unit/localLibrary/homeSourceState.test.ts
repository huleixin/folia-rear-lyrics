// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/localLibrary/homeSourceState.test.ts
// 专项修复：音源弹窗勾了「本地音乐」，资料库却仍显示 QQ 音乐。
// 根因是推荐页来源与资料库页签各存一份、互不同步。这里验证统一入口与重启对齐。

const HOME_SOURCE_KEY = 'home_source_mode';
const LAST_TAB_KEY = 'last_home_view_tab';

describe('全局音乐来源与资料库页签一致性', () => {
    beforeEach(async () => {
        localStorage.clear();
        const { useHomeSourceStore } = await import('../../../src/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('../../../src/stores/useSearchNavigationStore');
        useHomeSourceStore.setState({ source: 'online' });
        useSearchNavigationStore.setState({ homeViewTab: 'playlist' });
    });

    it('选择本地音乐时，资料库页签同步切到本地，且两份持久化值一致', async () => {
        const { useHomeSourceStore } = await import('../../../src/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('../../../src/stores/useSearchNavigationStore');
        useHomeSourceStore.getState().setSource('local');
        expect(useHomeSourceStore.getState().source).toBe('local');
        expect(useSearchNavigationStore.getState().homeViewTab).toBe('local');
        expect(localStorage.getItem(HOME_SOURCE_KEY)).toBe('local');
        expect(localStorage.getItem(LAST_TAB_KEY)).toBe('local');
    });

    it('切回在线音乐时，回到用户原来那一栏，而不是硬跳回歌单', async () => {
        const { useHomeSourceStore } = await import('../../../src/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('../../../src/stores/useSearchNavigationStore');
        useSearchNavigationStore.getState().setHomeViewTab('albums');
        useHomeSourceStore.getState().setSource('local');
        expect(useSearchNavigationStore.getState().homeViewTab).toBe('local');
        useHomeSourceStore.getState().setSource('online');
        expect(useSearchNavigationStore.getState().homeViewTab).toBe('albums');
        expect(useHomeSourceStore.getState().source).toBe('online');
    });

    it('旧版本残留：来源=本地但页签=歌单，启动时以全局来源为准补齐', async () => {
        localStorage.setItem(HOME_SOURCE_KEY, 'local');
        localStorage.setItem(LAST_TAB_KEY, 'playlist');
        const { useHomeSourceStore, reconcileSourceOnStartup } = await import('../../../src/stores/useHomeSourceStore');
        const { useSearchNavigationStore } = await import('../../../src/stores/useSearchNavigationStore');
        useHomeSourceStore.setState({ source: 'local' });
        useSearchNavigationStore.setState({ homeViewTab: 'playlist' });
        reconcileSourceOnStartup();
        expect(useSearchNavigationStore.getState().homeViewTab).toBe('local');
        expect(useHomeSourceStore.getState().source).toBe('local');
    });

    it('切换来源只改浏览模式，不动当前歌曲、队列与播放地址', async () => {
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
});
