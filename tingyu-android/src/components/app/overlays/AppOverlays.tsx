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
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';

// Centralized app-level overlay renderer so App.tsx does not mount leaf overlays directly.
type AppOverlaysProps = {
    model: AppOverlaysModel;
};
const MobileStageChrome = lazy(() => import('./mobile-stage/MobileStageChrome'));

const AppOverlays: React.FC<AppOverlaysProps> = ({ model }) => {
    countRender('AppOverlays');
    const isCurrentSongPosterVisible = useLatticeControlsStore(state => state.isCurrentSongPosterVisible);
    const suite = useActiveLibrarySuiteId();
    const view = useAppViewStore(state => state.view);
    const searchOpen = useSearchNavigationStore(state => state.isSearchOpen);
    const [searchLoaded, setSearchLoaded] = useState(searchOpen);
    // After first use retain the workspace so its existing close/reset effects and exit animation run.
    useEffect(() => { if (searchOpen) setSearchLoaded(true); }, [searchOpen]);
    // The mobile library owns its mini-player and navigation. Stage controls remain unchanged.
    const ownsLibraryChrome = suite === 'mobile' && view === 'home';
    const ownsStageChrome = suite === 'mobile' && view === 'player' && !!model.mobileStage;
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

            {ownsStageChrome && <Suspense fallback={null}><MobileStageChrome chrome={model.mobileStage!} controls={floatingControls ?? null} /></Suspense>}

            {!ownsLibraryChrome && !ownsStageChrome && floatingControls
                && (floatingControls.currentView !== 'lattice' || !isCurrentSongPosterVisible)
                && <FloatingPlayerControls {...floatingControls} />}

            {!ownsLibraryChrome && !ownsStageChrome && nowPlayingToast && <NowPlayingToast {...nowPlayingToast} />}

            {/* 桌面版有 Ctrl+K，触屏设备需要这个按钮才能打开命令面板。 */}
            {!isAndroidNativeRuntime() && !ownsLibraryChrome && !ownsStageChrome && typeof window !== 'undefined' && !(window as unknown as { electron?: unknown }).electron && (
                <BottomCommandPaletteButton />
            )}
        </>
    );
};

export default React.memo(AppOverlays);
