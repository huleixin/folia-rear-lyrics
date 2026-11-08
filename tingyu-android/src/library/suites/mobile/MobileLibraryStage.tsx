import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibrarySuiteStageProps } from '../../core/contracts/suite';
import { useMobileLibraryStore } from '../../../stores/useMobileLibraryStore';
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { scheduleNativeShellRoute } from '../../../services/nativeShellCommit';
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
import { useComposeChrome } from '../../../hooks/useComposeChrome';
import { COMPOSE_CHROME,PREHIDE_COMPOSE_CHROME } from '../../../services/nativeChrome';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { useAppViewStore } from '../../../stores/useAppViewStore';
import '../../../styles/composeChrome.css';

// src/library/suites/mobile/MobileLibraryStage.tsx
function MobileLibraryStage(props: LibrarySuiteStageProps) {
    const { t } = useTranslation();
    const page = useMobileLibraryStore((state) => state.page);
    const searchOpen = useSearchNavigationStore((state) => state.isSearchOpen);
    const settingsOpen = useSettingsModalStore((state) => state.settingsModalState.isOpen);
    // 设置二/三级页：底部导航也要收起来（只有设置主页保留）。
    const settingsSubview = useSettingsModalStore((state) => state.isSubSettingsViewOpen);
    const homeActive = !searchOpen && !settingsOpen && page === 'home';
    const libraryActive = !searchOpen && !settingsOpen && page === 'library';
    const artistDetail = props.navigation.depth > 0 && props.navigation.activeType === 'artist';
    const wide = useMediaQuery('(min-width:840px)');
    // 集合详情（非歌手）按页面层级判定，不再按数据类型：歌单/专辑/每日推荐等
    // 详情页都隐藏一级导航、保留迷你播放器；宽屏保留侧边导航。
    const collectionDetail = props.navigation.depth > 0 && props.navigation.activeType !== 'artist';
    // 两个玻璃节点持续挂载；切页只改变位置和透明度，不重建透镜或播放器。
    const navRef = useRef<HTMLElement>(null);
    const footerRef = useRef<HTMLElement>(null);
    useMobileFooterMotion(footerRef, navRef, collectionDetail);
    const nativeNavigate = useCallback((index: number) => {
        // 底栏现在在搜索/设置页也显示（2026-11-09 统一）。点了必须真能切走：
        // 先收掉覆盖层，再切页，最后统一让原生路由重新发布一次。
        const search=useSearchNavigationStore.getState();
        const settings=useSettingsModalStore.getState();
        if(index===3){
            if(search.isSearchOpen)search.hideSearchOverlay();
            if(!settings.settingsModalState.isOpen)settings.openSettings('options');
        }else{
            if(search.isSearchOpen&&index!==2)search.hideSearchOverlay();
            if(settings.settingsModalState.isOpen)settings.closeSettings();
            if(index===0||index===1){useMobileLibraryStore.getState().setPage(index===0?'home':'library');props.onLibraryHome?.();}
            else if(index===2&&!search.isSearchOpen){search.restoreSearch({query:'',sourceTab:search.searchSourceTab,returnView:'home'});}
        }
        scheduleNativeShellRoute();
    }, [props.onLibraryHome]);
    const nativeGlass = useNativeGlassNav(navRef, !COMPOSE_CHROME && props.isInteractive && !settingsOpen && !searchOpen, `${collectionDetail}:${page}`, nativeNavigate);
    const reducedMotion = useReducedMotionFor('uiMicroMotion');
    const homeView = useAppViewStore(state=>state.view==='home'&&!state.isPanelOpen);
    const compose = useComposeChrome(navRef,'nav',homeView && !artistDetail && (PREHIDE_COMPOSE_CHROME||props.isInteractive) && !(settingsOpen && settingsSubview),{
        selected:homeActive?0:libraryActive?1:searchOpen?2:settingsOpen?3:-1,vertical:wide,reducedMotion,
        accent:'#86d8b8',ink:'#eef5ef',labels:{nav0:t('mobileLibrary.recommend'),nav1:t('mobileLibrary.libraryNav'),nav2:t('mobileLibrary.search'),nav3:t('mobileLibrary.settingsNav')},
    },{navigate:nativeNavigate});
    useMobileGlass(navRef, !nativeGlass && !compose);
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
        <footer ref={footerRef} className="mobile-library ml-footer" data-footer-motion="true" data-collection-detail={collectionDetail ? 'true' : undefined} data-artist-detail={artistDetail ? 'true' : undefined} inert={artistDetail||!props.isInteractive&&!PREHIDE_COMPOSE_CHROME}>
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
            <nav ref={navRef} inert={collectionDetail && !wide} aria-hidden={collectionDetail && !wide || undefined} aria-label={t('mobileLibrary.navigation')}>
                {!compose && <>
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
                </>}
            </nav>
        </footer>
    );
}
export default React.memo(MobileLibraryStage);
