import { describe, expect, it } from 'vitest';
import { fitRearCurrentLine, resolveRearSafeLeft, resolveRearLyricRegions } from '../../../src/utils/rearCameraSafeArea';

// test/unit/visualizer/rearCameraSafeArea.test.ts
describe('rear current-line projection', () => {
    it('fits harmony, handwriting and subtitles into separate camera-safe regions',()=>{
        for(const width of [329,347,904]){
            const left=resolveRearSafeLeft(width)+5;
            const safe={left,top:5,width:width-left-5,height:width*596/976-10};
            const {harmony,lyrics,subtitles}=resolveRearLyricRegions(safe,true);
            expect(harmony.top+harmony.height).toBeLessThan(lyrics.top);
            expect(lyrics.top+lyrics.height).toBeLessThan(subtitles.top);
            for(const region of [harmony,lyrics,subtitles]){
                expect(region.left).toBe(safe.left);
                expect(region.width).toBe(safe.width);
                expect(region.height).toBeGreaterThan(0);
                expect(region.top+region.height).toBeLessThanOrEqual(safe.top+safe.height+.001);
            }
        }
    });
    it('reserves separate current and subtitle regions without moving the scene',()=>{
        const safe={left:104,top:5,width:238,height:202};
        const regions=resolveRearLyricRegions(safe);
        expect(regions.lyrics.left).toBe(safe.left);expect(regions.subtitles.left).toBe(safe.left);
        expect(regions.lyrics.top+regions.lyrics.height).toBeLessThan(regions.subtitles.top);
        expect(regions.subtitles.top+regions.subtitles.height).toBeCloseTo(safe.top+safe.height);
    });
    it('converts physical camera width by viewport ratio, independently of devicePixelRatio', () => {
        expect(resolveRearSafeLeft(347)).toBeCloseTo(98.485, 2);
        expect(resolveRearSafeLeft(904, 277, 976)).toBeCloseTo(256.566, 2);
        expect(resolveRearSafeLeft(347, NaN, 0)).toBe(resolveRearSafeLeft(347));
    });
    it('keeps the whole sentence inside the reading region at several frame scales and positions', () => {
        for (const width of [329, 347, 904]) {
            const height = width * 596 / 976;
            const safe = { left: resolveRearSafeLeft(width) + 5, top: 5,
                width: width - resolveRearSafeLeft(width) - 10, height: height - 10 };
            for (const left of [-500, 0, 90, 500]) for (const scale of [.2, 1, 3]) {
                const fit = fitRearCurrentLine({ left, top: -90, width: 500 * scale, height: 130 * scale }, safe);
                expect(fit.left).toBeGreaterThanOrEqual(safe.left - .001);
                expect(fit.top).toBeGreaterThanOrEqual(safe.top - .001);
                expect(fit.left + fit.width).toBeLessThanOrEqual(safe.left + safe.width + .001);
                expect(fit.top + fit.height).toBeLessThanOrEqual(safe.top + safe.height + .001);
                expect(fit.width / fit.height).toBeCloseTo(500 / 130);
            }
        }
    });
});
