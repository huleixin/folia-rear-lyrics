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
import { layoutNebbiaSong } from '../../../src/components/visualizer/nebbia/nebbiaLayout';
import { resolveRearReadingBox } from '../../../src/utils/visualizerSurface';
import { appendNebbiaCredits } from '../../../src/components/visualizer/nebbia/nebbiaCredits';
import { drawChar, type InkContext } from '../../../src/components/visualizer/nebbia/nebbiaInk';
import { NebbiaSegments } from '../../../src/components/visualizer/nebbia/nebbiaSegments';

// test/unit/visualizer/nebbia.test.ts
// Live spectrum boundaries and async layout must preserve the original handwriting schedule.
const audio = () => ({bass:motionValue(0),lowMid:motionValue(0),mid:motionValue(0),vocal:motionValue(0),treble:motionValue(0),spectrum:motionValue(new Uint8Array(16))});
describe('Nebbia Android adaptation', () => {
    it('keeps dense compressed handwriting progressive and completes every stroke by its deadline', () => {
        const glyph = measureGlyph(Array.from({length:20}, (_,i) => [[0,i/20],[1,i/20]]));
        const cache = {get:()=>glyph!} as unknown as NebbiaGlyphCache;
        const source = buildNebbiaLines([{fullText:'字',startTime:1,endTime:1.2,words:[{text:'字',startTime:1,endTime:1.2}]}],'ink',0,[]);
        const c = buildNebbiaScene(source,cache,{...DEFAULT_NEBBIA_TUNING,appear:['write']},{W:347,H:212,fontScale:1},'ink')[0].chars[0];
        c.beads = glyph!.strokes.map(()=>[]); c.drips = glyph!.strokes.map(()=>null); c.s = 30;
        const ctx = new NebbiaSegments();
        const ink = {ctx,strokeWidth:.03,writeSpeed:1,busSpeed:1,sweeps:null,wet:null,ice:null,motion:{}} as InkContext;
        drawChar(ink,c,c.wt-.001,1,0); expect(ctx.count).toBe(0);
        drawChar(ink,c,c.wt+c.wd*.001,1,0); expect(ctx.count).toBe(1);
        expect(Math.hypot(ctx.data[2]-ctx.data[0],ctx.data[3]-ctx.data[1])).toBeLessThan(1);
        ctx.clear(); drawChar(ink,c,c.wt+c.wd*.5,1,0);
        expect(ctx.count).toBeGreaterThan(1); expect(ctx.count).toBeLessThan(20);
        ctx.clear(); drawChar(ink,c,c.wt+c.wd,1,0); expect(ctx.count).toBe(20);
    });
    it('finishes dense final lyrics in the shared lyric interval without flattening handwriting or rushing credits',()=>{
        const glyph=measureGlyph(Array.from({length:20},()=>[[0,0],[1,1],[0,1]]));
        const cache={get:()=>glyph} as unknown as NebbiaGlyphCache;
        const text='这是整句需要完整显示的歌词';
        const source=buildNebbiaLines([{fullText:text,startTime:0,endTime:3,words:Array.from(text).map((text,i)=>({text,startTime:i*3/13,endTime:(i+1)*3/13}))}],'final',0,[]);
        const tuning={...DEFAULT_NEBBIA_TUNING,appear:['write' as const],writeSpeed:.5};
        const make=(lines:typeof source)=>buildNebbiaScene(lines,cache,tuning,{W:347,H:212,fontScale:1},'final');
        expect(source[0].next).toBe(Infinity);
        const line=make(source)[0];
        let previousEnd=0;
        for(const c of line.chars){
            expect(c.wt).toBeGreaterThanOrEqual(Math.max(c.t,previousEnd));
            expect(c.wd).toBeGreaterThan(0);expect(c.appearDur).toBe(0);
            previousEnd=c.wt+c.wd;
        }
        expect(previousEnd).toBeLessThanOrEqual(line.end+.001);
        const withCredits=make(appendNebbiaCredits(source,'听屿','歌手'));
        const title=withCredits[1],artist=withCredits[2];
        expect(title.chars[0].wd).toBeGreaterThan(10);
        const titleEnd=Math.max(...title.chars.map(c=>c.wt+c.wd));
        expect(artist.chars[0].wt).toBeGreaterThanOrEqual(titleEnd+.4);
    });
    it('fits every actual warped/rotated handwriting stroke right of the camera at multiple scales',()=>{
        const cache={get:()=>measureGlyph([[[-.15,0],[.5,1.2],[1.15,-.1]]])} as unknown as NebbiaGlyphCache;
        const text='这是一句很长的歌词，HelloSuperLongUnbrokenWord 星光和雨夜';
        const source=buildNebbiaLines([{fullText:text,startTime:0,endTime:8,words:[{text,startTime:0,endTime:8}]}],'rear',0,[]);
        for(const width of [329,347,904])for(const fontScale of [.5,1,3]){
            const H=width*596/976,area=resolveRearReadingBox(width,H);
            const scene=buildNebbiaScene(source,cache,{...DEFAULT_NEBBIA_TUNING,jitter:1,warp:1,strokeWidth:.08},{W:width,H,fontScale,area},'rear');
            for(const line of scene)for(const c of line.chars)for(const stroke of c.glyph?.strokes??[])for(const [x,y] of stroke.pts){
                const margin=Math.max(1.5,c.s*.08)/2;
                const px=c.x+((x-.5)*Math.cos(c.rot)-(y-.5)*Math.sin(c.rot))*c.s;
                const py=c.y+((x-.5)*Math.sin(c.rot)+(y-.5)*Math.cos(c.rot))*c.s;
                expect(px-margin).toBeGreaterThanOrEqual(area.left-.001);
                expect(py-margin).toBeGreaterThanOrEqual(area.top-.001);
                expect(px+margin).toBeLessThanOrEqual(area.left+area.width+.001);
                expect(py+margin).toBeLessThanOrEqual(area.top+area.height+.001);
                expect(c.wt).toBeGreaterThanOrEqual(c.t);expect(Number.isFinite(c.wd)).toBe(true);
            }
        }
    });
    it('preserves composition variety across CSS viewport densities instead of falling back to the same three rows',()=>{
        const texts=['听见风吹过窗边','我们一起走过这片星海','月光落在你眼中','雨夜街景慢慢消失'];
        const source=buildNebbiaLines(texts.map((fullText,i)=>({fullText,startTime:i*15,endTime:i*15+12,
            words:Array.from(fullText).map((text,k)=>({text,startTime:i*15+k,endTime:i*15+k+1}))})),'composition',0,[]);
        const shapes=new Set<string>();
        for(const layout of DEFAULT_NEBBIA_TUNING.layouts){
            const make=(scale:number)=>layoutNebbiaSong(source,{W:347*scale,H:212*scale,
                area:resolveRearReadingBox(347*scale,212*scale),fontScale:1,jitter:0,layouts:[layout],
                visibleUntil:i=>i*15+12,fogAt:i=>i*15+12});
            const small=make(1),large=make(3);
            for(let i=0;i<small.length;i++)for(let k=0;k<small[i].length;k++){
                expect(large[i][k].x/3).toBeCloseTo(small[i][k].x,6);
                expect(large[i][k].y/3).toBeCloseTo(small[i][k].y,6);
                expect(large[i][k].s/3).toBeCloseTo(small[i][k].s,6);
            }
            shapes.add(JSON.stringify(small[0].map(c=>[Math.round(c.x),Math.round(c.y),Math.round(c.rot*10)])));
            expect(Math.max(...small[0].map(c=>c.s))).toBeGreaterThan(24);
        }
        expect(shapes.size).toBeGreaterThanOrEqual(7);
    });
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
