import { expect,it,vi,beforeEach } from 'vitest';
import { resolveNativeQueueWindow, ONLINE_QUEUE_WINDOW, RESOLVE_TIMEOUT_MS } from '@/services/nativeQueueWindow';
import { getPlaybackSongKey } from '@/utils/appPlaybackGuards';

// test/unit/services/nativeQueueWindow.test.ts
// The window resolver is the single source of truth for "what plays next". These cases are the
// ones that used to stop a background session: a skipped track stranding the window, a hanging
// provider, and - above all - not knowing whether the playlist or just the window had ended.
const bridge=vi.hoisted(()=>({
    resolve:vi.fn(async(song:any)=>({audioUrl:`https://test.example/${song.id}.mp3` as string|null})),
    prefetched:new Map<string,any>(),
    shuffled:null as any,
}));
vi.mock('@/services/prefetchService',()=>({
    getPrefetchedData:(song:any)=>bridge.prefetched.get(String(song.id))??null,
    resolvePrefetchAudioUrl:bridge.resolve,
    updatePrefetchedAudioUrl:vi.fn(),
}));
vi.mock('@/services/nativeLocalMusic',()=>({nativeAudioUrlForRef:async(ref:string)=>`http://127.0.0.1/audio/${ref}`}));
vi.mock('@/services/nativePlaybackBridge',()=>({buildNativePlaybackPayload:(song:any)=>({title:song.name,artist:'Artist',album:'Album',coverUrl:'',duration:song.durationMs})}));
vi.mock('@/services/shufflePlayback',()=>({shufflePlayback:{active:()=>false,next:()=>bridge.shuffled,observe:()=>{},setEnabled:()=>{},setSuspended:()=>{}}}));

const song=(id:number)=>({id,name:`Song ${id}`,sourceRef:{kind:'online',providerId:'qq',mediaId:id},artists:[],durationMs:180000} as any);
const keyOf=(queue:any[],index:number)=>getPlaybackSongKey(queue[index]);
beforeEach(()=>{
    bridge.resolve.mockReset();
    bridge.resolve.mockImplementation(async(s:any)=>({audioUrl:`https://test.example/${s.id}.mp3`}));
    bridge.prefetched.clear();
    bridge.shuffled=null;
});

it('queues one bounded window of successors and reports that the playlist continues',async()=>{
    const queue=Array.from({length:12},(_,i)=>song(i+1));
    const result=await resolveNativeQueueWindow({
        songKey:keyOf(queue,0),queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    expect(result.tracks).toHaveLength(ONLINE_QUEUE_WINDOW);
    expect(result.tracks.map(track=>track.uri)).toEqual(
        queue.slice(1,1+ONLINE_QUEUE_WINDOW).map(s=>`https://test.example/${s.id}.mp3`));
    // More candidates than the window: native must not treat the drained window as the end.
    expect(result.continues).toBe(true);
});

it('reports a finished playlist when the window reaches the last track and looping is off',async()=>{
    const queue=[song(1),song(2),song(3)];
    const result=await resolveNativeQueueWindow({
        songKey:keyOf(queue,0),queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    expect(result.tracks).toHaveLength(2);
    // Only two tracks after the anchor and no wrapping: draining the window ends the session.
    expect(result.continues).toBe(false);
});

it('keeps the session open at the end of a repeating playlist',async()=>{
    const queue=[song(1),song(2)];
    const result=await resolveNativeQueueWindow({
        songKey:keyOf(queue,0),queue,localSongs:[],quality:'high',loop:'all',shuffleActive:false,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    expect(result.tracks.map(track=>track.uri)).toEqual(['https://test.example/2.mp3']);
    expect(result.continues).toBe(true);
});

it('skips an unresolvable track instead of stranding the window behind it',async()=>{
    const queue=[song(1),song(2),song(3),song(4)];
    const anchor=keyOf(queue,0);
    bridge.resolve.mockImplementation(async(s:any)=>s.id===2?{audioUrl:null}:{audioUrl:`https://test.example/${s.id}.mp3`});
    const result=await resolveNativeQueueWindow({
        songKey:anchor,queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    // Track 2 failed; 3 and 4 are still queued - the old resolver broke out of the loop here.
    expect(result.tracks.map(track=>track.uri)).toEqual([
        'https://test.example/3.mp3','https://test.example/4.mp3',
    ]);
});

it('does not wait forever on a provider that never answers',async()=>{
    vi.useFakeTimers();
    try{
        const queue=[song(1),song(2)];
        const anchor=keyOf(queue,0);
        bridge.resolve.mockImplementation(()=>new Promise(()=>{}));
        const pending=resolveNativeQueueWindow({
            songKey:anchor,queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
            signal:new AbortController().signal,isCurrent:()=>true,
        });
        await vi.advanceTimersByTimeAsync(RESOLVE_TIMEOUT_MS+50);
        const result=await pending;
        expect(result.tracks).toHaveLength(0);
    }finally{vi.useRealTimers();}
});

it('only offers the shuffled pick when shuffle owns the order',async()=>{
    const queue=[song(1),song(2),song(3)];
    const anchor=keyOf(queue,0);
    bridge.shuffled=song(3);
    const result=await resolveNativeQueueWindow({
        songKey:anchor,queue,localSongs:[],quality:'high',loop:'off',shuffleActive:true,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    expect(result.tracks.map(track=>track.uri)).toEqual(['https://test.example/3.mp3']);
});

// --- 三态判定 ---------------------------------------------------------------
// 与 `continues` 的区别是这次修复的核心：`continues:false` 曾经有三个来源（真正播完、
// 被取消、锚点找不到），原生把它们全都当成「歌单结束」并从此不再请求。判定必须分清
// 「关于队列的结论」和「关于这次解析的结论」。

it('reports a genuinely finished playlist as finished',async()=>{
    const queue=[song(1),song(2),song(3)];
    const result=await resolveNativeQueueWindow({
        songKey:keyOf(queue,0),queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    expect(result.verdict).toBe('finished');
    expect(result.continues).toBe(false);
});

it('reports a continued playlist as continuing',async()=>{
    const queue=Array.from({length:12},(_,i)=>song(i+1));
    const result=await resolveNativeQueueWindow({
        songKey:keyOf(queue,0),queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    expect(result.verdict).toBe('continues');
});

it('an aborted resolve says unknown instead of ending the playlist',async()=>{
    const queue=[song(1),song(2)];
    const controller=new AbortController();
    const pending=resolveNativeQueueWindow({
        songKey:keyOf(queue,0),queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
        signal:controller.signal,isCurrent:()=>true,
    });
    controller.abort();
    const result=await pending;
    expect(result.verdict).toBe('unknown');
    expect(result.continues).toBe(true);
});

it('an anchor the queue no longer holds says unknown instead of ending the playlist',async()=>{
    const queue=[song(1),song(2)];
    const result=await resolveNativeQueueWindow({
        songKey:'online:qq:999',queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    expect(result.tracks).toHaveLength(0);
    expect(result.verdict).toBe('unknown');
    expect(result.continues).toBe(true);
});

it('a window where every candidate failed says unknown instead of finished',async()=>{
    const queue=[song(1),song(2)];
    bridge.resolve.mockImplementation(async()=>({audioUrl:null}));
    const result=await resolveNativeQueueWindow({
        songKey:keyOf(queue,0),queue,localSongs:[],quality:'high',loop:'off',shuffleActive:false,
        signal:new AbortController().signal,isCurrent:()=>true,
    });
    expect(result.tracks).toHaveLength(0);
    expect(result.verdict).toBe('unknown');
});
