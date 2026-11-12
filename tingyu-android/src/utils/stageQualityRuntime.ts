import type { StageRenderSettings } from '../types/lyricRenderQuality';
import { readStageRenderSettings, stageModeQuality } from './stageQualitySettings';
import { resolveLyricAntialias } from './lyricRenderQuality';

// Low-frequency render policy bus. It has no store imports and cannot pull a renderer at startup.
let settings = readStageRenderSettings();
let revision = 0;
const adaptive = new Map<string, number>();
const listeners = new Set<() => void>();
export const getStageQualityRevision = () => revision;
export const getStageAdaptiveScale = (mode: string) => adaptive.get(mode) ?? 1;
export const subscribeStageQuality = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const isRearQualitySurface = () => typeof document !== 'undefined' && document.documentElement.dataset.foliaSurface === 'rear-lyrics-panel';
function emit() { revision++; for (const listener of listeners) listener(); }
export function setStageRenderSettings(next: StageRenderSettings) { settings = next; adaptive.clear(); emit(); }
export function setStageAdaptiveScale(mode: string, scale: number) {
    if (settings.preset !== 'auto' || isRearQualitySurface() || settings.modes[mode]?.scale && settings.modes[mode].scale !== 'global') return;
    if (adaptive.get(mode) === scale) return;
    adaptive.set(mode, scale); emit();
}
export function getStageRenderScale(mode: string) {
    if (isRearQualitySurface()) return 1;
    const quality = stageModeQuality(settings, mode);
    return quality.scale * (settings.preset === 'auto' ? adaptive.get(mode) ?? 1 : 1);
}
export function getStageAntialias(mode: string, fallback: boolean) {
    return isRearQualitySurface() ? fallback : resolveLyricAntialias(stageModeQuality(settings, mode).antialias, fallback);
}
