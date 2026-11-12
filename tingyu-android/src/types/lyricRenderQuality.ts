// Shared canvas quality vocabulary; compatible with Folia Android 449 tuning.render.
export type LyricRenderScale = 0.5 | 0.75 | 1 | 1.5 | 2;
export type LyricAntialias = 'auto' | 'on' | 'off';
export type LyricRenderQuality = { scale: LyricRenderScale; antialias: LyricAntialias };
export type LyricRenderOverride = { scale: LyricRenderScale | 'global'; antialias: 'global' | 'on' | 'off' };
export type StageQualityPreset = 'auto' | 'high' | 'battery' | 'custom';
export type StageRenderSettings = { preset: StageQualityPreset; quality: LyricRenderQuality; modes: Record<string, LyricRenderOverride> };
