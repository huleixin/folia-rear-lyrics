import { describe, expect, it } from 'vitest';
import * as pixi from 'pixi.js';
import { createSonnetRearFit } from '@/components/visualizer/sonnet/sonnetRearFit';
import { resolveSonnetRearReadingArea } from '@/components/visualizer/sonnet/sonnetRearReadingArea';
import type { SegmentView } from '@/components/visualizer/sonnet/sonnetTextViewBuilder';
import { DEFAULT_SONNET_TUNING, type Line } from '@/types';

// test/unit/visualizer/sonnetRearFit.test.ts
// Check source-line selection, nested camera transforms, companion registration, and pose restoration.
describe('Sonnet rear reading ink', () => {
    it.each([[329,208], [347,212], [393,249]])('fits the whole current line at %s × %s', (width, height) => {
        const stage = new pixi.Container(), shot = new pixi.Container(); stage.addChild(shot);
        const line = { startTime: 10, endTime: 18, fullText: '渐渐地忘记赶不上明天', words: [] } as Line;
        const nodes = Array.from({ length: 6 }, () => {
            const wrapper = new pixi.Container(), ink = new pixi.Graphics().rect(-15,-20,30,40).fill(0xffffff);
            const ca = new pixi.Container(), guide = new pixi.Container();
            wrapper.addChild(ink); shot.addChild(wrapper,ca,guide);
            return { wrapper, ink, ca, guide };
        });
        const segments = nodes.map((n,index) => ({ sourceLine: line, role: index ? 'support' : 'hero',
            guide: { container: n.guide }, glyphs: [{ display: n.wrapper, ink: n.ink, caWrapper: n.ca, isTextGlyph: true }] })) as unknown as SegmentView[];
        const decor = new pixi.Graphics().rect(-300,-300,600,600).fill(0xffffff);shot.addChild(decor);
        segments.push({ sourceLine: line, role: 'decoration', glyphs: [{ display: decor }], guide: { container: new pixi.Container() } } as unknown as SegmentView);
        const fit = createSonnetRearFit(pixi,segments), safe = { left: width * .3, top: 5, width: width * .68, height: height - 45 };
        for (let frame = 0; frame < 180; frame++) {
            fit.reset(); stage.pivot.set(width/2,height/2); stage.position.set(width/2+Math.sin(frame)*10,height/2);
            stage.scale.set(.8+(frame%10)/25);stage.rotation=Math.sin(frame/20)*.05;
            shot.position.set(width*.4,height*.5);shot.rotation=Math.sin(frame/18)*.4;shot.scale.set(1.5);
            nodes.forEach((n,i)=>{ n.wrapper.position.set((i-2)*50,(i%2)*70);n.wrapper.rotation=i*.04;n.wrapper.scale.set(1);
                n.ca.position.copyFrom(n.wrapper.position); n.guide.position.copyFrom(n.wrapper.position); });
            const original = nodes.map(n=>n.wrapper.getGlobalTransform().clone());
            const decorBefore = decor.getGlobalTransform().clone();
            const b = fit.constrain(12,safe)!;
            expect(b.left).toBeGreaterThanOrEqual(safe.left-.001);expect(b.top).toBeGreaterThanOrEqual(safe.top-.001);
            expect(b.left+b.width).toBeLessThanOrEqual(safe.left+safe.width+.001);expect(b.top+b.height).toBeLessThanOrEqual(safe.top+safe.height+.001);
            for(const n of nodes) for(const companion of [n.ca,n.guide]) {
                const a=n.wrapper.getGlobalTransform(),c=companion.getGlobalTransform();
                expect(c.tx).toBeCloseTo(a.tx,5);expect(c.ty).toBeCloseTo(a.ty,5);
            }
            expect(decor.getGlobalTransform()).toEqual(decorBefore);
            fit.reset();nodes.forEach((n,i)=>{const m=n.wrapper.getGlobalTransform();for(const k of ['a','b','c','d','tx','ty'] as const)expect(m[k]).toBeCloseTo(original[i][k],5);});
            expect(fit.constrain(12,safe)!.width).toBeCloseTo(b.width,5);
        }
        fit.reset();expect(fit.constrain(19,safe)).toBeNull();
        stage.destroy({children:true});
    });

    it('keeps normal/front-free geometry when post processing is disabled', () => {
        const safe={left:104,top:5,width:238,height:150};
        expect(resolveSonnetRearReadingArea(safe,347,212,DEFAULT_SONNET_TUNING,false)).toBe(safe);
        expect(resolveSonnetRearReadingArea(safe,347,212,{...DEFAULT_SONNET_TUNING,postProcessEnabled:true},true)).toBe(safe);
    });
    it.each([0,.3,1,2])('leaves no source ink available to outside lens pixels at curvature %s', distortion => {
        for(const [width,height] of [[329,208],[347,212],[393,249]]) {
            const safe={left:width*.3,top:5,width:width*.68,height:height-55};
            const area=resolveSonnetRearReadingArea(safe,width,height,{...DEFAULT_SONNET_TUNING,postProcessEnabled:true,
                postProcessLensDistortion:distortion,postProcessLensDispersion:2,postProcessRgbShift:1},false);
            expect(area.width).toBeGreaterThan(20);expect(area.height).toBeGreaterThan(20);
            // Independently sample the shader's source coordinates on every side of the physical safe rectangle.
            for(let x=0;x<=100;x++)for(let y=0;y<=100;y++) {
                const px=x*width/100,py=y*height/100;
                if(px>=safe.left&&px<=safe.left+safe.width&&py>=safe.top&&py<=safe.top+safe.height)continue;
                const cx=(x/100-.5)*width/height,cy=y/100-.5,r2=cx*cx+cy*cy;
                const scale=1-distortion*.32*r2+distortion*.32*.16*r2*r2;
                const sx=(.5+(x/100-.5)*scale)*width,sy=(.5+cy*scale)*height;
                const near=sx>area.left- height*.024 && sx<area.left+area.width+height*.024
                    && sy>area.top-height*.024 && sy<area.top+area.height+height*.024;
                expect(near).toBe(false);
            }
        }
    });
});
