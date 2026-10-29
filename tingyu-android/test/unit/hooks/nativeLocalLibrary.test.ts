// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import NativeLocalLibrary from '@/library/suites/mobile/native/NativeLocalLibrary';

// test/unit/hooks/nativeLocalLibrary.test.ts
const state=vi.hoisted(()=>({page:null as any}));
vi.mock('@/library/suites/mobile/native/NativeDirectoryPage',()=>({default:(props:any)=>{state.page=props;return null}}));
vi.mock('@/library/core/bindings/useLibraryHomeLocal',()=>({useLibraryHomeLocal:()=>({activeSection:{key:'folders',cards:[],emptyMessage:'empty'},sections:[]})}));
vi.mock('react-i18next',async original=>({...await original<any>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/services/nativePages',()=>({absolutePageImage:(url:string)=>url??''}));
vi.mock('@/services/onlineMusic/songMetadata',()=>({getSongArtistLabel:(s:any)=>s.artists.map((a:any)=>a.name).join(','),getSongCoverUrl:(s:any)=>s.album?.coverUrl}));
it('shows and plays direct tracks alongside subfolders, with searchable paged song rows',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const songs=Array.from({length:364},(_,i)=>({id:`song-${i}`,title:`Song ${i}`,titleOrigin:'import',folderName:'external_primary/Music',duration:200000,
        importedMetadata:{artistNames:['Artist'],albumName:'Album'}}));
    songs.push({...songs[0],id:'nested',folderName:'external_primary/Music/Children'});
    const play=vi.fn(),root=createRoot(document.createElement('div'));
    try{
        await act(()=>root.render(h(NativeLocalLibrary,{root:{current:null},props:{localSongs:songs,localMusicState:{activeRow:0},isInteractive:true,
            onPlaySong:play,homeResources:{actions:{}},setLocalMusicState:vi.fn()},sources:{},onReady:vi.fn(),onSources:vi.fn()} as any)));
        await act(()=>state.page.onOpen({id:'external_primary/Music'}));
        expect(state.page.cards.map((c:any)=>c.name)).toEqual(['Children']);
        expect(state.page.tailSections[0]).toMatchObject({total:364,offset:0});expect(state.page.tailSections[0].items).toHaveLength(100);
        await act(()=>state.page.extraActions[state.page.tailSections[0].items[0].action]());
        expect(play).toHaveBeenCalledOnce();expect(play.mock.calls[0][0].localRef.songId).toBe('song-0');expect(play.mock.calls[0][1]).toHaveLength(364);
        await act(()=>state.page.extraActions.songRange({value:200}));expect(state.page.tailSections[0]).toMatchObject({offset:200});
        await act(()=>state.page.onFilter('Song 363'));expect(state.page.tailSections[0]).toMatchObject({offset:0,total:1});
        expect(state.page.tailSections[0].items[0].title).toBe('Song 363');
    }finally{await act(()=>root.unmount())}
});
