import { create } from 'zustand';
import type { LocalPlaylistSortDirection, LocalPlaylistSortField } from '../../../utils/localPlaylistView';

// src/library/core/state/useLocalPlaylistSortStore.ts
// 本地歌单详情的视图排序选择（阶段二）。与文件夹排序（useLocalTrackSortStore）分开：
// 两者的字段集不同，且歌单换排序绝不能改用户手动调整过的存储顺序，所以单独一个 store。

const FIELD_STORAGE_KEY = 'local_playlist_sort_field';
const DIRECTION_STORAGE_KEY = 'local_playlist_sort_direction';

const readField = (): LocalPlaylistSortField => {
    if (typeof window === 'undefined') return 'default';
    const stored = localStorage.getItem(FIELD_STORAGE_KEY);
    return stored === 'name' || stored === 'artist' || stored === 'addedAt' ? stored : 'default';
};

const readDirection = (): LocalPlaylistSortDirection => {
    if (typeof window === 'undefined') return 'asc';
    return localStorage.getItem(DIRECTION_STORAGE_KEY) === 'desc' ? 'desc' : 'asc';
};

type LocalPlaylistSortState = {
    field: LocalPlaylistSortField;
    direction: LocalPlaylistSortDirection;
    setField: (field: LocalPlaylistSortField) => void;
    setDirection: (direction: LocalPlaylistSortDirection) => void;
};

export const useLocalPlaylistSortStore = create<LocalPlaylistSortState>(set => ({
    field: readField(),
    direction: readDirection(),
    setField: (field) => {
        localStorage.setItem(FIELD_STORAGE_KEY, field);
        set({ field });
    },
    setDirection: (direction) => {
        localStorage.setItem(DIRECTION_STORAGE_KEY, direction);
        set({ direction });
    },
}));
