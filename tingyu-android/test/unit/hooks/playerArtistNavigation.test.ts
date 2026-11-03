// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {usePlayerArtistNavigation} from '@/hooks/usePlayerArtistNavigation';
import {usePlaybackStore} from '@/stores/usePlaybackStore';
import {useAppViewStore} from '@/stores/useAppViewStore';
import type {Artist,SongResult} from '@/types';

// test/unit/hooks/playerArtistNavigation.test.ts
const lookup=vi.hoisted(()=>vi.fn());
vi.mock('@/components/app/search/searchCollectionAdapters',()=>({createSearchArtistCollection:lookup}));
vi.mock('@/i18n/config',()=>({default:{t:(s:string)=>s},readStoredAppLanguagePreference:()=> 'system',applyAppLanguagePreference:vi.fn()}));
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(s:string)=>s})}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const song={id:1,name:'A',artists:[{id:11,name:'Singer'}]} as SongResult;
const artist=song.artists[0] as Artist;
const collection={id:11,type:'artist',name:'Singer',source:'online',providerId:'qq'};
const setup=()=>{
    usePlaybackStore.setState({currentSong:song});useAppViewStore.setState({view:'player'});
    const node=document.createElement('div');const root=createRoot(node);const open=vi.fn();
    let invoke!:ReturnType<typeof usePlayerArtistNavigation>;
    const Harness=()=>{invoke=usePlayerArtistNavigation(open);return null;};
    act(()=>root.render(React.createElement(Harness)));
    return {open,invoke:(...args:Parameters<typeof invoke>)=>invoke(...args),close:()=>act(()=>root.unmount())};
};
it('opens a resolved artist with player return context',async()=>{
    lookup.mockResolvedValue(collection);const h=setup();
    try{await h.invoke(song,artist);expect(h.open).toHaveBeenCalledExactlyOnceWith(collection,'player');}finally{h.close();}
});
it('drops a catalog result that arrives after a song switch',async()=>{
    let done!:(x:unknown)=>void;lookup.mockReturnValue(new Promise(resolve=>done=resolve));const h=setup();
    try{const pending=h.invoke(song,artist);usePlaybackStore.setState({currentSong:{...song,id:2}});done(collection);await pending;expect(h.open).not.toHaveBeenCalled();}finally{h.close();}
});
it('drops older rapid taps and navigation away while a request is pending',async()=>{
    const resolves:((x:unknown)=>void)[]=[];lookup.mockImplementation(()=>new Promise(resolve=>resolves.push(resolve)));const h=setup();
    try{
        const first=h.invoke(song,artist);const second=h.invoke(song,artist);
        resolves[0](collection);await first;expect(h.open).not.toHaveBeenCalled();
        useAppViewStore.setState({view:'home'});resolves[1](collection);await second;expect(h.open).not.toHaveBeenCalled();
    }finally{h.close();}
});
