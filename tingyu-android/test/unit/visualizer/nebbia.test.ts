import { describe, expect, it, vi } from 'vitest';
import { NebbiaProgramBuild } from '../../../src/components/visualizer/nebbia/nebbiaPrograms';
import { collectVisualizerTunings, applyVisualizerTuningsToSettings } from '../../../src/components/visualizer/tuningRegistry';
import { compressConfig, decompressConfig } from '../../../src/utils/appearanceCodec';
import { motionValue } from 'framer-motion';
import { StageBandMotion } from '../../../src/components/visualizer/stageBandMotion';
import { normalizeNebbiaTuning, readNebbiaRender } from '../../../src/components/visualizer/nebbia/nebbiaTuning';
import { DEFAULT_NEBBIA_TUNING } from '../../../src/components/visualizer/nebbia/types';
import { buildNebbiaScene, buildNebbiaSceneAsync } from '../../../src/components/visualizer/nebbia/nebbiaScene';
import { buildNebbiaLines } from '../../../src/components/visualizer/nebbia/nebbiaChars';
import { measureGlyph, type NebbiaGlyphCache } from '../../../src/components/visualizer/nebbia/nebbiaGlyphs';

// test/unit/visualizer/nebbia.test.ts
// Live spectrum boundaries and async layout must preserve the original handwriting schedule.
const audio = () => ({bass:motionValue(0),lowMid:motionValue(0),mid:motionValue(0),vocal:motionValue(0),treble:motionValue(0),spectrum:motionValue(new Uint8Array(16))});
describe('Nebbia Android adaptation', () => {
    it('round-trips the registered mode settings through appearance export and import', () => {
        const tuning = normalizeNebbiaTuning({ behind: 'aquarium', glass: 'snow', motionStrength: 1.6 });
        const bundle = collectVisualizerTunings({ nebbiaTuning: tuning });
        const restored = decompressConfig(compressConfig({ visualizerMode: 'nebbia', visualizerTunings: bundle }));
        const setter = vi.fn();
        applyVisualizerTuningsToSettings({ handleSetNebbiaTuning: setter }, restored.visualizerTunings);
        expect(restored.visualizerMode).toBe('nebbia');
        expect(setter).toHaveBeenCalledWith(tuning);
    });
    it('does not synchronously lose a context while its shaders are compiling', () => {
        vi.useFakeTimers();
        vi.stubGlobal('window', globalThis);
        try {
            let ready = false;
            const loseContext = vi.fn();
            const build = { gl: { isContextLost: () => false, getProgramParameter: () => ready }, parallel: { COMPLETION_STATUS_KHR: 1 }, programs: { main: {} }, done: false };
            NebbiaProgramBuild.prototype.disposeContext.call(build as unknown as NebbiaProgramBuild, { loseContext } as unknown as WEBGL_lose_context);
            expect(loseContext).not.toHaveBeenCalled();
            vi.advanceTimersByTime(200); expect(loseContext).not.toHaveBeenCalled();
            ready = true; vi.advanceTimersByTime(100);
            expect(loseContext).toHaveBeenCalledTimes(1);
            expect(vi.getTimerCount()).toBe(0);
        } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
    });
    it('detects real 0–255 onsets without turning sustained notes into repeated kicks', () => {
        const bands = audio(), motion = new StageBandMotion();
        for (let i=0;i<40;i++) motion.sample(i/100,bands,false);
        const events = motion.events;
        bands.bass.set(180); motion.sample(.4,bands,false);
        expect(motion.kick).toBeGreaterThan(0); expect(motion.events).toHaveLength(1);
        expect(motion.events).toBe(events);
        for(let i=41;i<200;i++) motion.sample(i/100,bands,false);
        expect(motion.events).toHaveLength(1); expect(motion.kick).toBe(0);
        bands.bass.set(0);
        for (let i=200;i<280;i++) motion.sample(i/100,bands,false);
        bands.bass.set(200);motion.sample(2.8,bands,false);
        expect(motion.events).toHaveLength(2);
    });
    it('discards stale events across pauses, seeks and the no-spectrum breathing fallback', () => {
        const bands=audio(), motion=new StageBandMotion();
        motion.sample(0,bands,false);motion.sample(.3,bands,false);bands.bass.set(200);motion.sample(.4,bands,false);
        expect(motion.events).toHaveLength(1);
        motion.sample(.4,bands,true); expect(motion.events).toEqual([]);
        motion.sample(40,bands,false);expect(motion.kick).toBe(0);
        motion.sample(2,bands,false);expect(motion.events).toEqual([]);
        bands.spectrum.set(new Uint8Array(0));
        for(let i=0;i<100;i++){bands.bass.set(i%2?200:0);motion.sample(2+i/100,bands,false);}
        expect(motion.events).toEqual([]);
    });
    it('migrates old settings and keeps intentional empty scenery', () => {
        expect(normalizeNebbiaTuning({behind:'aquarium'}).glass).toBe('dew');
        expect(normalizeNebbiaTuning({appearMode:'write',fadeMode:'mix',scenery:[]}).appear).toEqual(['write']);
        expect(normalizeNebbiaTuning({scenery:[]}).scenery).toEqual([]);
        expect(normalizeNebbiaTuning({motionStrength:Infinity}).motionStrength).toBe(1);
        expect(normalizeNebbiaTuning({motionStrength:9}).motionStrength).toBe(2);
        expect(readNebbiaRender(undefined,1).scale).toBe('global');
        expect(readNebbiaRender(undefined,.625).scale).toBe(.75);
        expect(normalizeNebbiaTuning(null)).toEqual(DEFAULT_NEBBIA_TUNING);
    });
    it('produces identical layout after yielding and cancels obsolete song builds', async () => {
        const glyph=measureGlyph([[[0,0],[.5,1],[1,0]]]);
        const cache={get:()=>glyph} as unknown as NebbiaGlyphCache;
        const source=buildNebbiaLines(Array.from({length:12},(_,i)=>({id:String(i),fullText:'听屿',startTime:i*4,endTime:i*4+3,words:[{text:'听屿',startTime:i*4,endTime:i*4+3}]})), 'check',0,[]);
        const args=[source,cache,DEFAULT_NEBBIA_TUNING,{W:412,H:915,fontScale:1},'check'] as const;
        expect(await buildNebbiaSceneAsync(...args,()=>false)).toEqual(buildNebbiaScene(...args));
        let polls=0;
        expect(await buildNebbiaSceneAsync(...args,()=>++polls>3)).toBeNull();
    });
});
