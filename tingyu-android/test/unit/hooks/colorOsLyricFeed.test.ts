// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import { useColorOsLyricFeed } from '@/hooks/useColorOsLyricFeed';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

// test/unit/hooks/colorOsLyricFeed.test.ts
// The rule that used to empty the island: "no lyrics right now" was published as "this track has
// no lyrics" on every track change, so a backgrounded WebView could never correct it.
const bridge=vi.hoisted(()=>({publish:vi.fn(async()=>true),clear:vi.fn(async()=>{})}));
vi.mock('@/platform/runtime',()=>({isCapacitorAndroid:()=>true}));
vi.mock('@/platform/foliaColorOsLyrics',()=>({
    getColorOsLyricsSupport:async()=>({supported:true,colorOsMajor:0,detail:'test'}),
    publishColorOsLyricInfo:bridge.publish,
    clearColorOsLyricInfo:bridge.clear,
}));

const song=(id:number)=>({id,name:`Song ${id}`,sourceRef:{kind:'online',providerId:'qq',mediaId:id},artists:[],durationMs:200000} as any);
const lyrics=(text:string)=>({lines:[{startTime:0,fullText:text}],isWordByWord:false,hasTranslation:false} as any);

it('never claims a track has no lyrics while they are still loading, and clears only that track once they are settled',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const old=usePlaybackStore.getState(),root=createRoot(document.createElement('div')),first=song(1),second=song(2);
    const Probe=({lines,current,loading}:{lines:any;current:any;loading:boolean})=>{
        useColorOsLyricFeed({lyrics:lines,song:current,duration:200,lyricsLoading:loading});
        return null;
    };
    try{
        usePlaybackStore.setState({audioSrc:'https://test.example/1.mp3'});
        await act(async()=>{root.render(h(Probe,{lines:null,current:first,loading:true}));});
        // Loading: nothing may be published or cleared.
        expect(bridge.clear).not.toHaveBeenCalled();
        expect(bridge.publish).not.toHaveBeenCalled();

        await act(async()=>{root.render(h(Probe,{lines:lyrics('hello'),current:first,loading:false}));});
        expect(bridge.publish).toHaveBeenCalledWith(expect.any(String),false,getPlaybackSongKey(first));

        // Next track settled with no lyrics: only that track is cleared - never the whole channel,
        // which would also drop the timeline already primed for the track after it.
        await act(async()=>{root.render(h(Probe,{lines:null,current:second,loading:false}));});
        expect(bridge.clear).toHaveBeenCalledWith(getPlaybackSongKey(second));
        expect(bridge.clear).not.toHaveBeenCalledWith();
    }finally{await act(()=>root.unmount());usePlaybackStore.setState(old);}
});
