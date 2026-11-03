import type { VisualizerFrameRate } from '../types';
import type { FrameRateLimitedRaf } from './frameRateLimiter';
import {createRearAodCadence,type RearAodCadenceChange} from './rearAodCadence';

// src/utils/visualizerFrameChannel.ts
// Graphics-only RAF queue. Browser/Framer UI scheduling is never replaced by this channel.
type FrameWindow = Window & { __foliaNativeRequestAnimationFrame?: typeof requestAnimationFrame; __foliaNativeCancelAnimationFrame?: typeof cancelAnimationFrame };
let owner: FrameWindow | null = null;
let queue: FrameRateLimitedRaf | null = null;
let backgroundQueue: FrameRateLimitedRaf | null = null;
const rateListeners = new Set<(rate: VisualizerFrameRate) => void>();
const suspensionListeners = new Set<(suspended: boolean) => void>();
let renderingSuspended = false;
export function setVisualizerRenderingSuspended(value: boolean): void {
    if (renderingSuspended === value) return;
    renderingSuspended = value;
    queue?.setSuspended?.(value||lowPower); backgroundQueue?.setSuspended?.(value||lowPower);
    if(value&&lowTimer!==null){clearTimeout(lowTimer);lowTimer=null;}else scheduleLow();
    for (const listener of suspensionListeners) listener(value);
}
// Rear AOD runs callbacks on a bounded timer, not a 60Hz RAF rejection loop.
let lowPower=false,nextLowHandle=1;
const lowCallbacks=new Map<number,FrameRequestCallback>();
let lowTimer:ReturnType<typeof setTimeout>|null=null;
const lowPulses=new Set<(now:number)=>void>();
let lowDemand:(()=>number|null)|null=null;
let lowEvent=false;
const cadence=createRearAodCadence();
const cadenceListeners=new Set<(change:RearAodCadenceChange)=>void>();
export const subscribeVisualizerLowPowerCadence=(listener:(change:RearAodCadenceChange)=>void)=>{cadenceListeners.add(listener);return()=>{cadenceListeners.delete(listener)};};
let lowFlushing=false,lowStartedAt=0,lastLowRun:number|null=null;
const lowStats={requests:0,late:0,workMs:0,lastDelay:0,cancelled:false};
export const getVisualizerLowPowerStats=()=>{
    const measuredMs=Math.max(0,performance.now()-lowStartedAt);
    return {...lowStats,...cadence.snapshot(),targetFps:lowPower&&!renderingSuspended&&!lowStats.cancelled&&lowStats.lastDelay>0?Math.min(30,Math.round(1000/lowStats.lastDelay)):0,
        callbackHz:measuredMs>0?lowStats.requests*1000/measuredMs:0,measuredMs,suspended:renderingSuspended,pending:lowTimer!==null};
};
export function setVisualizerLowPowerDemand(value:(()=>number|null)|null){
    lowDemand=value;
    if(value){cadence.reset();lastLowRun=null;lowStartedAt=performance.now();lowStats.requests=0;lowStats.late=0;lowStats.workMs=0;lowStats.lastDelay=0;}
    if(value)invalidateVisualizerLowPower();else{lowEvent=false;if(lowTimer!==null){clearTimeout(lowTimer);lowTimer=null;}lowStats.cancelled=true;}
}
export function invalidateVisualizerLowPower(){lowEvent=true;if(lowTimer!==null){clearTimeout(lowTimer);lowTimer=null;}scheduleLow();}
const lowListeners=new Set<(value:boolean)=>void>();
function scheduleLow(){if(!lowPower||renderingSuspended||lowFlushing||lowTimer!==null||!lowCallbacks.size&&!queue?.hasPending?.()&&!backgroundQueue?.hasPending?.()&&!lowPulses.size)return;
    const delay=lowEvent?0:lowDemand?.()??null;
    if(delay===null){lowStats.cancelled=true;return;}
    const policy=cadence.snapshot(),gap=1000/policy.cadenceFps;
    const wait=delay===0?0:Math.max(delay,policy.adaptiveFloor,lastLowRun===null?0:gap-(performance.now()-lastLowRun));
    lowStats.lastDelay=wait;lowStats.cancelled=false;const expected=performance.now()+wait;
    lowTimer=setTimeout(()=>{lowTimer=null;lowEvent=false;const batch=[...lowCallbacks];lowCallbacks.clear();
        const now=performance.now();lowStats.requests++;
        const late=Math.max(0,now-expected);lastLowRun=now;lowFlushing=true;
        try {
            queue?.flushPending?.(now);backgroundQueue?.flushPending?.(now);
            for(const [,callback] of batch)callback(now);for(const pulse of lowPulses)pulse(now);
        } finally {
            lowFlushing=false;const work=Math.max(0,performance.now()-now);lowStats.workMs+=work;
            if(late>Math.max(12,gap*.75))lowStats.late++;
            const change=cadence.sample(now,late,work,lowPower&&delay>0&&delay<=1000/30+1);
            scheduleLow();
            if(change)for(const listener of cadenceListeners)listener(change);
        }},Math.max(0,wait));
}
export function setVisualizerLowPower(value:boolean){
    if(lowPower===value)return;lowPower=value;
    cadence.reset();lastLowRun=null;
    queue?.setSuspended?.(value||renderingSuspended);backgroundQueue?.setSuspended?.(value||renderingSuspended);
    if(lowTimer!==null){clearTimeout(lowTimer);lowTimer=null;}
    if(value){lowEvent=true;scheduleLow();}else if(lowCallbacks.size){window.requestAnimationFrame(now=>{if(lowPower||renderingSuspended)return;const pending=[...lowCallbacks];for(const [id]of pending){const cb=lowCallbacks.get(id);if(cb){lowCallbacks.delete(id);cb(now);}}});}
    for(const listener of lowListeners)listener(value);
}
const backgroundRate = (rate: VisualizerFrameRate): VisualizerFrameRate => rate === 'off' ? 'off' : Math.min(30, rate) as VisualizerFrameRate;
export function configureVisualizerFrameChannel(rate: VisualizerFrameRate,
    create: (request: typeof requestAnimationFrame, cancel: typeof cancelAnimationFrame, rate: VisualizerFrameRate) => FrameRateLimitedRaf) {
    const current = window as FrameWindow;
    if (owner !== current) {
        queue?.dispose(); backgroundQueue?.dispose(); owner = current;
        const request = current.__foliaNativeRequestAnimationFrame ?? current.requestAnimationFrame;
        const cancel = current.__foliaNativeCancelAnimationFrame ?? current.cancelAnimationFrame;
        queue = create(callback => request.call(current, callback), handle => cancel.call(current, handle), rate);
        backgroundQueue = create(callback => request.call(current, callback), handle => cancel.call(current, handle), backgroundRate(rate));
    } else { queue?.setFrameRate(rate); backgroundQueue?.setFrameRate(backgroundRate(rate)); }
    queue?.setSuspended?.(renderingSuspended||lowPower); backgroundQueue?.setSuspended?.(renderingSuspended||lowPower);
    for (const listener of rateListeners) listener(rate);
}
/** Pixi owns its RAF; cap that ticker without touching browser/UI animation scheduling. */
export function bindVisualizerTickerRate(ticker: { maxFPS: number; started?: boolean; stop?: () => void; start?: () => void; update?: (now:number)=>void }): () => void {
    const update = (rate: VisualizerFrameRate) => { ticker.maxFPS = lowPower ? 0 : rate === 'off' ? 0 : rate; };
    let lowResume=false;
    const pulse=(now:number)=>ticker.update?.(now);
    const lowUpdate=()=>{
        update(queue?.getFrameRate()??'off');
        if(lowPower){lowResume=!!ticker.started;ticker.stop?.();if(lowResume)lowPulses.add(pulse);scheduleLow();}
        else{lowPulses.delete(pulse);if(lowResume&&!renderingSuspended)ticker.start?.();lowResume=false;}
    };lowListeners.add(lowUpdate);if(lowPower)lowUpdate();
    update(queue?.getFrameRate() ?? 'off'); rateListeners.add(update);
    let resume = false;
    const suspend = (value: boolean) => {
        if(value){ resume = !!ticker.started; ticker.stop?.(); }
        else if(lowPower){if(lowResume)lowPulses.add(pulse);scheduleLow();}
        else if(resume){ resume = false; ticker.start?.(); }
    };
    suspensionListeners.add(suspend); if(renderingSuspended)suspend(true);
    return () => { rateListeners.delete(update); suspensionListeners.delete(suspend);lowListeners.delete(lowUpdate);lowPulses.delete(pulse); };
}
export const hasVisualizerFrameChannel = () => typeof window !== 'undefined' && owner === window && queue !== null;
export const requestVisualizerAnimationFrame = (callback: FrameRequestCallback): number => (
    lowPower ? (()=>{const id=-(nextLowHandle++);lowCallbacks.set(id,callback);scheduleLow();return id;})() : hasVisualizerFrameChannel() ? queue!.requestAnimationFrame(callback) : window.requestAnimationFrame(callback)
);
export const cancelVisualizerAnimationFrame = (handle: number): void => {
    if(handle<0){lowCallbacks.delete(handle);return;}
    if (hasVisualizerFrameChannel()) queue!.cancelAnimationFrame(handle);
    else window.cancelAnimationFrame(handle);
};

/** Soft wallpaper has a lower budget; text, camera motion and UI keep their own cadence. */
export const requestVisualizerBackgroundFrame = (callback: FrameRequestCallback): number => (
    lowPower ? requestVisualizerAnimationFrame(callback) : hasVisualizerFrameChannel() ? backgroundQueue!.requestAnimationFrame(callback) : window.requestAnimationFrame(callback)
);
export const cancelVisualizerBackgroundFrame = (handle: number): void => {
    if(handle<0){lowCallbacks.delete(handle);return;}
    if (hasVisualizerFrameChannel()) backgroundQueue!.cancelAnimationFrame(handle);
    else window.cancelAnimationFrame(handle);
};
