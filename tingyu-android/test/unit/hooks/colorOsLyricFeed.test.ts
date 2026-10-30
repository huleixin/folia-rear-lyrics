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
const bridge=vi.hoisted(()=>({
    publish:vi.fn(async(_lyricInfo:string,_hasTranslation:boolean,_songKey?:string)=>true),
    clear:vi.fn(async(_options?:{songKey?:string|null})=>{}),
}));
vi.mock('@/platform/runtime',()=>({isCapacitorAndroid:()=>true}));
vi.mock('@/platform/foliaColorOsLyrics',()=>({
    getColorOsLyricsSupport:async()=>({supported:true,colorOsMajor:0,detail:'test'}),
    publishColorOsLyricInfo:bridge.publish,
    clearColorOsLyricInfo:bridge.clear,
}));

// C2：原生后台换歌时来问「这一首的词呢」。回答这条问题需要的三层依赖都在下面，
// 因为它们正是「没词」的三种不同原因：没取到（网络）、没落盘（缓存）、没绑定对（身份）。
const prefetched=vi.hoisted(()=>new Map<string,any>());
vi.mock('@/services/prefetchService',()=>({
    getPrefetchedData:(target:any)=>prefetched.get(String(target.id))??null,
}));
const persisted=vi.hoisted(()=>new Map<string,any>());
vi.mock('@/services/onlineMusic/resourceCache',()=>({
    getSongCacheWithLegacyMigration:async(_kind:string,target:any)=>persisted.get(String(target.id))??null,
    getSongResourceCacheKey:(kind:string,target:any)=>`${kind}:${target.id}`,
}));
vi.mock('@/services/db',()=>({saveToCache:async()=>undefined}));
const omni=vi.hoisted(()=>({getLyrics:vi.fn()}));
vi.mock('@/services/onlineMusic/omni',()=>({omni}));

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

// 原生在后台换歌时，如果那一首的歌词没有被预置过（锁屏期间 WebView 不跑，原生补不了），
// 它只能先不写 lyricInfo。等 JS 真的活过来时必须能被问一次并回答，否则灵动岛会一直空到
// 下一次换歌 —— 而「下一次换歌」可能还要半小时。
it('answers a native lyric request for the track that is current',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const old=usePlaybackStore.getState(),root=createRoot(document.createElement('div')),current=song(3);
    const Probe=({lines,now}:{lines:any;now:any})=>{
        useColorOsLyricFeed({lyrics:lines,song:now,duration:200,lyricsLoading:false});
        return null;
    };
    try{
        usePlaybackStore.setState({audioSrc:'https://test.example/3.mp3'});
        await act(async()=>{root.render(h(Probe,{lines:lyrics('hello'),now:current}));});
        bridge.publish.mockClear();

        await act(async()=>{
            window.dispatchEvent(new CustomEvent('tingyu-native-lyric-request',{detail:{songKey:getPlaybackSongKey(current)}}));
        });
        expect(bridge.publish).toHaveBeenCalledWith(expect.any(String),false,getPlaybackSongKey(current));

        // The UI is still on the previous song: answering with ours would bind the wrong lyric
        // to the track the system panel is showing.
        bridge.publish.mockClear();
        await act(async()=>{
            window.dispatchEvent(new CustomEvent('tingyu-native-lyric-request',{detail:{songKey:'online:qq:999'}}));
        });
        expect(bridge.publish).not.toHaveBeenCalled();
    }finally{await act(()=>root.unmount());usePlaybackStore.setState(old);}
});

// ---- C2：后台自动切歌的补词链路 ----
//
// 现象：第一首歌词正常，Activity 进入后台，Media3 自己切到第二首 —— 第二首没有词。
// 这条链路上有三种不同的断点，用例必须分别覆盖，不能笼统断言「歌词获取失败」：
//   1) 预取拿到的词只在内存里，回填路径却只读 IndexedDB（没取到 / 没落盘）；
//   2) 回填路径从不联网，一旦两处都没有就永远空着（没取到）；
//   3) 界面还停在第一首时，请求第二首必须用第二首的身份作答（绑错歌）。
const nativeRequest=(target:any)=>window.dispatchEvent(
    new CustomEvent('tingyu-native-lyric-request',{detail:{songKey:getPlaybackSongKey(target)}}));

