// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNativeSearchPage } from '@/components/app/search/useNativeSearchPage';
import type { NativePageModel, PageActions } from '@/types/nativePages';

// test/unit/hooks/useNativeSearchPage.test.ts
let captured:NativePageModel,actions:PageActions;
vi.mock('@/hooks/useNativePage',()=>({useNativePage:(_ref:unknown,_id:unknown,_active:unknown,model:NativePageModel,next:PageActions)=>{captured=model;actions=next;return true}}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:false,absolutePageImage:(url:string)=>url}));
vi.mock('react-i18next',async(importOriginal)=>({...await importOriginal<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/components/app/search/SearchLanding',()=>({loadSearchDiscovery:vi.fn()}));
it('keeps the editable native screen mounted across first character, composition, submit and result tabs',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const host=document.createElement('div'),root=createRoot(host),change=vi.fn(),submit=vi.fn();
    const props={root:{current:null},active:true,query:'',source:'qq',mode:'landing',tab:'overview',tabs:['overview','song'],sources:['qq'],
        results:[],searching:false,loadingMore:false,error:null,hasMore:false,needsSetup:false,
        artists:{items:[]},albums:{items:[]},playlists:{items:[]},suggestions:{items:[],status:'idle'},historyMatches:[],
        close:vi.fn(),change,submit,selectTab:vi.fn(),switchSource:vi.fn(),sourceLabel:(s:string)=>s,
        loadMore:vi.fn(),loadExplore:vi.fn(),openHit:vi.fn(),play:vi.fn(),enqueue:vi.fn(),openArtist:vi.fn(),openAlbum:vi.fn()};
    function Probe({value}:{value:any}){useNativeSearchPage(value);return null}
    try {
        await act(()=>root.render(React.createElement(Probe,{value:props})));const key=captured!.key;
        for(const update of [{query:'w',mode:'suggest'},{query:'wo',mode:'suggest'},{query:'我',mode:'suggest'},{query:'我的歌',mode:'results'},{query:'我的歌',mode:'results',tab:'song'}]){
            await act(()=>root.render(React.createElement(Probe,{value:{...props,...update}})));
            expect(captured!.key).toBe(key);expect(captured!.sections[0]).toMatchObject({id:'query',value:update.query});
        }
        actions!.change({text:'我们',value:1});expect(change).toHaveBeenCalledWith('我们',true);
        actions!.submit({text:'我们的歌'});expect(submit).toHaveBeenCalledWith('我们的歌');
    } finally {await act(()=>root.unmount())}
});
