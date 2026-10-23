import React, { useEffect, useRef } from 'react';

const positions = new Map<string, { top: number; left: number }>();

// src/library/suites/mobile/MobileScrollFrame.tsx
// Native WebView scrollbars vary by vendor. These overlay cues never consume layout space.
export default function MobileScrollFrame({
    children,
    fill = false,
    className = '',
    restoreKey,
    restoreAxis = 'both',
}: React.PropsWithChildren<{
    fill?: boolean;
    className?: string;
    restoreKey?: string;
    restoreAxis?: 'both' | 'vertical';
}>) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const frame = ref.current;
        const scroll = frame?.firstElementChild as HTMLElement | null;
        if (!frame || !scroll) return;
        const saved = restoreKey ? positions.get(restoreKey) : undefined;
        if (saved) {
            scroll.scrollTop = saved.top;
            scroll.scrollLeft = restoreAxis === 'vertical' ? 0 : saved.left;
        } else if (restoreAxis === 'vertical') {
            scroll.scrollLeft = 0;
        }
        const horizontal = frame.querySelector<HTMLElement>(':scope > .ml-scroll-cue-x')!;
        const vertical = frame.querySelector<HTMLElement>(':scope > .ml-scroll-cue-y')!;
        let raf = 0;
        let idle: ReturnType<typeof setTimeout> | undefined;
        const measure = () => {
            raf = 0;
            for (const [cue, client, total, position, axis] of [
                [horizontal, scroll.clientWidth, scroll.scrollWidth, scroll.scrollLeft, 'x'],
                [vertical, scroll.clientHeight, scroll.scrollHeight, scroll.scrollTop, 'y'],
            ] as const) {
                const track = Math.max(0, client - 8);
                const size = Math.min(track, Math.max(24, (track * client) / Math.max(1, total)));
                cue.hidden = total <= client + 1;
                cue.style[axis === 'x' ? 'width' : 'height'] = `${size}px`;
                cue.style.transform = `translate${axis.toUpperCase()}(${
                    (Math.max(0, position) / Math.max(1, total - client)) * (track - size)
                }px)`;
            }
        };
        const schedule = () => {
            if (!raf) raf = requestAnimationFrame(measure);
        };
        const onScroll = () => {
            frame.dataset.scrolling = 'true';
            clearTimeout(idle);
            idle = setTimeout(() => {
                delete frame.dataset.scrolling;
            }, 1000);
            schedule();
        };
        scroll.addEventListener('scroll', onScroll, { passive: true });
        const observer = new ResizeObserver(schedule);
        observer.observe(scroll);
        measure();
        return () => {
            if (restoreKey) {
                positions.set(restoreKey, { top: scroll.scrollTop, left: restoreAxis === 'vertical' ? 0 : scroll.scrollLeft });
                if (positions.size > 32) positions.delete(positions.keys().next().value!);
            }
            scroll.removeEventListener('scroll', onScroll);
            observer.disconnect();
            cancelAnimationFrame(raf);
            clearTimeout(idle);
        };
    }, [restoreKey, restoreAxis]);
    return (
        <div ref={ref} className={`ml-scroll-frame${fill ? ' ml-scroll-frame-fill' : ''} ${className}`}>
            {children}
            <span className="ml-scroll-cue ml-scroll-cue-x" aria-hidden="true" />
            <span className="ml-scroll-cue ml-scroll-cue-y" aria-hidden="true" />
        </div>
    );
}
