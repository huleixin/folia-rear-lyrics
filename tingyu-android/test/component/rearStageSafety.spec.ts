import {test,expect} from './fixtures';

// Browser plugin unavailable: Chromium checks real renderers, full-scene bounds and fitted text.
for(const mode of ['machi','nebbia'])for(const density of [1,3])test(mode+' rear scene and long lyrics at DPR '+density,async({browser},info)=>{
    const context=await browser.newContext({viewport:{width:347,height:212},deviceScaleFactor:density,serviceWorkers:'block'});
    const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(message.text().includes('ResizeObserver loop'))errors.push(message.text());});
    await page.goto('http://127.0.0.1:4173/dev-probe.html?probe=rearStageSafety&mode='+mode+'&long=1&harmony=1&light='+(density===3?'1':'0')+(density===3?'&aquarium=1':''));
    const canvas=page.locator('[data-testid="rear-scene"] canvas').first();await expect(canvas).toBeVisible({timeout:40000});
    const marker=mode==='machi'?'[data-machi-ready="true"]':'[data-nebbia-ready="true"]';
    await expect(page.locator(marker)).toBeVisible({timeout:40000});
    if(mode==='nebbia')await expect(page.locator('[data-nebbia-layout-ready="true"]')).toBeVisible({timeout:40000});
    const box=(await canvas.boundingBox())!;expect(box.x).toBe(0);expect(box.y).toBe(0);expect(box.width).toBeCloseTo(347);expect(box.height).toBeCloseTo(212);
    await expect(page.locator('[data-rear-subtitles]')).toBeVisible();
    const main=page.locator('[data-rear-current-lyrics]').filter({hasText:'HelloSuperLongUnbrokenWord'});
    await expect(page.locator('[data-rear-harmony]')).toContainText('风吹过窗边的和声');
    await expect(main).toBeVisible();
    for(const font of [false,true]){
        if(font)await page.getByRole('button',{name:'font',exact:true}).click();
        if(mode==='nebbia')await expect(page.locator('[data-nebbia-layout-ready="true"]')).toBeVisible({timeout:40000});
        await expect.poll(async()=>page.locator('[data-rear-fitted-content]>div').evaluateAll(elements=>elements.every(el=>{
            const b=el.getBoundingClientRect(),r=el.parentElement!.getBoundingClientRect();
            return b.left>=r.left-.5&&b.top>=r.top-.5&&b.right<=r.right+.5&&b.bottom<=r.bottom+.5;
        }))).toBe(true);
        for(const fitted of await page.locator('[data-rear-fitted-content]').all())expect((await fitted.boundingBox())!.x).toBeGreaterThan(98);
        expect(await main.evaluate(el=>getComputedStyle(el).fontWeight)).toBe(font?'900':'500');
        expect(await main.evaluate(el=>{
            const b=el.getBoundingClientRect();
            const text=el.querySelector('span')!;
            const previous=text.style.pointerEvents;
            text.style.pointerEvents='auto';
            const glyph=text.getBoundingClientRect();
            const visible=document.elementFromPoint(glyph.x+glyph.width/2,glyph.y+glyph.height/2);
            text.style.pointerEvents=previous;
            return b.width>180&&Boolean(visible&&el.contains(visible));
        })).toBe(true);
    }
    await page.screenshot({path:info.outputPath(mode+'-rear.png')});
    await page.getByRole('button',{name:'seek',exact:true}).click();
    await expect.poll(()=>main.locator('span').first().evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('100%');
    expect(errors).toEqual([]);await context.close();
});

test('Nebbia keeps the original handwriting behind its readable rear lyrics',async({browser},info)=>{
    const context=await browser.newContext({viewport:{width:347,height:212},serviceWorkers:'block'});
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:4173/dev-probe.html?probe=rearStageSafety&mode=nebbia');
    await expect(page.locator('[data-nebbia-layout-ready="true"]')).toBeVisible({timeout:40000});
    // Observe the real mask after a shared-clock seek; no production debug state or substitute renderer.
    await page.evaluate(async()=>{
        const path='/src/components/visualizer/nebbia/nebbiaMask.ts';
        const {NebbiaMask}=await import(/* @vite-ignore */ path);
        const draw=NebbiaMask.prototype.draw;
        NebbiaMask.prototype.draw=function(this:{ctx:{count:number}},laid:Array<{chars:Array<{glyph:unknown}>}>,time:number,...rest:unknown[]){
            const result=draw.call(this,laid,time,...rest);
            document.body.dataset.handwriting=JSON.stringify({time,segments:this.ctx.count,
                chars:laid[0]?.chars.filter(c=>c.glyph).length});
            return result;
        };
    });
    await page.getByRole('button',{name:'seek',exact:true}).click();
    await expect.poll(async()=>JSON.parse(await page.locator('body').getAttribute('data-handwriting')||'{}'))
        .toMatchObject({time:10,chars:7});
    expect(JSON.parse(await page.locator('body').getAttribute('data-handwriting')||'{}').segments).toBeGreaterThan(20);
    // Capture the unmodified glass writing alone for visual inspection.
    await page.locator('[data-rear-current-lyrics]').evaluate(el=>(el as HTMLElement).style.visibility='hidden');
    await page.screenshot({path:info.outputPath('nebbia-handwriting.png')});
    await context.close();
});
