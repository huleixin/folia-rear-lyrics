import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import type { RearRect } from '../../utils/rearCameraSafeArea';

// src/components/visualizer/RearStageReadingArea.tsx
// Only the two native rear stages opt in. Empty subtitles never reserve a permanent lyric lane.
type Edge = 'top' | 'bottom';
const ReadingArea = createContext<RearRect | undefined>(undefined);
const ReportEdge = createContext<((edge: Edge, value: number | null) => void) | null>(null);

export function RearStageReadingProvider({ area, children }: React.PropsWithChildren<{ area: RearRect }>) {
    const [edges, setEdges] = useState<{ top: number | null; bottom: number | null }>({ top: null, bottom: null });
    const report = useCallback((edge: Edge, value: number | null) => {
        setEdges(previous => previous[edge] === value || (previous[edge] !== null && value !== null && Math.abs(previous[edge]! - value) < .25)
            ? previous : { ...previous, [edge]: value });
    }, []);
    const reading = useMemo(() => {
        const gap = Math.min(4, area.height * .02);
        // Bound auxiliary reservation to predictable lanes so readingArea remains stable during playback.
        const top = edges.top === null ? area.top : Math.max(area.top, Math.min(area.top + area.height * 0.28, edges.top + gap));
        const bottom = edges.bottom === null ? area.top + area.height : Math.min(area.top + area.height, Math.max(area.top + area.height * 0.72, edges.bottom - gap));
        return { ...area, top, height: Math.max(1, bottom - top) };
    }, [area.left, area.top, area.width, area.height, edges]);
    return <ReportEdge.Provider value={report}><ReadingArea.Provider value={reading}>{children}</ReadingArea.Provider></ReportEdge.Provider>;
}

export function useRearStageReadingArea(fallback: RearRect | undefined) {
    return useContext(ReadingArea) ?? fallback;
}

/** Measure the fitted auxiliary text, not its maximum container. No playback-frame polling. */
export function useRearStageTextEdge(ref: React.RefObject<HTMLDivElement | null>, edge: Edge, enabled: boolean, area: RearRect | null | undefined) {
    const report = useContext(ReportEdge);
    useLayoutEffect(() => {
        const host = ref.current;
        if (!report || !enabled || !host) { report?.(edge, null); return; }
        let frame = 0;
        const observed = new Set<Element>();
        const measure = () => {
            frame = 0;
            const origin = host.getBoundingClientRect();
            let value: number | null = null;
            const nodes = new Set(host.querySelectorAll('[data-rear-fitted-content] > div'));
            for (const old of observed) if (!nodes.has(old)) { resize.unobserve(old); observed.delete(old); }
            for (const node of nodes) {
                if (!observed.has(node)) { observed.add(node); resize.observe(node); }
                if (!node.textContent?.trim()) continue;
                const box = node.getBoundingClientRect();
                const coordinate = (edge === 'top' ? box.bottom : box.top) - origin.top;
                value = value === null ? coordinate : edge === 'top' ? Math.max(value, coordinate) : Math.min(value, coordinate);
            }
            report(edge, value);
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
        const resize = new ResizeObserver(schedule);
        const mutation = new MutationObserver(schedule);
        // Word-highlight transforms are intentionally excluded. Only content/size changes matter.
        mutation.observe(host, { childList: true, subtree: true, characterData: true });
        resize.observe(host);
        schedule();
        return () => { cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); report(edge, null); };
    }, [ref, report, edge, enabled, area?.left, area?.top, area?.width, area?.height]);
}
