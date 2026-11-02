import { afterEach, expect, it, vi } from 'vitest';
import {setRearAod} from '@/services/rearAodRuntime';
import { createRearLyricsTransport } from '@/services/rearLyricsTransport';

// test/unit/services/rearTransportSleep.test.ts
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('suspends rear polling during deliberate sleep and resumes without resetting its config revision', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    vi.stubGlobal('window', Object.assign(target, { setTimeout, clearTimeout }));
    const fetcher = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => ({
        revision: 3, ...(url.includes('revision=-1') ? { config: { theme: {} } } : {}),
        clock: { currentTime: 10, duration: 30, sentAtMs: Date.now(), playerState: 'PAUSED', playbackRate: 1 },
    }) }));
    vi.stubGlobal('fetch', fetcher);
    const config = vi.fn();
    const release = createRearLyricsTransport(() => undefined, () => undefined, false).subscribe({ config, clock: vi.fn(), audio: vi.fn(), connected: vi.fn() });
    await vi.advanceTimersByTimeAsync(350);
    expect(config).toHaveBeenCalledTimes(1);
    const power = (sleeping: boolean) => {
        const event = new Event('folia-rear-power');
        Object.defineProperty(event, 'detail', { value: { sleeping } }); target.dispatchEvent(event);
    };
    power(true);
    const before = fetcher.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetcher).toHaveBeenCalledTimes(before);
    power(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(fetcher.mock.calls.length).toBeGreaterThan(before);
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain('revision=3');
    expect(config).toHaveBeenCalledTimes(1);
    release();
    const after = fetcher.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).toHaveBeenCalledTimes(after);
});

it('deduplicates unchanged paused packets, then forwards a paused seek and playing packets',async()=>{
    vi.useFakeTimers();const target=new EventTarget();vi.stubGlobal('window',Object.assign(target,{setTimeout,clearTimeout}));
    let time=10,stamp=1,state='PAUSED';
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({revision:1,config:{theme:{}},
        clock:{currentTime:time,duration:100,playerState:state,playbackRate:1,sentAtMs:stamp},
        audio:{audioPower:0,bands:{},spectrum:[],sentAtMs:stamp}})}));
    vi.stubGlobal('fetch',fetcher);const forward=vi.fn(),clock=vi.fn(),audio=vi.fn();
    const stop=createRearLyricsTransport(()=>undefined,()=>undefined,false,{onSnapshot:forward}).subscribe({config:vi.fn(),clock,audio,connected:vi.fn()});
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(5);expect(forward).toHaveBeenCalledTimes(1);expect(clock).toHaveBeenCalledTimes(1);expect(audio).toHaveBeenCalledTimes(1);
    time=50;stamp=Date.now();await vi.advanceTimersByTimeAsync(250);expect(clock.mock.lastCall?.[0].currentTime).toBe(50);expect(audio).toHaveBeenCalledTimes(2);
    state='PLAYING';stamp=Date.now();await vi.advanceTimersByTimeAsync(250);const count=fetcher.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);expect(fetcher.mock.calls.length-count).toBe(10);
    stop();expect(vi.getTimerCount()).toBe(0);
});

it('explicit native resync reads a full fresh snapshot and drops a pre-resume response',async()=>{
    vi.useFakeTimers();const target=new EventTarget();vi.stubGlobal('window',Object.assign(target,{setTimeout,clearTimeout}));
    let resolveOld!:(value:unknown)=>void;let stateReads=0;
    const fetcher=vi.fn((url:string)=>{
        if(url.includes('/state')){
            stateReads++;
            if(stateReads===1)return new Promise(resolve=>{resolveOld=resolve;});
            return Promise.resolve({ok:true,json:async()=>({revision:2,config:{theme:{name:'Rear'},song:{id:'B',name:'B'}},clock:{currentTime:20,duration:90,sentAtMs:Date.now(),playerState:'PAUSED',playbackRate:1}})});
        }
        return Promise.resolve({ok:true,json:async()=>({})});
    });vi.stubGlobal('fetch',fetcher);
    const config=vi.fn(),stop=createRearLyricsTransport(()=>undefined,()=>undefined,false).subscribe({config,clock:vi.fn(),audio:vi.fn(),connected:vi.fn()});
    target.dispatchEvent(new Event('folia-rear-resync'));
    resolveOld({ok:true,json:async()=>({revision:1,config:{theme:{},song:{id:'A',name:'A'}}})});
    await vi.advanceTimersByTimeAsync(10);
    expect(config.mock.calls.map(c=>c[0].song?.id)).toEqual(['B']);
    expect(fetcher.mock.calls.filter(c=>String(c[0]).includes('/state')).at(-1)?.[0]).toContain('revision=-1');
    stop();expect(vi.getTimerCount()).toBe(0);
});

