import { create } from 'zustand';
import type { SongResult } from '../types';

// src/stores/useAddToPlaylistStore.ts
// The "add the current song to a playlist" dialog: whether it is up, and whether it could do
// anything if it were.
//
// The dialog used to be a local useState inside UnifiedPanel, next to the star button that opened
// it, which meant it only existed while the player panel was mounted. It is a decision about the
// current song, not about the panel, so a command should be able to reach it from anywhere — and
// that requires the open state to outlive the panel.
//
// `availability` is published by the host rather than derived per caller: answering it needs the
// Navidrome playlist list, which is fetched, and two consumers each fetching it would be worse
// than one owner saying what it found.

export type AddToPlaylistAvailability = {
    /** The current song is the sort of song that can go in a playlist at all. */
    isApplicable: boolean;
    /** There is somewhere to put it, and this provider allows it. */
    canAdd: boolean;
    /** Why not, when `canAdd` is false and the answer is worth stating. */
    disabledReason?: string;
};

const UNAVAILABLE: AddToPlaylistAvailability = { isApplicable: false, canAdd: false };

type AddToPlaylistState = {
    isOpen: boolean;
    availability: AddToPlaylistAvailability;
    /**
     * 阶段二：歌单选择器服务的目标歌曲。
     *
     * null = 沿用旧行为，操作「当前正在播放的歌」；从歌曲列表的更多菜单进入时
     * 携带被点的那首歌 —— 用户加进歌单的必须是列表里点的那首，不是碰巧在播的。
     */
    targetSong: SongResult | null;
    open: (target?: SongResult) => void;
    close: () => void;
    setAvailability: (availability: AddToPlaylistAvailability) => void;
};

export const useAddToPlaylistStore = create<AddToPlaylistState>((set) => ({
    isOpen: false,
    availability: UNAVAILABLE,
    targetSong: null,
    open: (target) => set({ isOpen: true, targetSong: target ?? null }),
    close: () => set({ isOpen: false, targetSong: null }),
    setAvailability: (availability) => set({ availability }),
}));

export const openAddToPlaylist = () => useAddToPlaylistStore.getState().open();

/** 歌曲菜单入口：把「这一首」交给歌单选择器。 */
export const openAddToPlaylistForSong = (song: SongResult) => useAddToPlaylistStore.getState().open(song);
