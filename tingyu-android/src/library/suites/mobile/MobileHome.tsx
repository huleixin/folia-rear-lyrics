import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import { useLibraryHomeSources } from '../../core/bindings/useLibraryHomeSources';
import { useLibraryHomeTabsRegistration } from '../../core/bindings/useLibraryHomeSurfaceRegistration';
import { useMobileLibraryStore } from '../../../stores/useMobileLibraryStore';
import { useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { hasBlockingWindow } from '../../../utils/keyboardTargets';
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
            useMobileLibraryStore.getState().setPage('library');
            props.onNativeTabSelected?.();
            return true;
        },
    });
    const [showSources, setShowSources] = useState(false);
    const rootRef=React.useRef<HTMLElement>(null);
    const nativeAvailable=useNativePagesAvailable();
    const [nativeReady,setNativeReady]=useState(NATIVE_FIRST);
    const closeSources = useCallback(() => setShowSources(false), []);
    return (
        <main ref={rootRef} className="mobile-library ml-page ml-home" data-page={page} inert={!props.isInteractive} data-testid="mobile-home"
            onPointerDownCapture={preloadCollection} onFocusCapture={preloadCollection}>
            {nativeAvailable&&<NativeHomePage key={`${page}:${sources.tab}:${sources.online.providerId}`} root={rootRef} page={page} props={props} sources={sources}
                onReady={setNativeReady} onSources={()=>setShowSources(true)}/>}
            {!nativeReady&&<>
            <header className="ml-home-header">
                <div className="ml-home-heading">
                    <h1 className="ml-brand">
                        {t(page === 'home' ? 'mobileLibrary.recommend' : 'mobileLibrary.libraryTitle')}
                    </h1>
                    {page === 'home' && <p>{t('mobileLibrary.discoverMoreMusic')}</p>}
                </div>
                <span className="ml-spacer" />
                <button className="ml-source" onClick={() => setShowSources(true)}>
                    {sources.online.providerLabel}
                    <ChevronDown size={15} />
                </button>
            </header>
            {page === 'library' && (
                <>
                    <div className="ml-tabs" role="group" aria-label={t('mobileLibrary.sources')}>
                        {sources.tabs.map((tab) => (
                            <button
                                key={tab.key}
                                aria-pressed={sources.tab === tab.key}
                                disabled={!!tab.disabledReason}
                                title={tab.disabledReason}
                                onClick={() => sources.setTab(tab.key)}
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
            {page === 'library' && sources.tab === 'local' ? (
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
                />
            )}
            {props.accountLayerRef &&
                createPortal(<div className="ml-account-layer" ref={props.accountLayerRef} />, document.body)}
        </main>
    );
}
export default React.memo(MobileHome);