it('publishes the requested background track from prefetch memory, under that track s own key',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const old=usePlaybackStore.getState(),root=createRoot(document.createElement('div'));
    const first=song(11),second=song(12);
    const Probe=({lines,now}:{lines:any;now:any})=>{
        useColorOsLyricFeed({lyrics:lines,song:now,duration:200,lyricsLoading:false});
        return null;
    };
    try{
        // 界面还停在第一首（React 没跟着原生换歌），歌单里两首都在。
        usePlaybackStore.setState({audioSrc:'https://test.example/11.mp3',playQueue:[first,second]});
        // 第二首的词只在预取内存里：prefetch 从不写 IndexedDB，写盘只发生在「它是当前曲」时。
        prefetched.set('12',{lyrics:lyrics('第二首的词')});
        await act(async()=>{root.render(h(Probe,{lines:lyrics('第一首的词'),now:first}));});
        bridge.publish.mockClear();

        await act(async()=>{nativeRequest(second);});

        const call=bridge.publish.mock.calls.find(entry=>entry[2]===getPlaybackSongKey(second));
        expect(call, '第二首的时间轴必须按它自己的 songKey 发布').toBeTruthy();
        expect(String(call![0])).toContain('第二首的词');
        expect(String(call![0])).not.toContain('第一首的词');
    }finally{await act(()=>root.unmount());usePlaybackStore.setState(old);prefetched.clear();}
});

it('fetches the requested background track when no cache holds it, instead of leaving the island empty',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const old=usePlaybackStore.getState(),root=createRoot(document.createElement('div'));
    const first=song(21),second=song(22);
    const Probe=({lines,now}:{lines:any;now:any})=>{
        useColorOsLyricFeed({lyrics:lines,song:now,duration:200,lyricsLoading:false});
        return null;
    };
    try{
        usePlaybackStore.setState({audioSrc:'https://test.example/21.mp3',playQueue:[first,second]});
        omni.getLyrics.mockResolvedValue({lyrics:lyrics('联网取到的第二首')});
        await act(async()=>{root.render(h(Probe,{lines:lyrics('第一首的词'),now:first}));});
        bridge.publish.mockClear();

        await act(async()=>{nativeRequest(second);});
        await act(async()=>{await Promise.resolve();});

        expect(omni.getLyrics).toHaveBeenCalledTimes(1);
        const call=bridge.publish.mock.calls.find(entry=>entry[2]===getPlaybackSongKey(second));
        expect(call,'没缓存时必须独立取词并发布，而不是等用户打开 App').toBeTruthy();
        expect(String(call![0])).toContain('联网取到的第二首');
    }finally{await act(()=>root.unmount());usePlaybackStore.setState(old);omni.getLyrics.mockReset();}
});

it('keeps answering native requests while the UI track itself has no lyrics',async()=>{
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
    const old=usePlaybackStore.getState(),root=createRoot(document.createElement('div'));
    const first=song(31),second=song(32);
    const Probe=({lines,now}:{lines:any;now:any})=>{
        useColorOsLyricFeed({lyrics:lines,song:now,duration:200,lyricsLoading:false});
        return null;
    };
    try{
        usePlaybackStore.setState({audioSrc:'https://test.example/31.mp3',playQueue:[first,second]});
        persisted.set('32',lyrics('缓存里的第二首'));
        // 第一首本身没有词：监听器过去在这种情况下根本没挂上，原生的询问被整条丢掉。
        await act(async()=>{root.render(h(Probe,{lines:null,now:first}));});
        bridge.publish.mockClear();

        await act(async()=>{nativeRequest(second);});

        const call=bridge.publish.mock.calls.find(entry=>entry[2]===getPlaybackSongKey(second));
        expect(call).toBeTruthy();
        expect(String(call![0])).toContain('缓存里的第二首');
    }finally{await act(()=>root.unmount());usePlaybackStore.setState(old);persisted.clear();}
});
