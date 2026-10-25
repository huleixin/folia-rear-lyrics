import { describe, expect, it } from 'vitest';
import * as pixi from 'pixi.js';
import { createTemperaRearFit } from '@/components/visualizer/tempera/temperaRearFit';
import type { TemperaGlyphView } from '@/components/visualizer/tempera/temperaTextView';
import type { TemperaShot } from '@/components/visualizer/tempera/types';

// test/unit/visualizer/temperaRearFit.test.ts
describe('Tempera rear phrase fitting', () => {
    it.each([[329,208],[347,212],[393,249]])('keeps reading ink and print shadows safe after cameras at %s × %s', (width,height) => {
        const stage=new pixi.Container(),shot=new pixi.Container(),inverted=new pixi.Container(),keywords=new pixi.Container(),echoes=new pixi.Container();
        stage.addChild(shot);shot.addChild(inverted,keywords,echoes);
        const glyphs=Array.from({length:9},(_,i)=>{
            const display=new pixi.Graphics().rect(-16,-22,32,44).fill(0xffffff);
            const shadow=new pixi.Graphics().rect(-16,-22,32,44).fill(0xffffff);
            const echo=new pixi.Graphics().rect(-16,-22,32,44).fill(0xffffff);
            (i%3?inverted:keywords).addChild(display);inverted.addChild(shadow);echoes.addChild(echo);
            return {display,shadow,echoes:[echo]};
        });
        const decor=new pixi.Graphics().rect(-200,-200,800,800).fill(0x778899);shot.addChild(decor);
        const fit=createTemperaRearFit(pixi,glyphs as unknown as TemperaGlyphView[],{startTime:0,endTime:8} as TemperaShot);
        const safe={left:width*.3,top:5,width:width*.68,height:height-50};
        for(let frame=0;frame<180;frame++) {
            fit.reset();stage.position.set(Math.sin(frame/40)*20,0);stage.rotation=Math.sin(frame/30)*.12;
            shot.pivot.set(width/2,height/2);shot.position.set(width/2,height/2);shot.scale.set(1.3);shot.rotation=Math.sin(frame/35)*.18;
            glyphs.forEach((g,i)=>{
                g.display.position.set(i*39,60+i%3*25);g.display.rotation=i*.02;g.display.scale.set(1);
                g.shadow.position.set(g.display.x+3,g.display.y+4);g.shadow.rotation=g.display.rotation;
                g.echoes[0].position.set(g.display.x-20,g.display.y-15);
            });
            const before=glyphs.map(g=>g.display.getGlobalTransform().clone()),art=decor.getGlobalTransform().clone();
            const bounds=fit.constrain(3,safe)!;
            expect(bounds.left).toBeGreaterThanOrEqual(safe.left-.001);expect(bounds.top).toBeGreaterThanOrEqual(safe.top-.001);
            expect(bounds.left+bounds.width).toBeLessThanOrEqual(safe.left+safe.width+.001);
            expect(bounds.top+bounds.height).toBeLessThanOrEqual(safe.top+safe.height+.001);
            expect(decor.getGlobalTransform()).toEqual(art);
            for(const g of glyphs) {
                const main=g.display.getGlobalTransform(),shadow=g.shadow.getGlobalTransform();
                expect(shadow.a).toBeCloseTo(main.a,5);expect(shadow.b).toBeCloseTo(main.b,5);
                expect(main.a*main.d-main.b*main.c).toBeGreaterThan(0);
            }
            fit.reset();glyphs.forEach((g,i)=>{const m=g.display.getGlobalTransform();for(const k of ['a','b','c','d','tx','ty'] as const)expect(m[k]).toBeCloseTo(before[i][k],5);});
            expect(fit.constrain(3,safe)!.width).toBeCloseTo(bounds.width,5);
        }
        fit.reset();const original=glyphs[0].display.getGlobalTransform().clone();
        expect(fit.constrain(9,safe)).toBeNull();expect(glyphs[0].display.getGlobalTransform()).toEqual(original);
        fit.reset();stage.destroy({children:true});
    });
});
