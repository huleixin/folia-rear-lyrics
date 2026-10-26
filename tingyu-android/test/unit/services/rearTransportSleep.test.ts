import { afterEach, expect, it, vi } from 'vitest';
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
