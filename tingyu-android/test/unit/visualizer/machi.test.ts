import { describe, expect, it, vi } from 'vitest';
import { motionValue } from 'framer-motion';
import { DEFAULT_MACHI_QUALITY, DEFAULT_MACHI_TUNING, MACHI_QUALITY_PRESETS, MACHI_SCENE_IDS } from '../../../src/components/visualizer/machi/types';
import { normalizeMachiQuality, normalizeMachiTuning, resolveMachiSceneId } from '../../../src/components/visualizer/machi/machiTuning';
import { resolveMachiRenderQuality, stepMachiDegrade } from '../../../src/components/visualizer/machi/engine/quality';
import { MachiLiveMotion } from '../../../src/components/visualizer/machi/liveMotion';
import { collectVisualizerTunings, applyVisualizerTuningsToSettings } from '../../../src/components/visualizer/tuningRegistry';
import { compressConfig, decompressConfig } from '../../../src/utils/appearanceCodec';

// test/unit/visualizer/machi.test.ts
// Machi scene selection, quality authority, and live audio mapping are kept independent of Three.
const audio = () => ({ bass: motionValue(0), lowMid: motionValue(0), mid: motionValue(0), vocal: motionValue(0), treble: motionValue(0), spectrum: motionValue(new Uint8Array(16)) });

describe('Machi Android adaptation', () => {
    it('round-trips every scene, camera and quality setting through appearance export', () => {
        const tuning = normalizeMachiTuning({ scene: 'station', camera: 'custom', views: { station: { azimuth: 30, elevation: 12, zoom: 1.5, panX: -2, panZ: 1 } }, quality: MACHI_QUALITY_PRESETS.low, motionStrength: 1.7 });
        const bundle = collectVisualizerTunings({ machiTuning: tuning });
        const restored = decompressConfig(compressConfig({ visualizerMode: 'machi', visualizerTunings: bundle }));
        const setter = vi.fn();
        applyVisualizerTuningsToSettings({ handleSetMachiTuning: setter }, restored.visualizerTunings);
        expect(restored.visualizerMode).toBe('machi');
        expect(setter).toHaveBeenCalledWith(tuning);
        expect(tuning.views.station.azimuth).toBe(30);
    });

    it('keeps a deterministic scene per song and clamps malformed settings', () => {
        expect(MACHI_SCENE_IDS).toContain(resolveMachiSceneId({ scene: 'auto' }, 'same-song'));
        expect(resolveMachiSceneId({ scene: 'auto' }, 'same-song')).toBe(resolveMachiSceneId({ scene: 'auto' }, 'same-song'));
        expect(normalizeMachiTuning({ scene: 'removed', motionStrength: Infinity }).scene).toBe('auto');
        expect(normalizeMachiTuning({ motionStrength: 8 }).motionStrength).toBe(2);
        expect(normalizeMachiTuning({ bandMotion: false }).bandMotion).toBe(false);
        expect(normalizeMachiQuality({ renderScale: 1, antialias: 'smaa' }).renderScale).toBe('global');
        expect(normalizeMachiQuality(null)).toEqual(DEFAULT_MACHI_QUALITY);
    });

    it('applies the shared mode resolution once and keeps supersampling capped', () => {
        const quality = { ...DEFAULT_MACHI_QUALITY, renderScale: 'global' as const, antialias: 'smaa' as const };
        const low = resolveMachiRenderQuality(quality, { degrade: 0, devicePixelRatio: 2, previewMode: false, global: { scale: .75, antialias: 'auto' } });
        const high = resolveMachiRenderQuality(quality, { degrade: 0, devicePixelRatio: 2, previewMode: false, global: { scale: 1.5, antialias: 'auto' } });
        expect(low.pixelRatio).toBeCloseTo(1.5);
        expect(high.pixelRatio).toBe(3);
        expect(low.inkScale).toBe(1);
    });

    it('degrades only after repeated slow windows and never trusts a single stutter', () => {
        let state = { refresh: 0, slowChecks: 0, degradedAverage: 0, displayFloor: 0 };
        let step = stepMachiDegrade(state, Array(60).fill(30));
        state = step.state;
        expect(step.degrade).toBe(false);
        step = stepMachiDegrade(state, Array(60).fill(30));
        expect(step.degrade).toBe(true);
        expect(stepMachiDegrade({ refresh: 16.7, slowChecks: 0, degradedAverage: 0, displayFloor: 0 }, Array(60).fill(16.7)).degrade).toBe(false);
    });

    it('maps real 0–255 band onsets to scene effects without a second playhead', () => {
        const bands = audio(), live = new MachiLiveMotion();
        for (let i = 0; i < 40; i++) live.sample(i / 100, bands, false);
        bands.bass.set(210); bands.lowMid.set(150); bands.mid.set(110); bands.treble.set(80);
        live.sample(.4, bands, false);
        expect(live.bands.kick).toBeGreaterThan(0);
        expect(live.hits.kinds).toContain(0);
        const before = live.hits.times.length;
        for (let i = 41; i < 90; i++) live.sample(i / 100, bands, false);
        expect(live.hits.times.length).toBe(before);
        live.sample(.9, bands, true);
        expect(live.hits.times).toEqual([]);
        bands.spectrum.set(new Uint8Array(0));
        live.sample(10, bands, false);
        expect(live.hits.times).toEqual([]);
        expect(DEFAULT_MACHI_TUNING.bandMotion).toBe(true);
    });
});
