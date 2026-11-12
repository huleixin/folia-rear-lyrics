import type { LyricRenderQuality, StageRenderSettings, StageQualityPreset } from '../types/lyricRenderQuality';
import { isBuiltinVisualizerMode } from '../types/visualizerModes';
import { normalizeLyricRenderOverride, normalizeLyricRenderQuality, resolveLyricRenderQuality } from './lyricRenderQuality';

// Pure validation and persistence for the existing graphics settings page.
export const STAGE_QUALITY_STORAGE_KEY = 'stage_render_quality';
export const STAGE_QUALITY_PRESETS: Record<StageQualityPreset, LyricRenderQuality> = {
    auto: { scale: 1, antialias: 'auto' }, high: { scale: 1.5, antialias: 'on' },
    battery: { scale: 0.75, antialias: 'off' }, custom: { scale: 1, antialias: 'auto' },
};
export function normalizeStageRenderSettings(raw: unknown): StageRenderSettings {
    const input = raw && typeof raw === 'object' ? raw as Partial<StageRenderSettings> : {};
    const preset = input.preset && Object.hasOwn(STAGE_QUALITY_PRESETS, input.preset) ? input.preset : 'auto';
    const modes: StageRenderSettings['modes'] = {};
    if (input.modes && typeof input.modes === 'object') {
        for (const [mode, override] of Object.entries(input.modes)) {
            if (isBuiltinVisualizerMode(mode)) modes[mode] = normalizeLyricRenderOverride(override);
        }
    }
    return { preset, quality: normalizeLyricRenderQuality(preset === 'custom' ? input.quality : STAGE_QUALITY_PRESETS[preset]), modes };
}
export function readStageRenderSettings(): StageRenderSettings {
    try { return normalizeStageRenderSettings(JSON.parse(localStorage.getItem(STAGE_QUALITY_STORAGE_KEY) || 'null')); }
    catch { return normalizeStageRenderSettings(null); }
}
export function stageModeQuality(settings: StageRenderSettings, mode: string): LyricRenderQuality {
    return resolveLyricRenderQuality(settings.quality, settings.modes[mode]);
}
