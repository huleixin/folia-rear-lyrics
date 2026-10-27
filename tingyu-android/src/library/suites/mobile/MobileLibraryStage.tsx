import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibrarySuiteStageProps } from '../../core/contracts/suite';
import { useMobileLibraryStore } from '../../../stores/useMobileLibraryStore';
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import MobileMiniPlayer from './MobileMiniPlayer';
import TingyuNavIcon from './TingyuNavIcon';
import './mobileLibrary.css';
import '../../../styles/mobileGlass.css';
import { useMobileGlass } from '../../../hooks/useMobileGlass';
import { useMobileFooterMotion } from './useMobileFooterMotion';
import './mobileFooterMotion.css';
import './mobileAdaptive.css';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import { useNativeGlassNav } from '../../../hooks/useNativeGlassNav';

// src/library/suites/mobile/MobileLibraryStage.tsx
function MobileLibraryStage(props: LibrarySuiteStageProps) {
    const { t } = useTranslation();
    const page = useMobileLibraryStore((state) => state.page);
    const searchOpen = useSearchNavigationStore((state) => state.isSearchOpen);
    const settingsOpen = useSettingsModalStore((state) => state.settingsModalState.isOpen);
    const homeActive = !searchOpen && !settingsOpen && page === 'home';
    const libraryActive = !searchOpen && !settingsOpen && page === 'library';
    const wide = useMediaQuery('(min-width:840px)');
    const playlistDetail = props.navigation.depth > 0 && props.navigation.activeType === 'playlist';
    // 两个玻璃节点持续挂载；切页只改变位置和透明度，不重建透镜或播放器。
    const navRef = useRef<HTMLElement>(null);
    const footerRef = useRef<HTMLElement>(null);
    useMobileFooterMotion(footerRef, navRef, playlistDetail);
    const nativeNavigate = useCallback((index: number) => {
        navRef.current?.querySelectorAll('button')[index]?.click();
    }, [navRef]);
    const nativeGlass = useNativeGlassNav(navRef, props.isInteractive && !settingsOpen && !searchOpen, `${playlistDetail}:${page}`, nativeNavigate);
    useMobileGlass(navRef, !nativeGlass);
    useEffect(() => {
        // The host registers its occlusion owner in an effect. Report after that registration.
        const frame = requestAnimationFrame(() => props.reportPlayerOcclusion(true));
        return () => cancelAnimationFrame(frame);
    }, [props.reportPlayerOcclusion, props.navigation.activeType]);
    const go = (next: 'home' | 'library') => {
        useMobileLibraryStore.getState().setPage(next);
        props.onLibraryHome?.();
    };
    return (
        <footer ref={footerRef} className="mobile-library ml-footer" data-footer-motion="true" data-playlist-detail={playlistDetail ? 'true' : undefined} inert={!props.isInteractive}>
            <MobileMiniPlayer
                onBackToPlayer={props.onBackToPlayer}
                onTogglePlayback={props.onTogglePlayback}
                onNextTrack={props.onNextTrack}
                canNextTrack={props.canNextTrack}
                onPreviousTrack={props.onPreviousTrack}
                canPreviousTrack={props.canPreviousTrack}
                nextTrackLabel={props.nextTrackLabel}
                previousTrackLabel={props.previousTrackLabel}
            />
            <nav ref={navRef} inert={playlistDetail && !wide} aria-hidden={playlistDetail && !wide || undefined} aria-label={t('mobileLibrary.navigation')}>
                <button
                    aria-current={homeActive ? 'page' : undefined}
                    onClick={() => go('home')}
                >
                    <TingyuNavIcon name="recommend" active={homeActive} />
                    <span>{t('mobileLibrary.recommend')}</span>
                </button>
                <button
                    aria-current={libraryActive ? 'page' : undefined}
                    onClick={() => go('library')}
                >
                    <TingyuNavIcon name="library" active={libraryActive} />
                    <span>{t('mobileLibrary.libraryNav')}</span>
                </button>
                <button
                    aria-current={searchOpen && !settingsOpen ? 'page' : undefined}
                    onClick={() => {
                        const search = useSearchNavigationStore.getState();
                        search.restoreSearch({ query: '', sourceTab: search.searchSourceTab, returnView: 'home' });
                    }}
                >
                    <TingyuNavIcon name="search" active={searchOpen && !settingsOpen} />
                    <span>{t('mobileLibrary.search')}</span>
                </button>
                <button
                    aria-current={settingsOpen ? 'page' : undefined}
                    onClick={() => useSettingsModalStore.getState().openSettings('options')}
                >
                    <TingyuNavIcon name="settings" active={settingsOpen} />
                    <span>{t('mobileLibrary.settingsNav')}</span>
                </button>
            </nav>
        </footer>
    );
}
export default React.memo(MobileLibraryStage);