it('resync of the same epoch retains cached lyrics and independent visual settings',async()=>{
    vi.useFakeTimers();const target=new EventTarget();vi.stubGlobal('window',Object.assign(target,{setTimeout,clearTimeout}));
    const track={engine:'media3',songKey:'qq:A',outputSessionId:'native',epoch:'epoch-A',playing:false,positionMs:10000,durationMs:90000,lyric:'ready@1'};
    const fetcher=vi.fn(async(url:string)=>({ok:true,json:async()=>url.includes('/lyrics')?{state:'ready',lines:[{fullText:'current lyric',startTime:0,endTime:90}]}:{revision:1,config:{theme:{name:'Rear independent'},activePlaybackContext:'main',song:{id:'A',name:'A'},lyrics:{lines:[]}},track,owner:track}}));
    vi.stubGlobal('fetch',fetcher);const config=vi.fn();const stop=createRearLyricsTransport(()=>undefined,()=>undefined,false).subscribe({config,clock:vi.fn(),audio:vi.fn(),connected:vi.fn()});
    await vi.advanceTimersByTimeAsync(20);const reads=fetcher.mock.calls.filter(c=>c[0].includes('/lyrics')).length;
    expect(reads).toBe(1);target.dispatchEvent(new Event('folia-rear-resync'));await vi.advanceTimersByTimeAsync(20);
    expect(fetcher.mock.calls.filter(c=>c[0].includes('/lyrics'))).toHaveLength(reads);
    expect(config.mock.lastCall?.[0].theme.name).toBe('Rear independent');expect(config.mock.lastCall?.[0].lyrics.lines[0].fullText).toBe('current lyric');
    stop();expect(vi.getTimerCount()).toBe(0);
});

it('AOD keeps config and seek clock, skips audio and calibrates at one second',async()=>{
    vi.useFakeTimers();const target=new EventTarget();vi.stubGlobal('window',Object.assign(target,{setTimeout,clearTimeout}));
    vi.stubGlobal('document',{hidden:false,documentElement:{dataset:{}},addEventListener:vi.fn(),removeEventListener:vi.fn()});
    let pos=4;const config={song:{id:'same'},theme:{},visualizerMode:'fume',lyrics:{lines:[]}};
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({revision:1,config,clock:{currentTime:pos,duration:100,playerState:'PLAYING',playbackRate:1,sentAtMs:Date.now()},audio:{audioPower:1,bands:{},spectrum:[255],sentAtMs:Date.now()}})}));
    vi.stubGlobal('fetch',fetcher);setRearAod(true);const clock=vi.fn(),audio=vi.fn(),configured=vi.fn();
    const stop=createRearLyricsTransport(()=>{},()=>{},false).subscribe({config:configured,clock,audio,connected:vi.fn()});
    await vi.advanceTimersByTimeAsync(2100);expect(fetcher).toHaveBeenCalledTimes(3);expect(audio).not.toHaveBeenCalled();expect(configured).toHaveBeenCalledTimes(1);
    pos=65;target.dispatchEvent(new Event('folia-rear-refresh'));await vi.advanceTimersByTimeAsync(0);expect(clock.mock.calls.at(-1)?.[0].currentTime).toBe(65);
    stop();setRearAod(false);vi.clearAllTimers();
});
