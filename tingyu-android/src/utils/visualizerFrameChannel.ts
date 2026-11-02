import type { VisualizerFrameRate } from '../types';
import type { FrameRateLimitedRaf } from './frameRateLimiter';

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
const lowListeners=new Set<(value:boolean)=>void>();
function scheduleLow(){if(!lowPower||renderingSuspended||lowTimer!==null||!lowCallbacks.size&&!queue?.hasPending?.()&&!backgroundQueue?.hasPending?.()&&!lowPulses.size)return;
    lowTimer=setTimeout(()=>{lowTimer=null;const batch=[...lowCallbacks];lowCallbacks.clear();
        const now=performance.now();queue?.flushPending?.(now);backgroundQueue?.flushPending?.(now);
        for(const [,callback] of batch)callback(now);for(const pulse of lowPulses)pulse(now);scheduleLow();},500);
}
export function setVisualizerLowPower(value:boolean){
    if(lowPower===value)return;lowPower=value;
    queue?.setSuspended?.(value||renderingSuspended);backgroundQueue?.setSuspended?.(value||renderingSuspended);
    if(lowTimer!==null){clearTimeout(lowTimer);lowTimer=null;}
    if(value)scheduleLow();else if(lowCallbacks.size){window.requestAnimationFrame(now=>{if(lowPower||renderingSuspended)return;const pending=[...lowCallbacks];for(const [id]of pending){const cb=lowCallbacks.get(id);if(cb){lowCallbacks.delete(id);cb(now);}}});}
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
    const update = (rate: VisualizerFrameRate) => { ticker.maxFPS = lowPower ? 2 : rate === 'off' ? 0 : rate; };
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
