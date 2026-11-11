import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '../../../src/types';

// test/unit/services/nativeMinimalArtist.test.ts
const state=vi.hoisted(()=>({song:null as SongResult|null,lookup:vi.fn(),status:vi.fn()}));
vi.mock('../../../src/stores/usePlaybackStore',()=>({usePlaybackStore:{getState:()=>({currentSong:state.song})}}));
vi.mock('../../../src/components/app/search/searchCollectionAdapters',()=>({createSearchArtistCollection:(...args:unknown[])=>state.lookup(...args)}));
vi.mock('../../../src/services/onlineMusic/catalogRefs',()=>({canResolveSongCatalogRef:()=>true}));
vi.mock('../../../src/utils/appPlaybackGuards',()=>({getPlaybackSongKey:(song:SongResult)=>String(song.id),resolveNavidromePlaybackCarrier:()=>undefined}));
vi.mock('../../../src/stores/useStatusMessageStore',()=>({setStatusMessage:(...args:unknown[])=>state.status(...args)}));
vi.mock('../../../src/i18n/config',()=>({default:{t:(key:string)=>key}}));
import { openNativeMinimalArtist, registerNativeArtistOpener } from '../../../src/services/nativeMinimalArtist';

describe('native minimal artist entry',()=>{
    const navigate=vi.fn();
    beforeEach(()=>{
        vi.clearAllMocks();
        state.song={id:1,name:'Last Dance',artists:[]} as unknown as SongResult;
        state.lookup.mockResolvedValue({source:'online',providerId:'qq',id:'artist',name:'artist',type:'artist'});
        registerNativeArtistOpener(navigate);
    });
    afterEach(()=>registerNativeArtistOpener(null));
    it('uses the displayed artist when cached structured artists are absent',async()=>{
        await openNativeMinimalArtist(0,'伍佰 / China Blue');
        expect(state.lookup).toHaveBeenCalledWith(state.song,'伍佰',undefined,undefined);
        expect(navigate).toHaveBeenCalledOnce();
    });
    it('does not borrow another artist ID for the second displayed segment',async()=>{
        state.song={...state.song,artists:[{id:'wubai',name:'伍佰'}]} as SongResult;
        await openNativeMinimalArtist(1,'伍佰 / China Blue');
        expect(state.lookup).toHaveBeenCalledWith(state.song,'China Blue',undefined,undefined);
        expect(navigate).toHaveBeenCalledOnce();
    });
    it('matches structured identity by name even if its order differs from the display',async()=>{
        state.song={...state.song,artists:[{id:'china',name:'China Blue'},{id:'wubai',name:'伍佰'}]} as SongResult;
        await openNativeMinimalArtist(0,'伍佰 / China Blue');
        expect(state.lookup).toHaveBeenCalledWith(state.song,'伍佰','wubai',undefined);
    });
    it('coalesces repeated taps while resolving the same artist',async()=>{
        let resolve!:(value:unknown)=>void;
        state.lookup.mockReturnValue(new Promise(r=>{resolve=r}));
        const one=openNativeMinimalArtist(0,'伍佰');
        await openNativeMinimalArtist(0,'伍佰');
        expect(state.lookup).toHaveBeenCalledOnce();
        resolve({source:'online',id:'a',name:'伍佰',type:'artist'});await one;
        expect(navigate).toHaveBeenCalledOnce();
    });
    it('does not open an old artist after the current song changes',async()=>{
        let resolve!:(value:unknown)=>void;
        state.lookup.mockReturnValue(new Promise(r=>{resolve=r}));
        const open=openNativeMinimalArtist(0,'伍佰');
        state.song={...state.song,id:2} as SongResult;
        resolve({source:'online',id:'a',name:'伍佰',type:'artist'});await open;
        expect(navigate).not.toHaveBeenCalled();
    });
    it('gives visible feedback for an unavailable artist instead of silently returning',async()=>{
        state.lookup.mockResolvedValue(null);
        await openNativeMinimalArtist(0,'伍佰');
        expect(state.status).toHaveBeenCalledWith({type:'error',text:'search.catalogUnavailable'});
    });
    it('discards a lookup after the navigation owner unmounts',async()=>{
        let resolve!:(value:unknown)=>void;
        state.lookup.mockReturnValue(new Promise(r=>{resolve=r}));
        const open=openNativeMinimalArtist(0,'伍佰');registerNativeArtistOpener(null);
        resolve({source:'online',id:'a',name:'伍佰',type:'artist'});await open;
        expect(navigate).not.toHaveBeenCalled();
    });
});
