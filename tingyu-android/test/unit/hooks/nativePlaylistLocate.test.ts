// @vitest-environment jsdom
import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useNativeCollectionPage } from '@/library/suites/mobile/native/useNativeCollectionPage';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

// test/unit/hooks/nativePlaylistLocate.test.ts
const capture=vi.hoisted(()=>({active:false,model:null as any,actions:null as any}));
vi.mock('react-i18next',async original=>({...await original<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/hooks/useNativePage',()=>({useNativePage:(_r:any,_id:any,active:boolean,model:any,actions:any)=>{Object.assign(capture,{active,model,actions});return true;}}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true,absolutePageImage:(v:any)=>v??''}));
vi.mock('@/services/onlineMusic/omni',()=>({omni:{getProviderLabel:()=> 'QQ音乐'}}));
vi.mock('@/services/onlineMusic/songAvailability',()=>({isSongUnavailable:()=>false}));
vi.mock('@/stores/useCollectionNavigationStore',()=>({useCollectionNavigationStore:(select:any)=>select({snapshot:{stack:[{source:'local',type:'playlist',id:'qa'}]}})}));
vi.mock('@/stores/useAppViewStore',()=>({useAppViewStore:(select:any)=>select({view:'home'})}));
vi.mock('@/stores/useSettingsModalStore',()=>({useSettingsModalStore:(select:any)=>select({settingsModalState:{isOpen:false}})}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

it('locates a far-away playing song, clears an excluding filter and publishes its stronger state immediately',async()=>{
    const songs=Array.from({length:400},(_,id)=>({id,name:`Track ${id}`,artists:[],album:{id:1,name:''},durationMs:1000}));
    const previous=usePlaybackStore.getState();
    usePlaybackStore.setState({currentSong:songs[250] as any,playerState:'PLAYING' as any});
    const root=createRoot(document.createElement('div'));
    function Probe(){
        const ref=useRef<HTMLElement>(null),[query,setQuery]=useState('');
        const model:any={view:{displayTracks:songs,matchIndexes:query?[1]:undefined},query,setQuery,field:'original',direction:'asc',sessionKey:'qa',
            actions:{capabilities:{scope:{enabled:true,supported:true}},playScope:()=>{},enqueueScope:()=>{}},mutations:{capabilities:{subscribe:{supported:false}}}};
        useNativeCollectionPage(ref,{collection:{source:'local',type:'playlist',id:'qa'},isInteractive:false,onBack:()=>{}} as any,model,'Playlist',400,()=>{},()=>{},()=>{});
        return null;
    }
    const section=()=>capture.model.sections.find((s:any)=>s.id==='tracks');
    try{
        await act(async()=>root.render(React.createElement(Probe)));
        expect(capture.active).toBe(true); // Native input does not wait for an invisible HTML entry timer.
        expect(section()).toMatchObject({activeIndex:250,playing:true,offset:0});
        await act(async()=>capture.actions.locateCurrent({}));
        expect(section()).toMatchObject({offset:200,locateRevision:1});
        expect(section().items[50]).toMatchObject({selected:true,id:`250:${getPlaybackSongKey(songs[250] as any)}`});
        await act(async()=>capture.actions.filter({text:'excluding current'}));
        expect(section().activeIndex).toBe(-1);
        await act(async()=>capture.actions.locateCurrent({}));
        expect(section()).toMatchObject({activeIndex:250,offset:200,locateRevision:2});
        await act(async()=>usePlaybackStore.setState({currentSong:songs[251] as any}));
        expect(section().items[50].selected).toBe(false);
        expect(section().items[51].selected).toBe(true);
    }finally{act(()=>root.unmount());usePlaybackStore.setState(previous);}
});
