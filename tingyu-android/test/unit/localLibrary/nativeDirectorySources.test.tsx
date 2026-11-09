// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import NativeDirectoryPage from '@/library/suites/mobile/native/NativeDirectoryPage';
import { MobileSourceSheet } from '@/library/suites/mobile/MobileHomeSources';
import { directoryContentTabs } from '@/library/suites/mobile/mobileDirectoryModel';
import { useHomeSourceStore, resolveHomeSearchSource } from '@/stores/useHomeSourceStore';
import { useSearchNavigationStore } from '@/stores/useSearchNavigationStore';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import type { NativePageModel, PageActions } from '@/types/nativePages';
import type { NativePanelModel } from '@/types/nativePanels';

// test/unit/localLibrary/nativeDirectorySources.test.tsx
let model:NativePageModel,actions:PageActions,panel:NativePanelModel,panelAction:(id:string)=>void;
vi.mock('@/hooks/useNativePage',()=>({useNativePage:(_root:unknown,_id:unknown,_active:unknown,next:NativePageModel,handlers:PageActions)=>{model=next;actions=handlers;return true}}));
vi.mock('@/services/nativePages',()=>({absolutePageImage:(value:string)=>value}));
vi.mock('react-i18next',async original=>({...await original<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/library/core/bindings/useLibraryAccount',()=>({useLibraryAccountProviders:()=>({providers:[{providerId:'qq',displayName:'QQ音乐',status:'authenticated',availability:{configured:true}}],activeProviderId:'qq'})}));
vi.mock('@/library/suites/mobile/native/OperationPanel',()=>({default:(props:{panel:NativePanelModel;onAction:(id:string)=>void})=>{panel=props.panel;panelAction=props.onAction;return null}}));
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;useHomeSourceStore.setState({source:'online'});useSearchNavigationStore.setState({homeViewTab:'playlist'});useOnlineProviderAccountStore.setState({activeProviderId:'qq'})});
const tabs=['playlist','radio','albums','local','navidrome'].map(key=>({key,label:key}));
it('keeps only supported content categories without changing legacy shared tabs',()=>{
    const unsupported=tabs.map(tab=>tab.key==='radio'?{...tab,disabledReason:'unsupported'}:tab);
    expect(directoryContentTabs(unsupported).map(tab=>tab.key)).toEqual(['playlist','albums']);
    expect(directoryContentTabs(tabs).map(tab=>tab.key)).toEqual(['playlist','radio','albums']);
    expect(tabs).toHaveLength(5);
});
it.each(['online','local','navidrome'] as const)('retains source selection and existing %s sections/actions',async source=>{
    const root=createRoot(document.createElement('div')),onSources=vi.fn(),tools=vi.fn();
    useHomeSourceStore.setState({source:source==='local'?'local':'online'});
    useSearchNavigationStore.setState({homeViewTab:source==='online'?'playlist':source});
    const sections=source==='local'?[{id:'local-sections',layout:'chips',items:['songs','albums','artists','folders'].map(id=>({id,title:id,action:id}))}]
        :source==='navidrome'?[{id:'navi-sections',layout:'chips',items:[{id:'albums',title:'Albums',action:'navi:albums'}]},{id:'connection',layout:'message',text:'连接状态'}]:[];
    const props:any={root:{current:null},props:{isInteractive:true},sources:{tabs,tab:source==='online'?'playlist':source,setTab:vi.fn(),online:{providerLabel:'QQ音乐'}},
        onSources,onReady:vi.fn(),cards:[],onOpen:vi.fn(),emptyMessage:'空资料库',route:source,sections,
        ...(source==='local'?{headingTrailing:'tools',headingTrailingLabel:'更多',extraActions:{tools}}:{})};
    try{
        await act(()=>root.render(createElement(NativeDirectoryPage,props)));
        expect(model).toMatchObject({trailing:'sources',trailingLabel:source==='local'?'mobileLibrary.localMusicSource':source==='navidrome'?'Navidrome':'QQ音乐'});
        actions.sources({});expect(onSources).toHaveBeenCalledOnce();
        const categories=model.sections.find(section=>section.id==='sources');
        if(source==='online')expect(categories?.items?.map(item=>item.title)).toEqual(['playlist','radio','albums']);
        else expect(categories).toBeUndefined();
        if(source==='local'){
            expect(model.sections.find(section=>section.id==='local-sections')?.items).toHaveLength(4);
            expect(model.sections.find(section=>section.id==='library-tools')).toMatchObject({action:'tools'});
            actions.tools({});expect(tools).toHaveBeenCalledOnce();expect(model.bottomClearance).toBe(172);
        }
        if(source==='navidrome')expect(model.sections.find(section=>section.id==='connection')?.text).toBe('连接状态');
    }finally{await act(()=>root.unmount())}
});
it('offers local and Navidrome globally and permits returning from either to QQ',async()=>{
    const root=createRoot(document.createElement('div'));
    try{
        await act(()=>root.render(createElement(MobileSourceSheet,{account:{} as never,onClose:vi.fn(),localSongCount:0,navidromeEnabled:true})));
        const block=panel.blocks[0];expect(block.kind).toBe('actions');
        if(block.kind==='actions')expect(block.items.map(item=>item.id)).toEqual(expect.arrayContaining(['source:local','source:navidrome','source:qq']));
        for(const source of ['local','navidrome','qq']){
            await act(async()=>panelAction(`source:${source}`));expect(resolveHomeSearchSource()).toBe(source);
        }
    }finally{await act(()=>root.unmount())}
});
