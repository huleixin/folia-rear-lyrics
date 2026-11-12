import {test,expect} from './fixtures';
import {writeFileSync} from 'node:fs';
import type {Page} from '@playwright/test';

// Browser plugin unavailable: inspect actual renderer output using Chromium and prototype instrumentation.
async function observe(page:Page,mode:string){
    await page.evaluate(async mode=>{
        if(mode==='nebbia'){
            const maskPath='/src/components/visualizer/nebbia/nebbiaMaskGl.ts';
            const {NebbiaMaskGl}=await import(/* @vite-ignore */ maskPath),maskDraw=NebbiaMaskGl.prototype.draw;
            NebbiaMaskGl.prototype.draw=function(this:any,...args:any[]){
                maskDraw.apply(this,args);
                if(document.body.dataset.captureMask!=='true')return;
                delete document.body.dataset.captureMask;
                const gl=this.gl,pixels=new Uint8Array(this.w*this.h*4);
                gl.bindFramebuffer(gl.FRAMEBUFFER,this.fb);gl.readPixels(0,0,this.w,this.h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                gl.bindFramebuffer(gl.FRAMEBUFFER,null);
                const canvas=document.createElement('canvas');canvas.width=this.w;canvas.height=this.h;
                for(let i=0;i<pixels.length;i+=4){pixels[i+1]=pixels[i];pixels[i+2]=pixels[i];pixels[i+3]=255;}
                canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels),this.w,this.h),0,0);
                document.body.dataset.nativeMask=canvas.toDataURL();
                document.body.dataset.maskStats=JSON.stringify({width:this.w,height:this.h,error:gl.getError(),ink:pixels.filter((v,i)=>i%4===0&&v>16).length});
            };
            const path='/src/components/visualizer/nebbia/nebbiaMask.ts';
            const {NebbiaMask}=await import(/* @vite-ignore */ path),draw=NebbiaMask.prototype.draw;
            NebbiaMask.prototype.draw=function(this:any,laid:any[],time:number,...rest:any[]){
                const result=draw.call(this,laid,time,...rest);
                const points=laid.flatMap(line=>line.chars.flatMap((c:any)=>(c.glyph?.strokes??[]).flatMap((s:any)=>s.pts.map(([x,y]:number[])=>({
                    x:c.x+((x-.5)*Math.cos(c.rot)-(y-.5)*Math.sin(c.rot))*c.s,
                    y:c.y+((x-.5)*Math.sin(c.rot)+(y-.5)*Math.cos(c.rot))*c.s
                })))));
                document.body.dataset.nativeLyrics=JSON.stringify({time,segments:this.ctx.count,points,
                    chars:laid[0]?.chars.filter((c:any)=>c.glyph).length, scheduled:laid[0]?.chars.map((c:any)=>({ch:c.ch,t:c.t,wt:c.wt,wd:c.wd,s:c.s,glyph:Boolean(c.glyph),fade:c.appearDur}))});return result;
            };
        }else{
            const path='/src/components/visualizer/machi/engine/camera.ts';
            const {MachiCamera}=await import(/* @vite-ignore */ path),fit=MachiCamera.prototype.fitRearLettering;
            MachiCamera.prototype.fitRearLettering=function(this:any){
                fit.call(this);
                const camera=this.camera,direction=camera.getWorldDirection(camera.position.clone()).negate();
                const points=this.lettering.filter((f:any)=>f.normal.dot(direction)>.05).flatMap((f:any)=>f.corners.map((p:any)=>{
                    const q=p.clone().project(camera);return{x:(q.x+1)/2*innerWidth,y:(1-q.y)/2*innerHeight};
                }));
                document.body.dataset.nativeBounds=JSON.stringify(points);
            };
            const path2='/src/components/visualizer/machi/engine/lyricScreen.ts';
            const {MachiLyricScreen}=await import(/* @vite-ignore */ path2),update=MachiLyricScreen.prototype.update;
            MachiLyricScreen.prototype.update=function(this:any,frame:any){
                update.call(this,frame);
                document.body.dataset.nativeLyrics=JSON.stringify({time:frame.songTime,reveal:this.material.uniforms.uReveal.value.toArray(),
                    layout:this.slot?.layout});
            };
        }
    },mode);
}
async function nativeBounds(page:Page,mode:string){
    const state=await page.locator('body').getAttribute(mode==='machi'?'data-native-bounds':'data-native-lyrics');
    const data=JSON.parse(state||'null');return mode==='machi'?data:data?.points;
}
for(const mode of ['machi','nebbia'])for(const density of [1,3])test(mode+' keeps original long lyrics at DPR '+density,async({browser},info)=>{
    const context=await browser.newContext({viewport:{width:347,height:212},deviceScaleFactor:density,serviceWorkers:'block'});
    const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(message.text().includes('ResizeObserver loop'))errors.push(message.text());});
    await page.goto('http://127.0.0.1:4173/dev-probe.html?probe=rearStageSafety&mode='+mode+'&long=1&harmony=1&auxiliary=1&light='+(density===3?'1':'0')+(density===3?'&aquarium=1':''));
    const canvas=page.locator('[data-testid="rear-scene"] canvas').first();
    await expect(page.locator(mode==='machi'?'[data-machi-ready="true"]':'[data-nebbia-layout-ready="true"]')).toBeVisible({timeout:40000});
    const box=(await canvas.boundingBox())!;expect(box).toMatchObject({x:0,y:0,width:347,height:212});
    // Background vocals retain their own shared-clock overlay; the main lyric must stay native.
    await expect(page.locator('[data-rear-current-lyrics]')).toHaveCount(1);
    expect(await page.locator('[data-rear-current-lyrics]').evaluateAll(elements=>elements.every(el=>el.closest('[data-rear-harmony]')))).toBe(true);
    await expect(page.locator('[data-rear-subtitles]')).toBeVisible();
    await expect(page.locator('[data-rear-harmony]')).toContainText('风吹过窗边的和声');
    await observe(page,mode);
    for(const large of [false,true]){
        if(large)await page.getByRole('button',{name:'font',exact:true}).click();
        await page.getByRole('button',{name:'seek',exact:true}).click();
        await expect.poll(async()=>JSON.parse(await page.locator('body').getAttribute('data-native-lyrics')||'{}').time).toBe(large?6:10);
        await expect.poll(async()=>{
            const points=await nativeBounds(page,mode);return points?.length>0&&points.every((p:any)=>p.x>=103&&p.x<=342&&p.y>=3&&p.y<=209);
        }).toBe(true);
        await expect.poll(async()=>{
            const points=await nativeBounds(page,mode);
            const occupied=await page.locator('[data-rear-fitted-content]>div').evaluateAll(elements=>elements.filter(el=>el.textContent?.trim()).map(el=>{
                const b=el.getBoundingClientRect();return{top:b.top,bottom:b.bottom,harmony:Boolean(el.closest('[data-rear-harmony]'))};
            }));
            return points?.length>0&&occupied.every(b=>points.every((p:any)=>b.harmony?p.y>b.bottom:p.y<b.top));
        }).toBe(true);
        await expect.poll(()=>page.locator('[data-rear-fitted-content]>div').evaluateAll(elements=>elements.every(el=>{
            const b=el.getBoundingClientRect(),r=el.parentElement!.getBoundingClientRect();
            return b.left>=r.left-.5&&b.top>=r.top-.5&&b.right<=r.right+.5&&b.bottom<=r.bottom+.5;
        }))).toBe(true);
    }
    if(mode==='nebbia')await page.evaluate(()=>{document.body.dataset.captureMask='true';});
    await page.getByRole('button',{name:'late',exact:true}).click();
    await expect.poll(async()=>JSON.parse(await page.locator('body').getAttribute('data-native-lyrics')||'{}').time).toBe(11.9);
    writeFileSync(info.outputPath(mode+'-native-state.json'),await page.locator('body').getAttribute('data-native-lyrics')||'{}');
    if(mode==='nebbia'){
        await expect(page.locator('body')).toHaveAttribute('data-mask-stats',/.+/);
        const stats=JSON.parse((await page.locator('body').getAttribute('data-mask-stats'))!);
        expect(stats.error).toBe(0);expect(stats.ink).toBeGreaterThan(100);
        expect(stats.width).toBeGreaterThanOrEqual(347);expect(stats.width).toBeLessThanOrEqual(694);
        expect(stats.height).toBeGreaterThanOrEqual(212);expect(stats.height).toBeLessThanOrEqual(424);
        writeFileSync(info.outputPath('nebbia-mask.png'),Buffer.from((await page.locator('body').getAttribute('data-native-mask'))!.split(',')[1],'base64'));
        writeFileSync(info.outputPath('nebbia-mask-stats.json'),JSON.stringify(stats,null,2));
    }
    await page.screenshot({path:info.outputPath(mode+'-rear-long.png')});
    expect(errors).toEqual([]);await context.close();
});

