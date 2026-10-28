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
    queue?.setSuspended?.(value); backgroundQueue?.setSuspended?.(value);
    for (const listener of suspensionListeners) listener(value);
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
    queue?.setSuspended?.(renderingSuspended); backgroundQueue?.setSuspended?.(renderingSuspended);
    for (const listener of rateListeners) listener(rate);
}
/** Pixi owns its RAF; cap that ticker without touching browser/UI animation scheduling. */
export function bindVisualizerTickerRate(ticker: { maxFPS: number; started?: boolean; stop?: () => void; start?: () => void }): () => void {
    const update = (rate: VisualizerFrameRate) => { ticker.maxFPS = rate === 'off' ? 0 : rate; };
    update(queue?.getFrameRate() ?? 'off'); rateListeners.add(update);
    let resume = false;
    const suspend = (value: boolean) => {
        if(value){ resume = !!ticker.started; ticker.stop?.(); }
        else if(resume){ resume = false; ticker.start?.(); }
    };
    suspensionListeners.add(suspend); if(renderingSuspended)suspend(true);
    return () => { rateListeners.delete(update); suspensionListeners.delete(suspend); };
}
export const hasVisualizerFrameChannel = () => typeof window !== 'undefined' && owner === window && queue !== null;
export const requestVisualizerAnimationFrame = (callback: FrameRequestCallback): number => (
    hasVisualizerFrameChannel() ? queue!.requestAnimationFrame(callback) : window.requestAnimationFrame(callback)
);
export const cancelVisualizerAnimationFrame = (handle: number): void => {
    if (hasVisualizerFrameChannel()) queue!.cancelAnimationFrame(handle);
    else window.cancelAnimationFrame(handle);
};

/** Soft wallpaper has a lower budget; text, camera motion and UI keep their own cadence. */
export const requestVisualizerBackgroundFrame = (callback: FrameRequestCallback): number => (
    hasVisualizerFrameChannel() ? backgroundQueue!.requestAnimationFrame(callback) : window.requestAnimationFrame(callback)
);
export const cancelVisualizerBackgroundFrame = (handle: number): void => {
    if (hasVisualizerFrameChannel()) backgroundQueue!.cancelAnimationFrame(handle);
    else window.cancelAnimationFrame(handle);
};
