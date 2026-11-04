import { create } from 'zustand';

// src/stores/usePlayerViewModeStore.ts
// Which front-stage presentation the listener asked for, and which minimal page they left on.
//
// This is presentation only. Nothing here may reach the playback kernel, the lyric pipeline, the
// rear stage or the LSP bridge: the rear display and the AOD card keep their own settings and must
// look identical whichever front view is selected.

export type PlayerViewMode = 'minimal' | 'stage';
export type MinimalPlayerPage = 'cover' | 'lyrics';

/** Direction of the temporary stage sheet; both surfaces stay mounted until it settles. */
export type StageTransition = 'idle' | 'to-stage' | 'to-minimal';

export const PLAYER_VIEW_MODE_KEY = 'tingyu_player_view_mode';
export const MINIMAL_PLAYER_PAGE_KEY = 'tingyu_minimal_player_page';

/** Retain both surfaces beyond the 360ms sheet motion, including bridge delivery time. */
export const STAGE_TRANSITION_MS = 400;

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
    modeRevision: number;
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
    /** The temporary stage sheet currently moving, if any. */
    stageTransition: StageTransition;
    setMode: (mode: PlayerViewMode) => void;
    setPage: (page: MinimalPlayerPage) => void;
    openStage: () => void;
    closeStage: () => void;
    /** Only the layer that owns the hold should end it; exported for that component. */
    endStageTransition: () => void;
    restoreSettingsPresentation: (origin: Pick<PlayerViewModeState,'mode'|'modeRevision'|'page'|'detour'>) => void;
};

const write = (key: string, value: string) => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // A blocked storage must not stop the listener from changing view for this session.
    }
};

/** One hold at a time, wherever it was started from. */
let holdTimer = 0;
const cancelHold = () => {
    if (holdTimer) {
        window.clearTimeout(holdTimer);
        holdTimer = 0;
    }
};
const startHold = (end: () => void) => {
    cancelHold();
    holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        end();
    }, STAGE_TRANSITION_MS);
};

export const usePlayerViewModeStore = create<PlayerViewModeState>((set, get) => ({
    mode: readStoredPlayerViewMode(),
    modeRevision: 0,
    page: readStoredMinimalPage(),
    detour: false,
    stageTransition: 'idle',
    setMode: (mode) => {
        write(PLAYER_VIEW_MODE_KEY, mode);
        // A mode change is a decision, not a transition: drop any sheet transition that is still running so a
        // half-finished hold cannot leave a stale surface mounted.
        cancelHold();
        set({ mode, modeRevision:get().modeRevision+1, detour: false, stageTransition: 'idle' });
    },
    setPage: (page) => {
        write(MINIMAL_PLAYER_PAGE_KEY, page);
        set({ page });
    },
    openStage: () => {
        const state = get();
        if (state.detour) {
            return;
        }
        // Re-entering while the return sheet transition is still running is a reversal, not a second
        // navigation: the same pair of surfaces is already mounted, so this only turns the sheet transition
        // around instead of stacking a second one.
        startHold(() => get().endStageTransition());
        set({ detour: true, stageTransition: 'to-stage' });
    },
    closeStage: () => {
        const state = get();
        if (!state.detour) {
            return;
        }
        startHold(() => get().endStageTransition());
        set({ detour: false, stageTransition: 'to-minimal' });
    },
    endStageTransition: () => {
        cancelHold();
        if (get().stageTransition !== 'idle') {
            set({ stageTransition: 'idle' });
        }
    },
    restoreSettingsPresentation: ({mode,modeRevision,page,detour}) => {
        cancelHold();
        // An explicit display preference edited inside settings wins over the entry snapshot.
        set(get().modeRevision===modeRevision?{mode,page,detour,stageTransition:'idle'}:{page,stageTransition:'idle'});
    },
}));

/** Minimal is a front-stage view; the classic stage is a preference or a temporary visit. */
export const isMinimalPlayerView = (mode: PlayerViewMode): boolean => mode === 'minimal';

/** Whether the classic stage is the surface on screen right now. */
export const isStageSurface = (mode: PlayerViewMode, detour: boolean): boolean => mode === 'stage' || detour;
