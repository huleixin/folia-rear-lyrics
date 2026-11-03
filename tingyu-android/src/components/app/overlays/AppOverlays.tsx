import { isAndroidNativeRuntime } from '../../../utils/platform';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import FloatingPlayerControls from '../../FloatingPlayerControls';
const SearchWorkspace = lazy(() => import('../search/SearchWorkspace'));
const DevDebugOverlay = lazy(() => import('../../DevDebugOverlay'));
const MemoryMonitorWindow = lazy(() => import('../../debug/MemoryMonitorWindow'));
import NowPlayingToast from './NowPlayingToast';
import BottomCommandPaletteButton from './BottomCommandPaletteButton';
import type { AppOverlaysModel } from './buildAppOverlaysModel';
import { countRender } from '../../../dev/renderCount';
import { useLatticeControlsStore } from '../../../stores/useLatticeControlsStore';
import { useActiveLibrarySuiteId } from '../../../library/app/librarySuiteChoice';
import { useAppViewStore } from '../../../stores/useAppViewStore';
import { usePlayerViewModeStore } from '../../../stores/usePlayerViewModeStore';
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { scheduleUiWarmup } from '../../../services/uiWarmup';
import { useNativeMinimalPlayer } from '../../../hooks/useNativeMinimalPlayer';

// Centralized app-level overlay renderer so App.tsx does not mount leaf overlays directly.
type AppOverlaysProps = {
    model: AppOverlaysModel;
};
const MobileStageChrome = lazy(() => import('./mobile-stage/MobileStageChrome'));
const MinimalStage = lazy(() => import('./minimal-stage/MinimalStage'));
import './mobile-stage/playerStageTransition.css';
/** Module-scope so the warm-up queue can tell one request from another and only run it once. */
const warmMinimalStage = () => import('./minimal-stage/MinimalStage');

const AppOverlays: React.FC<AppOverlaysProps> = ({ model }) => {
    countRender('AppOverlays');
    const isCurrentSongPosterVisible = useLatticeControlsStore(state => state.isCurrentSongPosterVisible);
    const suite = useActiveLibrarySuiteId();
    const view = useAppViewStore(state => state.view);
    const playerViewMode = usePlayerViewModeStore(state => state.mode);
    const playerViewDetour = usePlayerViewModeStore(state => state.detour);
    // Retain the minimal page underneath a temporary stage sheet.
    const stageTransition = usePlayerViewModeStore(state => state.stageTransition);
    const searchOpen = useSearchNavigationStore(state => state.isSearchOpen);
    const [searchLoaded, setSearchLoaded] = useState(searchOpen);
    // After first use retain the workspace so its existing close/reset effects and exit animation run.
    useEffect(() => { if (searchOpen) setSearchLoaded(true); }, [searchOpen]);
    // The stage below is a lazy chunk, and in the default view mode almost every open of the player
    // needs it. Without a warm-up the first open renders `fallback={null}` for as long as the module
    // takes to fetch and parse — and the player surface is empty in that window (the visualizer is
    // unmounted by the same flag, and the library underneath it has already faded out), which reads
    // as a flash of the app background before the page rises. One speculative import through the
    // app's own idle queue, which already holds back until startup is interactive, is the whole fix.
    useEffect(() => {
        if (playerViewMode !== 'minimal') {
            return;
        }
        return scheduleUiWarmup(warmMinimalStage, 'module');
    }, [playerViewMode]);
    // The mobile library owns its mini-player and navigation. Stage controls remain unchanged.
    const ownsLibraryChrome = suite === 'mobile' && view === 'home';
    // The minimal stage is a player surface, and it owns its own top bar and transport; the classic
    // stage chrome must not mount underneath it, or Android would draw a second control bar over it.
    const ownsStageChrome = suite === 'mobile' && view === 'player' && !!model.mobileStage
        && (playerViewMode === 'stage' || playerViewDetour || stageTransition === 'to-minimal');
    const ownsMinimalStage = suite === 'mobile' && view === 'player' && playerViewMode === 'minimal';
    const {
        searchOverlay,
        debugOverlay,
        memoryMonitor,
        floatingControls,
        nowPlayingToast,
    } = model;
    // The minimal player's Compose migration (phase 1). Native takes the surface over only after it
    // acks a frame, so a host that cannot render it leaves today's WebView page in place.
    //
    // While a JS sheet is open (the queue panel) the surface is handed back: the native page is a
    // full-window layer and would cover a panel that still lives in the WebView. Phase 2 replaces
    // that panel natively; until then a hand-off is better than an invisible queue.
    const panelOpen = useAppViewStore(state => state.isPanelOpen);
    const nativeMinimal = useNativeMinimalPlayer({
        enabled: ownsMinimalStage && !panelOpen,
        chrome: model.mobileStage,
        controls: floatingControls,
    });
    const ownsWebMinimalStage = ownsMinimalStage && !nativeMinimal.owns;

    return (
        <>
            {searchOverlay && (searchOpen || searchLoaded) && <Suspense fallback={null}><SearchWorkspace {...searchOverlay} /></Suspense>}

            {debugOverlay && <Suspense fallback={null}><DevDebugOverlay {...debugOverlay} /></Suspense>}

            {memoryMonitor && <Suspense fallback={null}><MemoryMonitorWindow {...memoryMonitor} /></Suspense>}

            {ownsWebMinimalStage && <Suspense fallback={null}><MinimalStage chrome={model.mobileStage!} controls={floatingControls ?? null} /></Suspense>}

            {ownsStageChrome && <Suspense fallback={null}><MobileStageChrome chrome={model.mobileStage!} controls={floatingControls ?? null} /></Suspense>}

            {/* The minimal page already shows the song, the artwork and a transport; a floating
                control bar and a now-playing card over it would be two more copies of the same facts. */}
            {!ownsLibraryChrome && !ownsStageChrome && !ownsMinimalStage && floatingControls
                && (floatingControls.currentView !== 'lattice' || !isCurrentSongPosterVisible)
                && <FloatingPlayerControls {...floatingControls} />}

            {!ownsLibraryChrome && !ownsStageChrome && !ownsMinimalStage && nowPlayingToast && <NowPlayingToast {...nowPlayingToast} />}

            {/* 桌面版有 Ctrl+K，触屏设备需要这个按钮才能打开命令面板。 */}
            {!isAndroidNativeRuntime() && !ownsLibraryChrome && !ownsStageChrome && !ownsMinimalStage && typeof window !== 'undefined' && !(window as unknown as { electron?: unknown }).electron && (
                <BottomCommandPaletteButton />
            )}
        </>
    );
};

export default React.memo(AppOverlays);
