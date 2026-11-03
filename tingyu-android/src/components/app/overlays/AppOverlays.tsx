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

// Centralized app-level overlay renderer so App.tsx does not mount leaf overlays directly.
type AppOverlaysProps = {
    model: AppOverlaysModel;
};
const MobileStageChrome = lazy(() => import('./mobile-stage/MobileStageChrome'));
const MinimalStage = lazy(() => import('./minimal-stage/MinimalStage'));

const AppOverlays: React.FC<AppOverlaysProps> = ({ model }) => {
    countRender('AppOverlays');
    const isCurrentSongPosterVisible = useLatticeControlsStore(state => state.isCurrentSongPosterVisible);
    const suite = useActiveLibrarySuiteId();
    const view = useAppViewStore(state => state.view);
    const playerViewMode = usePlayerViewModeStore(state => state.mode);
    const playerViewDetour = usePlayerViewModeStore(state => state.detour);
    const searchOpen = useSearchNavigationStore(state => state.isSearchOpen);
    const [searchLoaded, setSearchLoaded] = useState(searchOpen);
    // After first use retain the workspace so its existing close/reset effects and exit animation run.
    useEffect(() => { if (searchOpen) setSearchLoaded(true); }, [searchOpen]);
    // The mobile library owns its mini-player and navigation. Stage controls remain unchanged.
    const ownsLibraryChrome = suite === 'mobile' && view === 'home';
    // The minimal stage is a player surface, and it owns its own top bar and transport; the classic
    // stage chrome must not mount underneath it, or Android would draw a second control bar over it.
    const ownsMinimalStage = suite === 'mobile' && view === 'player' && playerViewMode === 'minimal' && !playerViewDetour;
    const ownsStageChrome = suite === 'mobile' && view === 'player' && !!model.mobileStage && !ownsMinimalStage;
    const {
        searchOverlay,
        debugOverlay,
        memoryMonitor,
        floatingControls,
        nowPlayingToast,
    } = model;

    return (
        <>
            {searchOverlay && (searchOpen || searchLoaded) && <Suspense fallback={null}><SearchWorkspace {...searchOverlay} /></Suspense>}

            {debugOverlay && <Suspense fallback={null}><DevDebugOverlay {...debugOverlay} /></Suspense>}

            {memoryMonitor && <Suspense fallback={null}><MemoryMonitorWindow {...memoryMonitor} /></Suspense>}

            {ownsMinimalStage && <Suspense fallback={null}><MinimalStage chrome={model.mobileStage!} controls={floatingControls ?? null} /></Suspense>}

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
