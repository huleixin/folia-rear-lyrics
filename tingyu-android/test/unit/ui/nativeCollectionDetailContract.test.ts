// @vitest-environment jsdom
import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useNativeCollectionPage } from '@/library/suites/mobile/native/useNativeCollectionPage';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { NativePageModel } from '@/types/nativePages';

// test/unit/ui/nativeCollectionDetailContract.test.ts
// 阶段 E 统一详情契约：歌单与专辑（及其他非歌手集合）经同一 useNativeCollectionPage
// 产出同一套 sections（toolbar/intro/controls/tracks），由 Compose 侧同一
// MediaDetailScaffold 渲染；歌名为原始名，序号由独立 number 字段承载。
const capture=vi.hoisted(()=>({model:null as any}));
vi.mock('react-i18next',async original=>({...await original<typeof import('react-i18next')>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/hooks/useNativePage',()=>({useNativePage:(_r:any,_id:any,active:boolean,model:any,_actions:any)=>{capture.model=model;return true;}}));
vi.mock('@/services/nativePages',()=>({NATIVE_FIRST:true,absolutePageImage:(v:any)=>v??''}));
vi.mock('@/services/onlineMusic/omni',()=>({omni:{getProviderLabel:()=>'QQ音乐'}}));
vi.mock('@/services/onlineMusic/songAvailability',()=>({isSongUnavailable:()=>false}));
vi.mock('@/stores/useCollectionNavigationStore',()=>({useCollectionNavigationStore:(select:any)=>select({snapshot:{stack:[{source:'online',providerId:'netease',type:'album',id:'42'}]}})}));
vi.mock('@/stores/useAppViewStore',()=>({useAppViewStore:(select:any)=>select({view:'home'})}));
vi.mock('@/stores/useSettingsModalStore',()=>({useSettingsModalStore:(select:any)=>select({settingsModalState:{isOpen:false}})}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const songs=Array.from({length:30},(_,id)=>({id,name:`Song ${id}`,artists:[],album:{id:1,name:''},durationMs:61_000}));

function renderCollection(type:'playlist'|'album'){
    const root=createRoot(document.createElement('div'));
    function Probe(){
        const ref=useRef<HTMLElement>(null);
        const model:any={view:{displayTracks:songs,matchIndexes:undefined},query:'',setQuery:()=>{},field:'original',direction:'asc',sessionKey:`qa-${type}`,
            actions:{capabilities:{scope:{enabled:true,supported:true}},playScope:()=>{},enqueueScope:()=>{}},
            mutations:{capabilities:{subscribe:{supported:type==='playlist'}},subscribed:false}};
        useNativeCollectionPage(ref,{collection:{source:'online',providerId:'netease',type,id:'42'},isInteractive:false,onBack:()=>{}} as any,
            model,'Collection',30,()=>{},()=>{},()=>{});
        return null;
    }
    act(()=>root.render(React.createElement(Probe)));
    return capture.model as NativePageModel;
}

describe('native collection detail contract (阶段 E 统一详情)',()=>{
    const playlist=renderCollection('playlist');
    const album=renderCollection('album');

    const sectionOf=(model:NativePageModel,id:string):any=>model.sections.find(s=>s.id===id);
    it('歌单与专辑产出同构 sections（toolbar/intro/controls/tracks）',()=>{
        for(const model of [playlist,album]){
            expect(model.sections.map(s=>s.id)).toEqual(expect.arrayContaining(['toolbar','intro','controls','tracks']));
            expect(sectionOf(model,'intro')).toMatchObject({layout:'rows'});
            expect(sectionOf(model,'toolbar').items.map((i:any)=>i.action)).toEqual(expect.arrayContaining(['back','filterToggle','menu']));
        }
    });
    it('专辑不再把序号拼进歌名；序号是独立 number 字段',()=>{
        const row=sectionOf(album,'tracks').items[0] as any;
        expect(row.title).toBe('Song 0');
        expect(row.number).toBe('01');
    });
    it('歌单行同样保持原始歌名 + 独立序号',()=>{
        const row=sectionOf(playlist,'tracks').items[0] as any;
        expect(row.title).toBe('Song 0');
        expect(row.number).toBe('01');
    });
    it('songHeading 仍为歌单专属；筛选区未展开时不下发（避免进页自动弹搜索层）',()=>{
        expect(sectionOf(playlist,'songHeading')).toBeTruthy();
        expect(album.sections.find(s=>s.id==='songHeading')).toBeUndefined();
        for(const model of [playlist,album]) expect(model.sections.find(s=>s.id==='filter')).toBeUndefined();
    });
});
