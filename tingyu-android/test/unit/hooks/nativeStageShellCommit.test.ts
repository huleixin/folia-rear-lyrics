// @vitest-environment jsdom
import {act,createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import AppShell from '@/components/app/AppShell';
import {setNativeShellPublisher} from '@/services/nativeShellCommit';
import {canPublishNativeStage} from '@/utils/nativeStageCommit';

// test/unit/hooks/nativeStageShellCommit.test.ts
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=> 'android'}}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/hooks/useAndroidMainInsets',()=>({useAndroidMainInsets:()=>{}}));
vi.mock('@/hooks/useMobileScrollbars',()=>({useMobileScrollbars:()=>{}}));
vi.mock('@/library/app/librarySuiteChoice',()=>({useActiveLibrarySuiteId:()=> 'mobile'}));
vi.mock('@/components/TitlebarDragZone',()=>({default:()=>null}));
vi.mock('@/components/WindowControls',()=>({default:()=>null}));
it('flushes a native stage only after the real shell has committed its matching DOM attributes',()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    const observed:boolean[]=[];
    setNativeShellPublisher(()=>observed.push(canPublishNativeStage('stage',document.querySelector('[data-folia-app-shell]'))));
    const props={appStyle:{},isElectronWindow:false,hideFullscreenButton:false,usesCustomWindowChrome:false,useCustomWindowRadius:false,
        showTransparentWindowBorder:false,isTitlebarRevealed:false,alwaysShowMainWindowTitlebar:false,isMainWindowClickThroughEnabled:false,
        showMainWindowClickThroughToggle:false,onToggleMainWindowClickThrough:()=>{},isDaylight:false,
        audioElement:h('audio',{'data-testid':'transport'}),children:h('div',null,'page')};
    try{
        act(()=>root.render(h(AppShell,{...props,isPlayerView:false})));
        const audio=host.querySelector('audio');expect(observed.at(-1)).toBe(false);
        for(let i=0;i<8;i++){
            act(()=>root.render(h(AppShell,{...props,isPlayerView:true})));
            expect(observed.at(-1)).toBe(true);expect(host.querySelector('audio')).toBe(audio);
            act(()=>root.render(h(AppShell,{...props,isPlayerView:false})));
            expect(observed.at(-1)).toBe(false);expect(host.querySelector('audio')).toBe(audio);
        }
    }finally{act(()=>root.unmount());host.remove();setNativeShellPublisher(()=>{})}
});
