import { NATIVE_FIRST, nativePages } from './nativePages';
import { newChromeGeneration } from './nativeChrome';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useSettingsModalStore } from '../stores/useSettingsModalStore';
import { useSearchNavigationStore } from '../stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '../stores/useCollectionNavigationStore';
import { useMobileLibraryStore } from '../stores/useMobileLibraryStore';
import { nativeShellRoute, nativeShellHasWebOverlay } from '../utils/nativeShellState';

// src/services/nativeShellRouting.ts
// The native shell owns its UI from process start; JS only supplies destinations and data.
let installed=false;
export function installNativeShellRouting() {
    if(!NATIVE_FIRST||installed)return;installed=true;
    const generation=newChromeGeneration();let revision=0,last='';
    const publish=()=>{
        const view=useAppViewStore.getState(),settings=useSettingsModalStore.getState().settingsModalState;
        const search=useSearchNavigationStore.getState().isSearchOpen,collection=!!useCollectionNavigationStore.getState().snapshot?.stack.length;
        const index=settings.initialTab==='options'&&!settings.initialSubview&&!settings.initialAnchor&&!settings.initialVisualizerSection;
        const {route,selectedTab}=nativeShellRoute({settingsOpen:settings.isOpen,settingsIndex:index,searchOpen:search,
            collectionOpen:collection,view:view.view,libraryPage:useMobileLibraryStore.getState().page});
        const webOverlay=settings.isOpen&&document.documentElement.dataset.nativeSettingsDocument==='true'?false:
            nativeShellHasWebOverlay(document.querySelectorAll<HTMLElement>('[data-folia-keyboard-window="true"]'));
        const key=JSON.stringify({route,webOverlay,selectedTab});if(key===last)return;last=key;
        document.documentElement.dataset.nativeRoute=route;
        void nativePages.shell({generation,revision:++revision,route,webOverlay,selectedTab}).catch(error=>console.warn('[NativeShell] Route update failed',error));
    };
    [useAppViewStore,useSettingsModalStore,useSearchNavigationStore,useCollectionNavigationStore,useMobileLibraryStore].forEach(store=>store.subscribe(publish));
    const observer=new MutationObserver(records=>{if(records.some(record=>record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&
        (node.matches('[data-folia-keyboard-window]')||node.querySelector('[data-folia-keyboard-window]')))))publish()});
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-folia-keyboard-window','data-native-page']});
    publish();
}
