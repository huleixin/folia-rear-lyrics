import { useEffect, useRef, type RefObject } from 'react';

// src/library/suites/mobile/useMiniPlayerSwipe.ts
export function resolveMiniSwipe(dx: number, velocity: number, width: number, canNext: boolean, canPrevious: boolean) {
    const direction = dx < 0 ? 'next' : 'previous';
    const allowed = direction === 'next' ? canNext : canPrevious;
    return allowed && (Math.abs(dx) >= Math.min(80, width * 0.24)
        || (Math.abs(dx) > 18 && Math.abs(velocity) > 0.45 && Math.sign(velocity) === Math.sign(dx))) ? direction : null;
}

/** Pointer motion writes transforms directly. Only a completed gesture invokes transport. */
export function useMiniPlayerSwipe(ref: RefObject<HTMLDivElement | null>, next: (() => void) | undefined,
    previous: (() => void) | undefined, canNext: boolean, canPrevious: boolean) {
    const actions = useRef({ next, previous, canNext, canPrevious });
    actions.current = { next, previous, canNext, canPrevious };
    useEffect(() => {
        const root = ref.current;
        const track = root?.querySelector<HTMLElement>('.ml-mini-track');
        const preview = root?.querySelector<HTMLElement>('.ml-mini-preview');
        if (!root || !track || !preview) return;
        let pointer = -1, startX = 0, startY = 0, lastX = 0, lastAt = 0, dx = 0, velocity = 0;
        let dragging = false, suppressClick = false, width = 1, animation: Animation | undefined, entering: Animation | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const reset = () => {
            delete root.dataset.dragging; delete root.dataset.swipe;
            track.style.transform = ''; preview.style.transform = ''; preview.style.opacity = '';
        };
        const down = (event: PointerEvent) => {
            if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element)
                || event.target.closest('.ml-mini-controls,.ty-quality-button') || root.closest('[inert]')) return;
            animation?.cancel(); entering?.cancel(); clearTimeout(timer); reset();
            pointer = event.pointerId; startX = lastX = event.clientX; startY = event.clientY;
            lastAt = event.timeStamp; dx = velocity = 0; dragging = false; suppressClick = false;
            width = track.getBoundingClientRect().width;
        };
        const move = (event: PointerEvent) => {
            if (event.pointerId !== pointer) return;
            const x = event.clientX - startX, y = event.clientY - startY;
            if (!dragging) {
                if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { pointer = -1; return; }
                if (Math.abs(x) < 6 || Math.abs(x) < Math.abs(y)) return;
                dragging = true; suppressClick = true; root.setPointerCapture(pointer); root.dataset.dragging = 'true';
            }
            event.preventDefault();
            const dt = event.timeStamp - lastAt;
            if (dt > 0) velocity = (event.clientX - lastX) / dt;
            lastX = event.clientX; lastAt = event.timeStamp;
            const allowed = x < 0 ? actions.current.canNext : actions.current.canPrevious;
            dx = allowed ? x : Math.sign(x) * Math.min(24, Math.abs(x) * 0.2);
            const direction = dx < 0 ? 'next' : 'previous'; root.dataset.swipe = direction;
            track.style.transform = `translate3d(${dx}px,0,0)`;
            preview.style.transform = `translate3d(${dx + (dx < 0 ? width : -width)}px,0,0)`;
            preview.style.opacity = allowed ? '1' : '0';
        };
        const finish = (event: PointerEvent) => {
            // Moving implicit touch capture from the song button to the root emits a bubbling
            // loss on the old button. That is not cancellation of the new root capture.
            if (event.type === 'lostpointercapture' && event.target !== root) return;
            if (event.pointerId !== pointer) return;
            pointer = -1;
            if (!dragging) return;
            dragging = false; delete root.dataset.dragging;
            const action = event.type === 'pointerup' ? resolveMiniSwipe(dx, event.timeStamp - lastAt > 120 ? 0 : velocity,
                width, actions.current.canNext, actions.current.canPrevious) : null;
            const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
            const target = action ? (action === 'next' ? -width : width) : 0;
            if (action) (action === 'next' ? actions.current.next : actions.current.previous)?.();
            animation = track.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${target}px)` }],
                { duration: reduced ? 0 : 170, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
            animation.onfinish = () => {
                animation?.cancel(); reset();
                if (action) {
                    entering = track.animate([{ transform: `translateX(${action === 'next' ? 24 : -24}px)`, opacity: 0.4 },
                        { transform: 'translateX(0)', opacity: 1 }], { duration: reduced ? 0 : 160, easing: 'ease-out' });
                }
            };
            // A browser may synthesize a click after pointerup; never open the stage after swiping.
            timer = setTimeout(() => { suppressClick = false; }, 0);
        };
        const click = (event: MouseEvent) => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); } };
        root.addEventListener('pointerdown', down); root.addEventListener('pointermove', move, { passive: false });
        root.addEventListener('pointerup', finish); root.addEventListener('pointercancel', finish);
        root.addEventListener('lostpointercapture', finish); root.addEventListener('click', click, true);
        return () => {
            clearTimeout(timer); animation?.cancel(); entering?.cancel(); reset();
            root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move);
            root.removeEventListener('pointerup', finish); root.removeEventListener('pointercancel', finish);
            root.removeEventListener('lostpointercapture', finish); root.removeEventListener('click', click, true);
        };
    }, [ref]);
}
