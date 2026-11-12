import { useEffect, useSyncExternalStore } from 'react';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { AdaptiveStageQuality } from '../utils/adaptiveStageQuality';
import { getStageAdaptiveScale, getStageAntialias, getStageRenderScale, isRearQualitySurface, setStageAdaptiveScale, subscribeStageQuality } from '../utils/stageQualityRuntime';
import { requestVisualizerAnimationFrame, cancelVisualizerAnimationFrame } from '../utils/visualizerFrameChannel';

// Components subscribe only to sparse quality decisions; samples never enter React state.
// A crossfade may briefly mount the same mode twice. Share its sampler until the last host leaves.
const monitors = new Map<string, { users: number; stop: () => void }>();
function watchQuality(mode: string, frameRate: number | 'off') {
    let monitor = monitors.get(mode);
    if (!monitor) {
        const feedback = new AdaptiveStageQuality(getStageAdaptiveScale(mode));
        let frame = 0, disposed = false;
        const tick = (now: number) => {
            if (disposed) return;
            if (document.hidden) feedback.resetWindow();
            else { const scale = feedback.sample(now, frameRate); if (scale !== null) setStageAdaptiveScale(mode, scale); }
            frame = requestVisualizerAnimationFrame(tick);
        };
        frame = requestVisualizerAnimationFrame(tick);
        monitor = { users: 0, stop: () => { disposed = true; cancelVisualizerAnimationFrame(frame); } };
        monitors.set(mode, monitor);
    }
    monitor.users++;
    return () => {
        if (--monitor.users === 0) { monitor.stop(); monitors.delete(mode); }
    };
}
export const useStageAntialias = (mode: string, fallback: boolean) => useSyncExternalStore(subscribeStageQuality, () => getStageAntialias(mode, fallback), () => fallback);
export const useStageRenderScale = (mode: string) => useSyncExternalStore(subscribeStageQuality, () => getStageRenderScale(mode), () => 1);
export function useStageQualityMonitor(mode: string, preview = false, inactive = false) {
    const settings = useVisualizerSettingsStore(state => state.stageRenderSettings);
    const frameRate = useVisualizerSettingsStore(state => state.visualizerFrameRate);
    useEffect(() => {
        if (preview || inactive || settings.preset !== 'auto' || isRearQualitySurface()) return;
        const override = settings.modes[mode]?.scale;
        if (override && override !== 'global') return;
        return watchQuality(mode, frameRate);
    }, [mode, preview, inactive, settings, frameRate]);
}
