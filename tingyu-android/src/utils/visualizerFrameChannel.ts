import type { VisualizerFrameRate } from '../types';
import type { FrameRateLimitedRaf } from './frameRateLimiter';

// src/utils/visualizerFrameChannel.ts
// Graphics-only RAF queue. Browser/Framer UI scheduling is never replaced by this channel.
type FrameWindow = Window & { __foliaNativeRequestAnimationFrame?: typeof requestAnimationFrame; __foliaNativeCancelAnimationFrame?: typeof cancelAnimationFrame };
let owner: FrameWindow | null = null;
let queue: FrameRateLimitedRaf | null = null;
export function configureVisualizerFrameChannel(rate: VisualizerFrameRate,
    create: (request: typeof requestAnimationFrame, cancel: typeof cancelAnimationFrame, rate: VisualizerFrameRate) => FrameRateLimitedRaf) {
    const current = window as FrameWindow;
    if (owner !== current) {
        queue?.dispose(); owner = current;
        const request = current.__foliaNativeRequestAnimationFrame ?? current.requestAnimationFrame;
        const cancel = current.__foliaNativeCancelAnimationFrame ?? current.cancelAnimationFrame;
        queue = create(callback => request.call(current, callback), handle => cancel.call(current, handle), rate);
    } else queue?.setFrameRate(rate);
}
export const hasVisualizerFrameChannel = () => typeof window !== 'undefined' && owner === window && queue !== null;
export const requestVisualizerAnimationFrame = (callback: FrameRequestCallback): number => (
    hasVisualizerFrameChannel() ? queue!.requestAnimationFrame(callback) : window.requestAnimationFrame(callback)
);
export const cancelVisualizerAnimationFrame = (handle: number): void => {
    if (hasVisualizerFrameChannel()) queue!.cancelAnimationFrame(handle);
    else window.cancelAnimationFrame(handle);
};