test('Nebbia handwriting occupies the full camera-safe surface',async({browser},info)=>{
    const context=await browser.newContext({viewport:{width:347,height:212},deviceScaleFactor:3,serviceWorkers:'block'}),page=await context.newPage();
    await page.goto('http://127.0.0.1:4173/dev-probe.html?probe=rearStageSafety&mode=nebbia&auxiliary=1&harmony=1');
    await expect(page.locator('[data-nebbia-layout-ready="true"]')).toBeVisible({timeout:40000});
    await observe(page,'nebbia');
    await page.getByRole('button',{name:'extras',exact:true}).click();
    await expect(page.locator('[data-rear-current-lyrics]')).toHaveCount(0);
    await expect(page.locator('[data-rear-subtitles]')).toHaveCount(0);
    await page.getByRole('button',{name:'seek',exact:true}).click();
    await expect.poll(async()=>JSON.parse(await page.locator('body').getAttribute('data-native-lyrics')||'{}')).toMatchObject({time:10,chars:7});
    const data=JSON.parse(await page.locator('body').getAttribute('data-native-lyrics')||'{}');
    expect(data.segments).toBeGreaterThan(20);
    expect(Math.max(...data.points.map((p:any)=>p.y))-Math.min(...data.points.map((p:any)=>p.y))).toBeGreaterThan(65);
    await expect(page.locator('[data-rear-current-lyrics]')).toHaveCount(0);
    await page.screenshot({path:info.outputPath('nebbia-handwriting.png')});await context.close();
});

