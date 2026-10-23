// src/library/suites/mobile/mobileFooterMotion.ts
// Translation only: keep lens geometry, playback nodes and the footer's layout footprint stable.
export const FOOTER_SLIDE_MS = 280;
const SLIDE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export function createMobileFooterMotion(footer: HTMLElement, mini: HTMLElement, nav: HTMLElement) {
    const active = new Map<HTMLElement, Animation>();
    const original = [mini, nav].map(node => ({ node, transform: node.style.transform, opacity: node.style.opacity, visibility: node.style.visibility }));
    let previous: { detail: boolean; calm: boolean; distance: number } | null = null;
    let disposed = false;

    const stop = (node: HTMLElement) => {
        const animation = active.get(node);
        if (!animation) return;
        animation.onfinish = null;
        animation.cancel();
        active.delete(node);
    };
    const settle = (node: HTMLElement, target: { transform: string; opacity?: string }, finished?: () => void) => {
        node.style.transform = target.transform;
        if (target.opacity !== undefined) node.style.opacity = target.opacity;
        finished?.();
    };
    const move = (node: HTMLElement, target: { transform: string; opacity?: string }, duration: number, delay = 0, finished?: () => void) => {
        // Read the composited pose BEFORE cancelling the old animation, so reversals never reset.
        const computed = getComputedStyle(node);
        const from = { transform: computed.transform || 'none', ...(target.opacity === undefined ? {} : { opacity: computed.opacity || '1' }) };
        stop(node);
        if (!duration || typeof node.animate !== 'function') { settle(node, target, finished); return; }
        const animation = node.animate([from, target], { duration, delay, easing: SLIDE_EASING, fill: 'both' });
        active.set(node, animation);
        animation.onfinish = () => {
            if (disposed || active.get(node) !== animation) return;
            // Commit at the final composited pose; no scale or layout change reaches the glass lens.
            settle(node, target, finished);
            animation.onfinish = null;
            animation.cancel();
            active.delete(node);
        };
    };
    const update = (detail: boolean, calm: boolean) => {
        if (disposed) return;
        const gap = Number.parseFloat(getComputedStyle(footer).rowGap) || 0;
        const distance = nav.getBoundingClientRect().height + gap;
        if (previous?.detail === detail && previous.calm === calm && previous.distance === distance) return;
        const initial = previous === null;
        const interrupted = active.has(mini);
        const target = { transform: `translateY(${detail ? distance : 0}px)` };
        previous = { detail, calm, distance };
        nav.style.visibility = 'visible';
        move(mini, target, initial || calm ? 0 : detail && !interrupted ? FOOTER_SLIDE_MS - 40 : FOOTER_SLIDE_MS,
            !initial && !calm && detail && !interrupted ? 40 : 0);
        move(nav, { opacity: detail ? '0' : '1', transform: `translateY(${detail && !calm ? 8 : 0}px)` },
            initial ? 0 : calm ? 60 : 120, !initial && !calm && !detail && !interrupted ? 160 : 0,
            () => { nav.style.visibility = detail ? 'hidden' : 'visible'; });
    };
    return {
        update,
        resize() { if (previous) update(previous.detail, previous.calm); },
        destroy() {
            disposed = true;
            stop(mini); stop(nav);
            for (const { node, transform, opacity, visibility } of original) {
                node.style.transform = transform; node.style.opacity = opacity; node.style.visibility = visibility;
            }
        },
    };
}
