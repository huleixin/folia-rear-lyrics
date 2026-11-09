// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { useNativeSearchPage } from '@/components/app/search/useNativeSearchPage';
import { loadSearchDiscovery } from '@/components/app/search/SearchLanding';
import type { NativePageModel, PageActions } from '@/types/nativePages';

// test/unit/hooks/nativeSearchLanding.test.ts
let model:NativePageModel,actions:PageActions;
vi.mock('@/hooks/useNativePage',()=>({useNativePage:(_root:unknown,_id:unknown,_active:unknown,next:NativePageModel,handlers:PageActions)=>{model=next;actions=handlers;return true}}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true,absolutePageImage:(value:string)=>value}));
vi.mock('react-i18next',async original=>({...await original<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/components/app/search/SearchLanding',()=>({loadSearchDiscovery:vi.fn()}));
const hot=Array.from({length:32},(_,i)=>`热搜 ${i+1}`);
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.mocked(loadSearchDiscovery).mockReset().mockResolvedValue({suggestions:[],hot})});
const props=()=>({root:{current:null},active:true,query:'',source:'qq',mode:'landing',tab:'overview',tabs:['overview','song'],sources:['qq','local','navidrome'],
    results:[],searching:false,loadingMore:false,error:null,hasMore:false,needsSetup:false,
    artists:{items:[]},albums:{items:[]},playlists:{items:[]},suggestions:{items:[],status:'idle'},historyMatches:[],
    close:vi.fn(),change:vi.fn(),submit:vi.fn(),selectTab:vi.fn(),switchSource:vi.fn(),sourceLabel:(source:string)=>source,
    loadMore:vi.fn(),loadExplore:vi.fn(),openHit:vi.fn(),play:vi.fn(),enqueue:vi.fn(),openArtist:vi.fn(),openAlbum:vi.fn()} as unknown as Parameters<typeof useNativeSearchPage>[0]);
function Probe({value}:{value:ReturnType<typeof props>}){useNativeSearchPage(value);return null}
it('defaults to ten, expands/collapses in original order and keeps keyword actions and discovery cache',async()=>{
    const root=createRoot(document.createElement('div')),value=props();
    const block=()=>model.sections.find(section=>section.id==='hot')!;
    try{
        await act(async()=>{root.render(createElement(Probe,{value}))});
        expect(block().items?.map(item=>item.title)).toEqual(hot.slice(0,10));
        expect(block()).toMatchObject({expanded:false,more:'hotExpand',moreLabel:'mobileLibrary.hotShowMore'});
        await act(()=>actions.hotExpand({}));
        expect(block().items?.map(item=>item.title)).toEqual(hot);
        expect(block()).toMatchObject({expanded:true,moreLabel:'mobileLibrary.hotShowLess'});
        actions['hot:31']({});expect(value.submit).toHaveBeenCalledWith('热搜 32');
        await act(()=>actions.hotExpand({}));
        expect(block().items).toHaveLength(10);expect(loadSearchDiscovery).toHaveBeenCalledTimes(1);
        actions['source:local']({});expect(value.switchSource).toHaveBeenCalledWith('local');
        actions['source:navidrome']({});expect(value.switchSource).toHaveBeenCalledWith('navidrome');
    }finally{await act(()=>root.unmount())}
});
it('resets expanded discovery on source change and keeps local/Navidrome free of online hot searches',async()=>{
    const root=createRoot(document.createElement('div')),value=props();
    try{
        await act(async()=>{root.render(createElement(Probe,{value}))});
        await act(()=>actions.hotExpand({}));
        for(const source of ['local','navidrome'] as const){
            await act(()=>root.render(createElement(Probe,{value:{...value,source}})));
            expect(model.sections.some(section=>section.id==='hot')).toBe(false);
        }
        await act(async()=>root.render(createElement(Probe,{value})));
        expect(model.sections.find(section=>section.id==='hot')?.items).toHaveLength(10);
    }finally{await act(()=>root.unmount())}
});
