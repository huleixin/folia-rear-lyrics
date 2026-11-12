import { useEffect } from "react";
import type { VisualizerMode } from "../types";

// src/hooks/useStageIdleWarmup.ts
// Load only the selected heavy stage after the first screen has settled.
export function useStageIdleWarmup(mode: VisualizerMode) {
    useEffect(() => {
        if (mode !== "nebbia" || document.documentElement.dataset.foliaSurface === "rear-lyrics-panel") return;
        let stopped = false;
        let cancelWarmup: (() => void) | undefined;
        const timer = window.setTimeout(() => {
            if (document.hidden || document.querySelector("[data-nebbia-ready]")) return;
            void import("../components/visualizer/nebbia/nebbiaShaderWarmup").then(module => {
                if (stopped) return;
                cancelWarmup = module.cancelNebbiaShaderWarmup;
                module.warmNebbiaShaders();
            }).catch(() => undefined);
            void import("../components/visualizer/nebbia/nebbiaStrokes").then(module => {
                if (!stopped) void module.loadNebbiaStrokes();
            }).catch(() => undefined);
        }, 2000);
        return () => { stopped = true; window.clearTimeout(timer); cancelWarmup?.(); };
    }, [mode]);
}
