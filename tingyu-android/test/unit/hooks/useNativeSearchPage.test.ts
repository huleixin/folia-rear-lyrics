// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNativeSearchPage } from '@/components/app/search/useNativeSearchPage';
import type { NativePageModel, PageActions } from '@/types/nativePages';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { PlayerState } from '@/types';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

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
        const old=usePlaybackStore.getState();
        const track={id:1,name:'Song',artists:[],album:{id:0,name:''},durationMs:200000};
        try {
            await act(()=>root.render(React.createElement(Probe,{value:{...props,query:'Song',mode:'results',tab:'song',results:[track]}})));
            const rows=()=>captured.sections.find(section=>section.id==='songs')!;
            const row=rows().items![0];actions[row.action!]({});expect(props.play).toHaveBeenCalledWith(track);
            await act(()=>usePlaybackStore.setState({currentSong:null,pendingSongKey:getPlaybackSongKey(track),activePlaybackContext:'main'}));
            expect(rows()).toMatchObject({pendingKey:getPlaybackSongKey(track),activeKey:''});
            await act(()=>usePlaybackStore.setState({currentSong:track,pendingSongKey:'',playerState:PlayerState.PLAYING}));
            expect(rows()).toMatchObject({pendingKey:'',activeKey:getPlaybackSongKey(track),playing:true});
            await act(()=>usePlaybackStore.setState({playerState:PlayerState.PAUSED}));
            expect(rows()).toMatchObject({activeKey:getPlaybackSongKey(track),playing:false});
            await act(()=>usePlaybackStore.setState({pendingSongKey:getPlaybackSongKey(track)}));
            await act(()=>usePlaybackStore.setState({pendingSongKey:''}));
            expect(rows().pendingKey).toBe('');
        } finally {await act(()=>usePlaybackStore.setState(old));}
    } finally {await act(()=>root.unmount())}
});

it.each(['artist','album','playlist'] as const)('retries only the failed %s category from overview, then opens its full result tab',async kind=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const root=createRoot(document.createElement('div'));
    const loadExplore=vi.fn(),selectTab=vi.fn();
    const empty={items:[],status:'ready',hasMore:false,offset:0,error:null};
    const props:any={root:{current:null},active:true,query:'茶汤',source:'qq',mode:'results',tab:'overview',
        tabs:['overview','song','artist','album','playlist'],sources:['qq'],results:[],searching:false,loadingMore:false,error:null,hasMore:false,needsSetup:false,
        artists:empty,albums:empty,playlists:empty,suggestions:{items:[],status:'idle'},historyMatches:[],
        close:vi.fn(),change:vi.fn(),submit:vi.fn(),selectTab,switchSource:vi.fn(),sourceLabel:(source:string)=>source,
        loadMore:vi.fn(),loadExplore,openHit:vi.fn(),play:vi.fn(),enqueue:vi.fn(),openArtist:vi.fn(),openAlbum:vi.fn()};
    const field=kind==='artist'?'artists':kind==='album'?'albums':'playlists';
    function Probe({value}:{value:any}){useNativeSearchPage(value);return null}
    try{
        await act(()=>root.render(React.createElement(Probe,{value:{...props,[field]:{...empty,status:'error',error:'QQ musicu error: 2001'}}})));
        const failed=captured.sections.find(section=>section.id===kind)!;
        expect(failed.text).toBe('search.categoryFailed');expect(failed.moreLabel).toBe('search.retry');
        actions[failed.more!]({});expect(loadExplore).toHaveBeenCalledExactlyOnceWith(kind);expect(selectTab).not.toHaveBeenCalled();
        const ready={...empty,items:[{id:'real-result',name:'真实结果',providerId:'qq'}],hasMore:true};
        await act(()=>root.render(React.createElement(Probe,{value:{...props,[field]:ready}})));
        const summary=captured.sections.find(section=>section.id===kind)!;
        expect(summary.text).toBeUndefined();expect(summary.moreLabel).toBe('search.seeAll');
        actions[summary.more!]({});expect(selectTab).toHaveBeenCalledExactlyOnceWith(kind);expect(loadExplore).toHaveBeenCalledTimes(1);
        await act(()=>root.render(React.createElement(Probe,{value:{...props,tab:kind,[field]:ready}})));
        const full=captured.sections.find(section=>section.id===kind)!;
        expect(full.moreLabel).toBe('home.loadMore');actions[full.more!]({});expect(loadExplore).toHaveBeenLastCalledWith(kind);
    }finally{await act(()=>root.unmount())}
});
