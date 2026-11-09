// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SearchWorkspace from '@/components/app/search/SearchWorkspace';
import { useHomeSourceStore, resolveHomeSearchSource } from '@/stores/useHomeSourceStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import type { useNativeSearchPage } from '@/components/app/search/useNativeSearchPage';

// test/unit/search/searchGlobalSource.test.tsx
let native:Parameters<typeof useNativeSearchPage>[0];
vi.mock('@/components/app/search/useNativeSearchPage',()=>({useNativeSearchPage:(props:typeof native)=>{native=props;return true}}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true}));
vi.mock('@/components/app/search/useSearchSuggestions',()=>({useSearchSuggestions:()=>({items:[],status:'idle'})}));
vi.mock('react-i18next',async original=>({...await original<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/services/onlineMusic/omni',()=>({omni:{subscribeProviders:()=>()=>{},getProviderRegistryVersion:()=>0,
    getProviderSummaries:()=>[{providerId:'lx-test',availability:{configured:true}}],getProviderLabel:(source:string)=>source,
    getSearchCapabilities:()=>({song:true})}}));
vi.mock('framer-motion',async original=>({...await original<typeof import('framer-motion')>(),AnimatePresence:({children}:{children:unknown})=>children,
    motion:{section:({initial:_i,animate:_a,exit:_e,transition:_t,...props}:any)=>createElement('section',props)}}));
beforeEach(()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(0),0));
    vi.stubGlobal('cancelAnimationFrame',clearTimeout);
    vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
    vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
    useOnlineProviderAccountStore.setState({activeProviderId:'qq'});
    useHomeSourceStore.setState({source:'online'});
    useSearchNavigationStore.setState({homeViewTab:'playlist',searchSourceTab:'qq',isSearchOpen:true,searchQuery:'',searchResults:null});
});
afterEach(()=>vi.unstubAllGlobals());
const props=()=>({theme:{} as never,isDaylight:false,onClose:vi.fn(),onSubmitSearch:vi.fn(),onLoadMore:vi.fn(),onPlayTrack:vi.fn(),onAddTrackToQueue:vi.fn(),onOpenArtist:vi.fn(),onOpenAlbum:vi.fn(),onOpenSearchCollection:vi.fn(),localPlaylists:[]});
it('switches both pages through native source actions and inherits global local mode when reopened',async()=>{
    const root=createRoot(document.createElement('div'));
    try{
        await act(()=>root.render(createElement(SearchWorkspace,props())));
        for(const source of ['local','navidrome','qq'] as const){
            await act(async()=>native.switchSource(source));
            expect(native.source).toBe(source);expect(resolveHomeSearchSource()).toBe(source);
        }
        await act(()=>useHomeSourceStore.getState().setSource('local'));
        expect(native.source).toBe('local');
        await act(()=>useSearchNavigationStore.getState().hideSearchOverlay());
        await act(()=>useSearchNavigationStore.getState().restoreSearch({query:'',sourceTab:'qq'}));
        expect(native.source).toBe('local');expect(resolveHomeSearchSource()).toBe('local');
    }finally{await act(()=>root.unmount())}
});
it.each([false,true])('uses the existing provider confirmation, accepted=%s, preserving the query',async accepted=>{
    const root=createRoot(document.createElement('div')),value=props();
    const requestSwitch=vi.fn(async(source:string)=>{
        if(!accepted)return {status:'declined',providerId:source,reason:'cancelled'};
        useSearchNavigationStore.getState().resetRuntime(source);
        useOnlineProviderAccountStore.getState().setActiveProviderId(source);
        return {status:'switched',providerId:source,changed:true};
    });
    try{
        useSearchNavigationStore.setState({searchQuery:'许嵩',searchResults:[]});
        await act(()=>root.render(createElement(SearchWorkspace,{...value,account:{requestSwitch} as never})));
        await act(async()=>native.switchSource('lx-test'));
        expect(requestSwitch).toHaveBeenCalledExactlyOnceWith('lx-test');
        expect(native.source).toBe(accepted?'lx-test':'qq');
        expect(resolveHomeSearchSource()).toBe(accepted?'lx-test':'qq');
        expect(useSearchNavigationStore.getState().searchQuery).toBe('许嵩');
        expect(useSearchNavigationStore.getState().isSearchOpen).toBe(true);
        if(accepted)expect(value.onSubmitSearch).toHaveBeenCalledExactlyOnceWith('lx-test');
        else expect(value.onSubmitSearch).not.toHaveBeenCalled();
    }finally{await act(()=>root.unmount())}
});
