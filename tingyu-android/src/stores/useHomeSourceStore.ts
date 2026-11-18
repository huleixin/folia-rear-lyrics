import { create } from 'zustand';
import { resolveEffectiveSearchSource, useSearchNavigationStore, type SearchSource } from './useSearchNavigationStore';
import type { HomeViewTab } from '../types';

// src/stores/useHomeSourceStore.ts
/**
 * 全局音乐来源（在线 / 本地）的唯一权威状态。
 *
 * 历史上这里只管「推荐页这一屏显示谁」，资料库的页签另由 useSearchNavigationStore.homeViewTab
 * 管，结果音源弹窗勾了「本地音乐」而资料库仍停在 QQ 音乐（两套状态各自持久化、互不同步）。
 * 现在 setSource 是唯一入口：一次写入同时对齐资料库页签，重启后两份持久化值也天然一致。
 *
 * 切换只影响浏览模式：不碰播放器、当前歌曲与播放队列。停在一个音源里播着的歌会继续播。
 */
export type HomeSource = 'online' | 'local';

const HOME_SOURCE_STORAGE_KEY = 'home_source_mode';
/** 切到本地之前的在线页签（仅本会话有效；重启由两份既有持久化值决定）。 */
let lastOnlineTab: HomeViewTab = 'playlist';

const readInitialSource = (): HomeSource => {
    // 全局 local 模式已解耦：本地音乐作为独立二级页面与推荐页独立筛选项存在，
    // 冷启动如读到历史残留的 'local'，自动恢复为 'online'（保留全部本地音频与收藏数据）。
    if (typeof window === 'undefined') return 'online';
    try {
        if (localStorage.getItem(HOME_SOURCE_STORAGE_KEY) === 'local') {
            localStorage.setItem(HOME_SOURCE_STORAGE_KEY, 'online');
        }
    } catch {
        /* Ignore storage errors. */
    }
    return 'online';
};

const writeStorage = (key: string, value: string): void => {
    try { if (typeof window !== 'undefined') localStorage.setItem(key, value); }
    catch { /* 本会话内仍然生效。 */ }
};

const ONLINE_TABS: HomeViewTab[] = ['playlist', 'radio', 'albums', 'navidrome'];

/** 把资料库页签对齐到在线页签；历史残留的 'local' 页签自动恢复为上一在线页签。 */
const alignLibraryTab = (): void => {
    const navigation = useSearchNavigationStore.getState();
    const tab = navigation.homeViewTab;
    if (tab !== 'local') {
        if (ONLINE_TABS.includes(tab)) lastOnlineTab = tab;
        return;
    }
    navigation.setHomeViewTab(lastOnlineTab);
};

type HomeSourceState = {
    source: HomeSource;
    setSource: (source: HomeSource) => void;
};

export const useHomeSourceStore = create<HomeSourceState>((set) => ({
    source: readInitialSource(),
    setSource: (_requested) => {
        // 统一固定为 'online'，杜绝任何入口误切回旧版全局本地模式导致推荐页/资料库/搜索页联动退化。
        const normalized: HomeSource = 'online';
        writeStorage(HOME_SOURCE_STORAGE_KEY, normalized);
        alignLibraryTab();
        set({ source: normalized });
    },
}));

/**
 * 启动时自愈旧版本残留的全局 local 状态，并恢复 Navidrome 等合法在线页签对齐，
 * 不清空任何本地音乐文件、歌单、收藏或收听历史，且绝不修改用户的独立搜索来源偏好。
 */
export const reconcileSourceOnStartup = (): void => {
    useHomeSourceStore.getState().setSource('online');
};

/**
 * 读取进入搜索页时应使用的搜索来源：始终以用户最后一次主动选择的独立搜索偏好为准，
 * 首次安装无历史记录时默认使用「综合搜索」('aggregate')，绝不由当前音乐平台覆盖。
 */
export const resolveHomeSearchSource = (): SearchSource => {
    const state = useSearchNavigationStore.getState();
    return resolveEffectiveSearchSource(state.preferredSearchSource);
};

/** 切换首页/资料库浏览音源时仅同步浏览页签，绝不覆盖独立持久化的搜索来源偏好。 */
export const selectHomeSearchSource = (source: SearchSource): void => {
    useHomeSourceStore.getState().setSource('online');
    const navigation = useSearchNavigationStore.getState();
    if (source === 'navidrome') navigation.setHomeViewTab('navidrome');
    else if (source !== 'local' && navigation.homeViewTab === 'navidrome') navigation.setHomeViewTab('playlist');
};
