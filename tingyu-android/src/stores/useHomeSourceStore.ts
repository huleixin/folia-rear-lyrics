import { create } from 'zustand';

// src/stores/useHomeSourceStore.ts
/**
 * 推荐页当前的音源：在线或本地。
 *
 * 这不是资料库的页签（资料库的 歌单/电台/专辑/本地/Navidrome 由 useSearchNavigationStore.homeViewTab
 * 管，行为不变），只是「推荐页这一屏显示谁」：选本地音乐 → 本地推荐首页，选在线 → 原来的推荐首页。
 * 切换只影响首页数据源，不碰播放器 —— 正在播的歌继续播，迷你播放器始终显示真实正在播放的内容。
 *
 * 用户最后选择的来源记在 localStorage，重启后恢复。
 */
export type HomeSource = 'online' | 'local';

const HOME_SOURCE_STORAGE_KEY = 'home_source_mode';

const readInitialSource = (): HomeSource => {
    if (typeof window === 'undefined') return 'online';
    try {
        return localStorage.getItem(HOME_SOURCE_STORAGE_KEY) === 'local' ? 'local' : 'online';
    } catch {
        return 'online';
    }
};

type HomeSourceState = {
    source: HomeSource;
    setSource: (source: HomeSource) => void;
};

export const useHomeSourceStore = create<HomeSourceState>((set) => ({
    source: readInitialSource(),
    setSource: (source) => {
        try {
            localStorage.setItem(HOME_SOURCE_STORAGE_KEY, source);
        } catch {
            /* 本会话内仍然生效。 */
        }
        set({ source });
    },
}));
