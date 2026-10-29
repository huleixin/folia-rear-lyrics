import { NATIVE_FIRST, nativePages } from './nativePages';
import { newChromeGeneration } from './nativeChrome';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useSettingsModalStore } from '../stores/useSettingsModalStore';
import { useSearchNavigationStore } from '../stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '../stores/useCollectionNavigationStore';
import { useMobileLibraryStore } from '../stores/useMobileLibraryStore';
import { nativeShellRoute, nativeShellHasWebOverlay } from '../utils/nativeShellState';
import { resolveInitialSettingsSection } from '../components/modal/settings/navigation/settingsLastSection';
import { collectionKey } from '../library/core/model/collectionIdentity';
import { useMotionSettingsStore, readReducedMotion } from '../stores/useMotionSettingsStore';
import {setNativeShellPublisher,scheduleNativeShellRoute} from './nativeShellCommit';
import {canPublishNativeStage} from '../utils/nativeStageCommit';

// src/services/nativeShellRouting.ts
// The native shell owns its UI from process start; JS only supplies destinations and data.
let installed=false;
export function installNativeShellRouting() {
    if(!NATIVE_FIRST||installed)return;installed=true;
    const generation=newChromeGeneration();let revision=0,last='',lastRoute='',navigationRevision=0;
    const publish=()=>{
        const view=useAppViewStore.getState(),settings=useSettingsModalStore.getState().settingsModalState;
        const stack=useCollectionNavigationStore.getState().snapshot?.stack;
        const search=useSearchNavigationStore.getState().isSearchOpen,collection=!!stack?.length;
        const index=settings.initialTab==='options'&&!settings.initialSubview&&!settings.initialAnchor&&!settings.initialVisualizerSection;
        const {route,selectedTab}=nativeShellRoute({settingsOpen:settings.isOpen,settingsIndex:index,searchOpen:search,
            collectionOpen:collection,view:view.view,libraryPage:useMobileLibraryStore.getState().page});
        if(!canPublishNativeStage(route,document.querySelector('[data-folia-app-shell]')))return;
        // Ownership follows the route, not a document flag removed during React cleanup.
        // Settings portals are captured into the same native document.
        const webOverlay=settings.isOpen?false:
            nativeShellHasWebOverlay(document.querySelectorAll<HTMLElement>('[data-folia-keyboard-window="true"]'));
        const pageTarget=route==='settings'?(index?'settings:index':`settings:document:${settings.initialTab}:${resolveInitialSettingsSection({initialSubview:settings.initialSubview,hasInitialAnchor:!!settings.initialAnchor,isElectron:false})}:`):
            route==='collection'?`collection:${stack?.at(-1)?.type==='artist'?'artist:':''}${collectionKey(stack?.at(-1))}`:'';
        const entryKey=route==='settings'&&!index?`${pageTarget}${['visualizer','themePark','lyricFilter','globalLyricOffset','aiHelp','releaseNotes'].map(id=>settings.initialSubview===id).join(':')}`:pageTarget;
        const reducedMotion=readReducedMotion('uiMicroMotion');
        const playlistDetail=route==='collection'&&stack?.at(-1)?.type==='playlist';
        const routeKey=JSON.stringify({route,selectedTab,pageTarget,entryKey});
        if(routeKey!==lastRoute){lastRoute=routeKey;document.documentElement.dataset.nativeNavigation=`${generation}:${++navigationRevision}`;}
        const navigation=document.documentElement.dataset.nativeNavigation??'';
        const key=JSON.stringify({route,webOverlay,selectedTab,pageTarget,entryKey,reducedMotion,playlistDetail});if(key===last)return;last=key;
        const sent=++revision;
        const leavingStage=document.documentElement.dataset.nativeRoute==='stage'&&route!=='stage';
        if(!leavingStage)document.documentElement.dataset.nativeRoute=route;
        void nativePages.shell({generation,revision:sent,route,webOverlay,selectedTab,pageTarget,entryKey,reducedMotion,navigation,playlistDetail}).then(()=>{
            if(sent===revision)document.documentElement.dataset.nativeRoute=route;
        }).catch(error=>console.warn('[NativeShell] Route update failed',error));
    };
    setNativeShellPublisher(publish);
    [useAppViewStore,useSettingsModalStore,useSearchNavigationStore,useCollectionNavigationStore,useMobileLibraryStore,useMotionSettingsStore].forEach(store=>store.subscribe(scheduleNativeShellRoute));
    const observer=new MutationObserver(records=>{if(records.some(record=>record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&
        (node.matches('[data-folia-keyboard-window]')||node.querySelector('[data-folia-keyboard-window]')))))scheduleNativeShellRoute()});
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-folia-keyboard-window','data-native-page']});
    publish();
}
