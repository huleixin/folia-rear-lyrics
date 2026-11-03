import { create } from 'zustand';

// src/stores/usePlayerViewModeStore.ts
// Which front-stage presentation the listener asked for, and which minimal page they left on.
//
// This is presentation only. Nothing here may reach the playback kernel, the lyric pipeline, the
// rear stage or the LSP bridge: the rear display and the AOD card keep their own settings and must
// look identical whichever front view is selected.

export type PlayerViewMode = 'minimal' | 'stage';
export type MinimalPlayerPage = 'cover' | 'lyrics';

export const PLAYER_VIEW_MODE_KEY = 'tingyu_player_view_mode';
export const MINIMAL_PLAYER_PAGE_KEY = 'tingyu_minimal_player_page';

const isPage = (value: unknown): value is MinimalPlayerPage => value === 'cover' || value === 'lyrics';

/** Only an explicit `stage` selects the classic stage; anything unknown keeps the minimal default. */
export const readStoredPlayerViewMode = (): PlayerViewMode => {
    if (typeof window === 'undefined') {
        return 'minimal';
    }
    try {
        return window.localStorage.getItem(PLAYER_VIEW_MODE_KEY) === 'stage' ? 'stage' : 'minimal';
    } catch {
        return 'minimal';
    }
};

export const readStoredMinimalPage = (): MinimalPlayerPage => {
    if (typeof window === 'undefined') {
        return 'cover';
    }
    try {
        const saved = window.localStorage.getItem(MINIMAL_PLAYER_PAGE_KEY);
        return isPage(saved) ? saved : 'cover';
    } catch {
        return 'cover';
    }
};

type PlayerViewModeState = {
    mode: PlayerViewMode;
    /** The last minimal page the listener was on; restored on the next visit. */
    page: MinimalPlayerPage;
    /**
     * A visit to the classic stage that the listener did not choose as their view.
     *
     * Entering the stage from the minimal lyric page must leave `mode` alone — otherwise opening the
     * stage once would quietly rewrite the preference — and it must be rememberable only for as long
     * as the visit lasts, so back returns to the minimal page instead of leaving the player.
     */
    detour: boolean;
    setMode: (mode: PlayerViewMode) => void;
    setPage: (page: MinimalPlayerPage) => void;
    openStage: () => void;
    closeStage: () => void;
};

const write = (key: string, value: string) => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // A blocked storage must not stop the listener from changing view for this session.
    }
};

export const usePlayerViewModeStore = create<PlayerViewModeState>(set => ({
    mode: readStoredPlayerViewMode(),
    page: readStoredMinimalPage(),
    detour: false,
    setMode: (mode) => {
        write(PLAYER_VIEW_MODE_KEY, mode);
        set({ mode, detour: false });
    },
    setPage: (page) => {
        write(MINIMAL_PLAYER_PAGE_KEY, page);
        set({ page });
    },
    openStage: () => set({ detour: true }),
    closeStage: () => set({ detour: false }),
}));

/** Minimal is a front-stage view; the classic stage is a preference or a temporary visit. */
export const isMinimalPlayerView = (mode: PlayerViewMode): boolean => mode === 'minimal';

/** Whether the classic stage is the surface on screen right now. */
export const isStageSurface = (mode: PlayerViewMode, detour: boolean): boolean => mode === 'stage' || detour;
