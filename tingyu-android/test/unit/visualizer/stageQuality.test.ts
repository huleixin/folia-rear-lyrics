// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { AdaptiveStageQuality } from '../../../src/utils/adaptiveStageQuality';
import { normalizeStageRenderSettings, readStageRenderSettings, STAGE_QUALITY_STORAGE_KEY, stageModeQuality } from '../../../src/utils/stageQualitySettings';
import { getStageAntialias, getStageRenderScale, setStageAdaptiveScale, setStageRenderSettings } from '../../../src/utils/stageQualityRuntime';
import { compressConfig, decompressConfig } from '../../../src/utils/appearanceCodec';

// Exercise user-visible policy boundaries: old settings, imports, manual overrides and real cadence.
afterEach(() => { document.documentElement.removeAttribute('data-folia-surface'); setStageRenderSettings(normalizeStageRenderSettings(null)); });
describe('stage quality compatibility', () => {
    it('keeps the persisted key and restores the listener choice', () => {
        expect(STAGE_QUALITY_STORAGE_KEY).toBe('stage_render_quality');
        localStorage.setItem('stage_render_quality', JSON.stringify({ preset: 'battery' }));
        expect(readStageRenderSettings().quality).toEqual({ scale: .75, antialias: 'off' });
        localStorage.removeItem('stage_render_quality');
    });
    it('preserves original quality for existing installations and corrupt settings', () => {
        for (const raw of [null, undefined, 'wrong', { preset: '__proto__', quality: { scale: Infinity }, modes: { bad: {} } }]) {
            expect(normalizeStageRenderSettings(raw)).toEqual({ preset: 'auto', quality: { scale: 1, antialias: 'auto' }, modes: {} });
        }
    });
    it('round-trips global and per-mode choices through appearance codes', () => {
        const settings = normalizeStageRenderSettings({ preset: 'battery', modes: { sonnet: { scale: 1.5, antialias: 'on' } } });
        expect(decompressConfig(compressConfig({ stageRenderSettings: settings })).stageRenderSettings).toEqual(settings);
        expect(stageModeQuality(settings, 'sonnet')).toEqual({ scale: 1.5, antialias: 'on' });
        expect(stageModeQuality(settings, 'hanabi')).toEqual({ scale: .75, antialias: 'off' });
    });
    it('honors explicit mode overrides during auto and isolates the rear display', () => {
        setStageRenderSettings(normalizeStageRenderSettings({ preset: 'auto', modes: { sonnet: { scale: 1.5, antialias: 'off' } } }));
        setStageAdaptiveScale('sonnet', .5);
        expect(getStageRenderScale('sonnet')).toBe(1.5);
        document.documentElement.dataset.foliaSurface = 'rear-lyrics-panel';
        expect(getStageRenderScale('sonnet')).toBe(1);
        expect(getStageAntialias('sonnet', true)).toBe(true);
    });
});
describe('sustained frame feedback', () => {
    function feed(feedback: AdaptiveStageQuality, start: number, duration: number, gap: number, rate: number | 'off' = 'off') {
        for (let now = start; now < start + duration; now += gap) feedback.sample(now, rate);
        return start + duration;
    }
    it('steps down for sustained overload then recovers with hysteresis', () => {
        const feedback = new AdaptiveStageQuality();
        const now = feed(feedback, 1, 13000, 29);
        expect(feedback.scale).toBeLessThan(1);
        feed(feedback, now, 40000, 1000 / 60);
        expect(feedback.scale).toBe(1);
    });
    it('does not penalize manual 30 FPS, stable refresh changes, or background gaps', () => {
        for (const rate of [30, 'off'] as const) {
            const feedback = new AdaptiveStageQuality();
            feed(feedback, 1, 26000, 1000 / 30, rate);
            expect(feedback.scale).toBe(1);
            feedback.sample(90000, rate);
            feed(feedback, 90001, 13000, 1000 / 60, rate);
            expect(feedback.scale).toBe(1);
        }
    });
    it('does not react to a single cold-start stall', () => {
        const feedback = new AdaptiveStageQuality();
        feed(feedback, 1, 1800, 17); feedback.sample(2000, 'off');
        feed(feedback, 2017, 16000, 17);
        expect(feedback.scale).toBe(1);
    });
});