for(const scene of ['konbini','station','kowloon'])test('Machi '+scene+' keeps live sign lyrics outside the camera',async({browser},info)=>{
    const context=await browser.newContext({viewport:{width:347,height:212},deviceScaleFactor:3,serviceWorkers:'block'}),page=await context.newPage();
    await page.goto('http://127.0.0.1:4173/dev-probe.html?probe=rearStageSafety&mode=machi&scene='+scene);
    await expect(page.locator('[data-machi-ready="true"]')).toBeVisible({timeout:40000});await observe(page,'machi');
    await page.getByRole('button',{name:'seek',exact:true}).click();
    await expect.poll(async()=>JSON.parse(await page.locator('body').getAttribute('data-native-lyrics')||'{}').time).toBe(10);
    const data=JSON.parse(await page.locator('body').getAttribute('data-native-lyrics')||'{}');expect(data.layout).toBeTruthy();expect(Math.max(...data.reveal)).toBeGreaterThan(.5);
    for(const azimuth of [-180,0,180]){
        await page.evaluate(angle=>(window as any).__machiDebug.setView(angle,70,3.6),azimuth);
        const points=await nativeBounds(page,'machi');expect(points.length).toBeGreaterThan(0);
        expect(points.every((p:any)=>p.x>=103&&p.x<=342&&p.y>=3&&p.y<=209)).toBe(true);
    }
    await page.evaluate(()=>(window as any).__machiDebug.resetView());
    await page.screenshot({path:info.outputPath('machi-'+scene+'.png')});await context.close();
});
