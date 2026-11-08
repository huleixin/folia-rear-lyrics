import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import { useLibraryHomeSources } from '../../core/bindings/useLibraryHomeSources';
import { useLibraryHomeTabsRegistration } from '../../core/bindings/useLibraryHomeSurfaceRegistration';
import { useMobileLibraryStore } from '../../../stores/useMobileLibraryStore';
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { useHomeSourceStore } from '../../../stores/useHomeSourceStore';
import { hasBlockingWindow } from '../../../utils/keyboardTargets';
import { hasRegisteredModal } from '../../../services/modalBackStack';
import { LocalDirectory, NavidromeDirectory } from './MobileSourceDirectories';
import MobileHomeOverview from './MobileHomeOverview';
import MobileLibraryOnline from './MobileLibraryOnline';
import { MobileSourceSheet } from './MobileHomeSources';
import { useMobileCollectionPreload } from './useMobileCollectionPreload';
import { useNativePagesAvailable } from '../../../hooks/useNativePage';
import NativeHomePage from './native/NativeHomePage';
import { NATIVE_FIRST } from '../../../services/nativePages';
import './mobileLibrary.css';
import './mobileLibraryPage.css';

// src/library/suites/mobile/MobileHome.tsx
function MobileHome(props: LibraryHomeSurfaceProps) {
    const { t } = useTranslation();
    const sources = useLibraryHomeSources(props);
    const page = useMobileLibraryStore((state) => state.page);
    const preloadCollection = useMobileCollectionPreload(props.isInteractive);
    useEffect(() => {
        const back = (event: KeyboardEvent) => {
            if (
                event.key !== 'Escape' ||
                event.defaultPrevented ||
                !props.isInteractive ||
                page !== 'library' ||
                // 有已注册模态在开时，资料库页不参与返回（栈顶优先，modalBackStack 契约）。
                hasRegisteredModal() ||
                hasBlockingWindow() ||
                useSearchNavigationStore.getState().isSearchOpen
            )
                return;
            event.preventDefault();
            useMobileLibraryStore.getState().setPage('home');
        };
        window.addEventListener('keydown', back);
        return () => window.removeEventListener('keydown', back);
    }, [page, props.isInteractive]);
    useLibraryHomeTabsRegistration({
        getState: () => ({ active: sources.tab, tabs: sources.tabs }),
        setTab: (tab) => {
            if (!sources.tabs.some((entry) => entry.key === tab && !entry.disabledReason)) return false;
            sources.setTab(tab);
            // 页签与全局音源是同一件事：命令面板 / 原生页签也要走统一入口，
            // 否则资料库停在「本地」而推荐页还是在线（或反过来）。
            useHomeSourceStore.getState().setSource(tab === 'local' ? 'local' : 'online');
            useMobileLibraryStore.getState().setPage('library');
            props.onNativeTabSelected?.();
            return true;
        },
    });
    const [showSources, setShowSources] = useState(false);
    const homeSource = useHomeSourceStore((state) => state.source);
    const setHomeSource = useHomeSourceStore((state) => state.setSource);
    const rootRef=React.useRef<HTMLElement>(null);
    const nativeAvailable=useNativePagesAvailable();
    // 首页 DOM 已改为编译期剔除（NATIVE_FIRST 恒真），ready 回调不再驱动任何渲染分支，
    // 仅为适配器签名保留 setter。
    const [,setNativeReady]=useState(NATIVE_FIRST);
    const closeSources = useCallback(() => setShowSources(false), []);
    return (
        <main ref={rootRef} className="mobile-library ml-page ml-home" data-page={page} inert={!props.isInteractive} data-testid="mobile-home"
            onPointerDownCapture={preloadCollection} onFocusCapture={preloadCollection}>
            {/* homeSource 参与 key：切换音源时整页重挂，Compose 侧拿到的是干净的新模型。 */}
            {nativeAvailable&&<NativeHomePage key={`${page}:${sources.tab}:${sources.online.providerId}:${homeSource}`} root={rootRef} page={page} props={props} sources={sources}
                onReady={setNativeReady} onSources={()=>setShowSources(true)}/>}
            {/* 模块常量门控（docs/ANDROID-PAGE-OWNERSHIP.md §2）：NATIVE_FIRST 在 Android
                启动时即为 true、且本会话内不再变化，因此这段旧 DOM 在 Android 上不可达；
                网页端 NATIVE_FIRST=false，仍由它渲染。接管失败时由原生
                NativePageFallbackPanel 显示错误与重试，不允许把本段改回运行时可变量
                （`!nativeReady` 之类）——那会让旧页面重新出现在 Android 上。 */}
            {!NATIVE_FIRST&&<>
            <header className="ml-home-header">
                <div className="ml-home-heading">
                    <h1 className="ml-brand">
                        {t(page === 'home' ? 'mobileLibrary.recommend' : 'mobileLibrary.libraryTitle')}
                    </h1>
                    {page === 'home' && <p>{t('mobileLibrary.discoverMoreMusic')}</p>}
                </div>
                <span className="ml-spacer" />
                {/* 本地模式不显示在线音源选择器（QQ 音乐下拉）；推荐页右上角仍可切换来源。 */}
                {homeSource !== 'local' && (
                <button className="ml-source" onClick={() => setShowSources(true)}>
                    {sources.online.providerLabel}
                    <ChevronDown size={15} />
                </button>
                )}
            </header>
            {page === 'library' && homeSource !== 'local' && (
                <>
                    <div className="ml-tabs" role="group" aria-label={t('mobileLibrary.sources')}>
                        {sources.tabs.map((tab) => (
                            <button
                                key={tab.key}
                                aria-pressed={sources.tab === tab.key}
                                disabled={!!tab.disabledReason}
                                title={tab.disabledReason}
                                onClick={() => {
                                    sources.setTab(tab.key);
                                    // 与原生页签同语义：切本地页签=选本地音源，切在线页签=回在线。
                                    setHomeSource(tab.key === 'local' ? 'local' : 'online');
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                        {props.extraTabs?.map((tab) => (
                            <button key={tab.id} onClick={tab.select}>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
            {page === 'library' && (homeSource === 'local' || sources.tab === 'local') ? (
                <LocalDirectory {...props} />
            ) : page === 'library' && sources.tab === 'navidrome' ? (
                <NavidromeDirectory {...props} />
            ) : page === 'library' ? (
                <MobileLibraryOnline key={`${sources.online.providerId}:${sources.tab}`} props={props} sources={sources} />
            ) : (
                <MobileHomeOverview key={page} props={props} sources={sources} overview={page === 'home'} />
            )}
            </>}
            {showSources && (
                <MobileSourceSheet
                    account={props.account}
                    onOpenSettings={props.onOpenSettings}
                    onClose={closeSources}
                    localSongCount={props.localSongs.length}
                />
            )}
            {props.accountLayerRef &&
                createPortal(<div className="ml-account-layer" ref={props.accountLayerRef} />, document.body)}
        </main>
    );
}
export default React.memo(MobileHome);
