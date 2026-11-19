import { navigationMark } from './navigationTiming';
import { NATIVE_FIRST, nativePages } from './nativePages';
import { newChromeGeneration } from './nativeChrome';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useSettingsModalStore } from '../stores/useSettingsModalStore';
import { useSearchNavigationStore } from '../stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '../stores/useCollectionNavigationStore';
import { useMobileLibraryStore } from '../stores/useMobileLibraryStore';
import { nativeShellRoute, nativeShellHasWebOverlay, resolveSettingsOverlayBacking, isTabletSettingsDualPane } from '../utils/nativeShellState';
import { collectionKey } from '../library/core/model/collectionIdentity';
import { useMotionSettingsStore, readReducedMotion } from '../stores/useMotionSettingsStore';
import { useAndroidLayoutSettingsStore } from '../stores/useAndroidLayoutSettingsStore';
import {setNativeShellPublisher,scheduleNativeShellRoute} from './nativeShellCommit';
import {canPublishNativeStage} from '../utils/nativeStageCommit';
import { isStageSurface, usePlayerViewModeStore } from '../stores/usePlayerViewModeStore';
import { composeMinimalOwnsSurface } from './nativeMinimalPlayer';
import { installNativeMotionPreferences } from './nativeMotionPreferences';

// src/services/nativeShellRouting.ts
// The native shell owns its UI from process start; JS only supplies destinations and data.
let installed=false;
export function installNativeShellRouting() {
    if(!NATIVE_FIRST||installed)return;installed=true;
    void installNativeMotionPreferences().catch(error => console.warn('[NativeShell] Motion preference unavailable', error));
    const generation=newChromeGeneration();let revision=0,last='',lastRoute='',navigationRevision=0;
    const publish=()=>{
        const view=useAppViewStore.getState(),settingsState=useSettingsModalStore.getState(),settings=settingsState.settingsModalState;
        const stack=useCollectionNavigationStore.getState().snapshot?.stack;
        const mobileLib=useMobileLibraryStore.getState();
        const hasStack=!!stack?.length;
        const localMusicSubpage=!hasStack&&mobileLib.localMusicOpen;
        const search=useSearchNavigationStore.getState().isSearchOpen,collection=hasStack||localMusicSubpage;
        const dualPane = isTabletSettingsDualPane();
        const settingsBacking=resolveSettingsOverlayBacking(settings, dualPane);
        const index=settingsBacking.settingsIndex;
        const settingsRoot=settingsBacking.settingsOwnsRoute&&!settingsState.isSubSettingsViewOpen;
        const {route,selectedTab}=nativeShellRoute({settingsOpen:settingsBacking.settingsOwnsRoute,settingsIndex:index,searchOpen:search,
            collectionOpen:collection,view:view.view,libraryPage:mobileLib.page});
        if(!canPublishNativeStage(route,document.querySelector('[data-folia-app-shell]'),composeMinimalOwnsSurface()))return;
        // Ownership follows the route, not a document flag removed during React cleanup.
        // Settings portals are captured into the same native document.
        // 设置弹窗本体不计入（第 12 轮）：关闭后退场动画还会把标记留在 DOM 上一两百毫秒，
        // 不排除的话路由会先发一帧 webOverlay=true 的 stage，极简页/舞台要多黑一拍才回来。
        const accountsQrOpen = Boolean(document.querySelector('[data-native-accounts-qr-modal="true"]'));
        const webOverlay=settings.isOpen?(settings.initialSubview==='accounts' && (!dualPane || !settingsBacking.settingsOwnsRoute || accountsQrOpen)):
            nativeShellHasWebOverlay([...document.querySelectorAll<HTMLElement>('[data-folia-keyboard-window="true"]')]
                .filter(node=>!node.closest('[data-folia-settings-overlay]')));
        const pageTarget=route==='settings'?settingsBacking.pageTarget:
            route==='collection'?(hasStack?`collection:${stack?.at(-1)?.type==='artist'?'artist:':''}${collectionKey(stack?.at(-1))}`:'collection:local-music'):'';
        // The mounted document owns nested editor identity. Do not reconstruct its flags here.
        const documentKey=document.querySelector<HTMLElement>('[data-native-document-root]')?.dataset.nativeSettingsKey;
        const entryKey=route==='settings'&&!index&&documentKey?.startsWith(pageTarget)?documentKey:pageTarget;
        const reducedMotion=readReducedMotion('uiMicroMotion');
        const playerView=usePlayerViewModeStore.getState();
        const playerPresentation=playerView.mode;
        // Preference stays minimal during a temporary stage visit. Publish the actual surface separately.
        const stageVisible=isStageSurface(playerView.mode,playerView.detour)||playerView.stageTransition==='to-minimal';
        const stageDisplayActive=route==='stage'&&isStageSurface(playerView.mode,playerView.detour)&&playerView.stageTransition!=='to-minimal'&&!webOverlay&&!view.isPanelOpen;
        // 集合详情（非歌手）按页面层级判定：route==='collection' 即栈内有集合页。
        // 歌手页维持自身产品规则（全隐藏，与 WebView data-artist-detail 一致）。
        const collectionDetail=route==='collection'&&stack?.at(-1)?.type!=='artist';
        const routeKey=JSON.stringify({route,selectedTab,pageTarget,entryKey,settingsRoot});
        if(routeKey!==lastRoute){lastRoute=routeKey;document.documentElement.dataset.nativeNavigation=`${generation}:${++navigationRevision}`;document.dispatchEvent(new Event('tingyu-native-navigation'));}
        const navigation=document.documentElement.dataset.nativeNavigation??'';
        const minimalPage=usePlayerViewModeStore.getState().page;
        // 「极简歌词页常亮」的开关值随 shell 包下发；页面状态由宿主自己判断。
        const minimalLyricsKeepOn=useAndroidLayoutSettingsStore.getState().minimalLyricsKeepOnEnabled;
        const key=JSON.stringify({route,webOverlay,selectedTab,pageTarget,entryKey,settingsRoot,reducedMotion,collectionDetail,playerPresentation,stageVisible,stageDisplayActive,minimalPage,minimalLyricsKeepOn});if(key===last)return;last=key;
        navigationMark('route-publish');
        const sent=++revision;
        const leavingStage=document.documentElement.dataset.nativeRoute==='stage'&&route!=='stage';
        if(!leavingStage)document.documentElement.dataset.nativeRoute=route;
        void nativePages.shell({generation,revision:sent,route,webOverlay,selectedTab,pageTarget,entryKey,settingsRoot,reducedMotion,navigation,collectionDetail,playerPresentation,stageVisible,stageDisplayActive,minimalPage,minimalLyricsKeepOn}).then(()=>{
            if(sent===revision)document.documentElement.dataset.nativeRoute=route;
        }).catch(error=>console.warn('[NativeShell] Route update failed',error));
    };
    setNativeShellPublisher(publish);
    [useAppViewStore,useSettingsModalStore,useSearchNavigationStore,useCollectionNavigationStore,useMobileLibraryStore,useMotionSettingsStore,usePlayerViewModeStore,useAndroidLayoutSettingsStore].forEach(store=>store.subscribe(scheduleNativeShellRoute));
    const observer=new MutationObserver(records=>{if(records.some(record=>record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element&&
        (node.matches('[data-folia-keyboard-window],[data-native-accounts-qr-modal]')||node.querySelector('[data-folia-keyboard-window],[data-native-accounts-qr-modal]')))))scheduleNativeShellRoute()});
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-folia-keyboard-window','data-native-page','data-native-settings-key','data-native-accounts-qr-modal']});
    window.addEventListener('resize', scheduleNativeShellRoute);
    publish();
}
