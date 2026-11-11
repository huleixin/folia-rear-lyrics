// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { useAppViewStore } from '@/stores/useAppViewStore';
import { usePlayerViewModeStore } from '@/stores/usePlayerViewModeStore';
import { installNativeShellRouting } from '@/services/nativeShellRouting';
import { flushNativeShellRoute } from '@/services/nativeShellCommit';

// test/unit/services/nativeShellStageVisibility.test.ts
const bridge=vi.hoisted(()=>({shell:vi.fn(),settings:{isSubSettingsViewOpen:false,settingsModalState:{isOpen:false,initialTab:'options',initialSubview:''}}}));
const observers:MutationObserver[]=[];
afterEach(()=>{observers.forEach(observer=>observer.disconnect());vi.unstubAllGlobals()});
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true,nativePages:{shell:bridge.shell}}));
vi.mock('@/services/nativeChrome',()=>({newChromeGeneration:()=>77}));
vi.mock('@/services/nativeMinimalPlayer',()=>({composeMinimalOwnsSurface:()=>true}));
vi.mock('@/services/navigationTiming',()=>({navigationMark:()=>{}}));
vi.mock('@/stores/useSettingsModalStore',()=>({useSettingsModalStore:{getState:()=>bridge.settings,subscribe:()=>()=>{}}}));
vi.mock('@/stores/useSearchNavigationStore',()=>({useSearchNavigationStore:{getState:()=>({isSearchOpen:false}),subscribe:()=>()=>{}}}));
vi.mock('@/stores/useCollectionNavigationStore',()=>({useCollectionNavigationStore:{getState:()=>({}),subscribe:()=>()=>{}}}));
vi.mock('@/stores/useMobileLibraryStore',()=>({useMobileLibraryStore:{getState:()=>({page:'home'}),subscribe:()=>()=>{}}}));
vi.mock('@/stores/useMotionSettingsStore',()=>({useMotionSettingsStore:{subscribe:()=>()=>{}},readReducedMotion:()=>false}));
vi.mock('@/stores/useAndroidLayoutSettingsStore',()=>({useAndroidLayoutSettingsStore:{getState:()=>({minimalLyricsKeepOnEnabled:false}),subscribe:()=>()=>{}}}));
vi.mock('@/components/modal/settings/navigation/settingsLastSection',()=>({resolveInitialSettingsSection:({initialSubview}:{initialSubview:string})=>initialSubview}));
vi.mock('@/components/modal/settings/rearControlModel',()=>({rearPageKey:(key:string)=>key}));

it('publishes the real stage for both entries and keeps route ownership until the latest native draw reply',async()=>{
    const Observer=globalThis.MutationObserver;
    vi.stubGlobal('MutationObserver',class extends Observer {
        constructor(callback:MutationCallback){super(callback);observers.push(this)}
    });
    const replies:Array<()=>void>=[];
    bridge.shell.mockImplementation(()=>new Promise<void>(resolve=>replies.push(resolve)));
    document.body.innerHTML='<main data-folia-app-shell data-folia-player-view="true" data-folia-player-presentation="minimal"></main>';
    useAppViewStore.setState({view:'player'});
    usePlayerViewModeStore.getState().setMode('minimal');
    installNativeShellRouting();
    expect(bridge.shell.mock.lastCall?.[0]).toMatchObject({route:'stage',playerPresentation:'minimal',stageVisible:false});
    usePlayerViewModeStore.getState().openStage();flushNativeShellRoute();
    expect(bridge.shell.mock.lastCall?.[0]).toMatchObject({route:'stage',playerPresentation:'minimal',stageVisible:true});
    usePlayerViewModeStore.getState().endStageTransition();flushNativeShellRoute();
    expect(usePlayerViewModeStore.getState().mode).toBe('minimal');
    for(const section of ['appearance','playback']) {
        bridge.settings.settingsModalState={isOpen:true,initialTab:'options',initialSubview:section};
        flushNativeShellRoute();
        expect(bridge.shell.mock.lastCall?.[0]).toMatchObject({route:'settings',stageVisible:true});
        expect(document.documentElement.dataset.nativeRoute).toBe('stage');
    }
    replies.at(-2)!();await Promise.resolve();
    expect(document.documentElement.dataset.nativeRoute).toBe('stage');
    replies.at(-1)!();await Promise.resolve();
    expect(document.documentElement.dataset.nativeRoute).toBe('settings');
    bridge.settings.settingsModalState.isOpen=false;
    usePlayerViewModeStore.getState().setMode('stage');flushNativeShellRoute();
    expect(bridge.shell.mock.lastCall?.[0]).toMatchObject({route:'stage',playerPresentation:'stage',stageVisible:true});
    usePlayerViewModeStore.getState().setMode('minimal');flushNativeShellRoute();
    usePlayerViewModeStore.getState().openStage();flushNativeShellRoute();
    usePlayerViewModeStore.getState().closeStage();flushNativeShellRoute();
    expect(bridge.shell.mock.lastCall?.[0].stageVisible).toBe(true);
    usePlayerViewModeStore.getState().endStageTransition();flushNativeShellRoute();
    expect(bridge.shell.mock.lastCall?.[0].stageVisible).toBe(false);
});
