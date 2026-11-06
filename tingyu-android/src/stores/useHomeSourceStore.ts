import { create } from 'zustand';
import { useSearchNavigationStore } from './useSearchNavigationStore';
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
    if (typeof window === 'undefined') return 'online';
    try {
        return localStorage.getItem(HOME_SOURCE_STORAGE_KEY) === 'local' ? 'local' : 'online';
    } catch {
        return 'online';
    }
};

const writeStorage = (key: string, value: string): void => {
    try { if (typeof window !== 'undefined') localStorage.setItem(key, value); }
    catch { /* 本会话内仍然生效。 */ }
};

const ONLINE_TABS: HomeViewTab[] = ['playlist', 'radio', 'albums', 'navidrome'];

/** 把资料库页签对齐到全局来源；只在值不一致时写，避免与页签点击互相来回触发。 */
const alignLibraryTab = (source: HomeSource): void => {
    const navigation = useSearchNavigationStore.getState();
    const tab = navigation.homeViewTab;
    if (source === 'local') {
        if (tab === 'local') return;
        if (ONLINE_TABS.includes(tab)) lastOnlineTab = tab;
        navigation.setHomeViewTab('local');
        return;
    }
    // 在线：记住用户当前所在的在线页签；若正停在本地页，回到切走之前的那一栏。
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
    setSource: (source) => {
        writeStorage(HOME_SOURCE_STORAGE_KEY, source);
        alignLibraryTab(source);
        set({ source });
    },
}));

/**
 * 启动时把两份持久化状态对齐一次。
 *
 * 旧版本只写了 home_source_mode，没写 homeViewTab；冷启动后前者是 local、后者还是 playlist，
 * 资料库就会显示 QQ 音乐。这里以全局来源为准补齐，不清空任何用户数据。
 */
export const reconcileSourceOnStartup = (): void => {
    alignLibraryTab(useHomeSourceStore.getState().source);
};
