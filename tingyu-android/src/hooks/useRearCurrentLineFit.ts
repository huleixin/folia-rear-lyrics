import { useCallback, useLayoutEffect, useRef } from 'react';
import { cancelFrame, frame, type MotionValue } from 'framer-motion';
import type { Line } from '../types';
import { getRearSafeInset } from '../utils/visualizerSurface';
import { fitRearCurrentLine, type RearRect } from '../utils/rearCameraSafeArea';

// src/hooks/useRearCurrentLineFit.ts
// Opt-in DOM counterpart of the rear Canvas/Pixi sentence fit. No React updates on animation frames.
// The correction element is a full-panel sibling of the wallpaper, with transform-origin at (0,0).
export function useRearCurrentLineFit(clock: MotionValue<number>, line: Line | null | undefined,
    selector: string, automatic = true) {
    const ref = useRef<HTMLDivElement>(null);
    const applied = useRef({ scale: 1, x: 0, y: 0 });
    const update = useCallback(() => {
        const root = ref.current, safe = getRearSafeInset();
        const time = clock.get();
        if (!root || !safe || !line || time < line.startTime || time >= line.endTime || document.hidden) return;
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        // Read all glyph rectangles together, then perform one transform write. Include final parent/word rotations.
        for (const el of root.querySelectorAll<HTMLElement>(selector)) {
            if (Number(getComputedStyle(el).opacity) < .02 || Number(getComputedStyle(el.parentElement!).opacity) < .02) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < .1 || rect.height < .1) continue;
            left = Math.min(left, rect.left); top = Math.min(top, rect.top);
            right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom);
        }
        if (!Number.isFinite(left)) return;
        const previous = applied.current;
        const original: RearRect = { left: (left - previous.x) / previous.scale,
            top: (top - previous.y) / previous.scale, width: (right - left) / previous.scale,
            height: (bottom - top) / previous.scale };
        const inset = Math.max(3, safe.width * .02);
        const target = fitRearCurrentLine(original, { left: safe.left + inset, top: safe.top + inset,
            width: safe.width - inset * 2, height: safe.height - inset * 2 });
        const next = { scale: target.scale, x: target.left - original.left * target.scale,
            y: target.top - original.top * target.scale };
        const transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
        if (root.style.transform !== transform) root.style.transform = transform;
        applied.current = next;
    }, [clock, line, selector]);
    useLayoutEffect(() => {
        applied.current = { scale: 1, x: 0, y: 0 };
        if (ref.current) ref.current.style.transform = 'none';
        if (!automatic || !getRearSafeInset()) return;
        frame.postRender(update, true);
        return () => cancelFrame(update);
    }, [automatic, update]);
    return { ref, update };
}
