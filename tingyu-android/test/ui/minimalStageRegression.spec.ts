import { test, expect } from '@playwright/test';

// test/ui/minimalStageRegression.spec.ts
const errors = (page: import('@playwright/test').Page) => {
    const found: string[] = []; page.on('pageerror', e => found.push(e.message)); return found;
};
test.use({viewport:{width:393,height:873},serviceWorkers:'block'});
test('single-to-double lyric transitions do not move or remount the cover and caption',async({page})=>{
    const failures=errors(page);
    await page.goto('/minimal-stage-preview.html?page=cover&stationary=1');
    await page.locator('.min-cover__art img').waitFor(); await page.waitForTimeout(750);
    await page.addStyleTag({content:'.min-live-lyric,.min-live-lyric__text{font-size:22px!important}'});
    const result=await page.evaluate(async()=>{
        const modulePath='/src/stores/usePlaybackStore.ts';
        const {usePlaybackStore}=await import(modulePath);
        usePlaybackStore.setState({lyrics:{lines:[{fullText:'短句',startTime:0,endTime:4,words:[]},
            {fullText:'这是一句很长很长需要自然换成两行显示的歌词文字',startTime:4,endTime:8,words:[]}]}});
        const api=(window as any).__minimalPreview; api.seek(0); await new Promise(r=>setTimeout(r,450));
        const meta=document.querySelector('.min-cover__meta-stack')!, art=document.querySelector('.min-cover__art img');
        const positions:number[]=[];let stable=true;const started=performance.now();let switched=false;
        await new Promise<void>(resolve=>{const step=()=>{const elapsed=performance.now()-started;
            if(elapsed>100&&!switched){switched=true;api.seek(4)}
            positions.push(meta.getBoundingClientRect().y);
            stable&&=meta===document.querySelector('.min-cover__meta-stack')&&art===document.querySelector('.min-cover__art img')&&getComputedStyle(meta).opacity==='1';
            if(elapsed<1000)requestAnimationFrame(step);else resolve();};requestAnimationFrame(step);});
        return {shift:Math.max(...positions)-Math.min(...positions),stable};
    });
    expect(result).toEqual({shift:0,stable:true});expect(failures).toEqual([]);
});
test('timed sung characters remain visibly different and follow seeks',async({page})=>{
    await page.goto('/minimal-stage-preview.html?page=lyrics&song=cool&stationary=1');await page.waitForTimeout(1000);
    await page.evaluate(()=>(window as any).__minimalPreview.seek(28.1));
    await expect(page.locator('.min-line[data-active] [data-sung]')).toHaveCount(1);
    await page.evaluate(()=>(window as any).__minimalPreview.seek(29.5));
    await expect(page.locator('.min-line[data-active] [data-sung]')).toHaveCount(2);
    await page.waitForTimeout(180);
    const distance=await page.evaluate(()=>{
        const sung=document.querySelector('.min-line[data-active] [data-sung]')!;
        const unsung=document.querySelector('.min-line[data-active] [data-ch]:not([data-sung])')!;
        const c=document.createElement('canvas').getContext('2d')!;
        const rgb=(element:Element)=>{c.clearRect(0,0,1,1);c.fillStyle=getComputedStyle(element).color;c.fillRect(0,0,1,1);return c.getImageData(0,0,1,1).data;};
        const a=rgb(sung),b=rgb(unsung);return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    });expect(distance).toBeGreaterThan(35);
    await page.evaluate(()=>(window as any).__minimalPreview.seek(27.1));
    await expect(page.locator('.min-line[data-active] [data-sung]')).toHaveCount(0);
});
test('static ambience blends interrupted song colours without remounting its moving layers',async({page})=>{
    await page.goto('/minimal-stage-preview.html?page=cover&song=rose&stationary=1');await page.waitForTimeout(1000);
    const result=await page.evaluate(async()=>{
        const root=document.querySelector('.min')!,amb=document.querySelector('.min-amb')!;
        root.setAttribute('data-still',''); amb.setAttribute('data-still','');
        const blob=document.querySelector('.min-amb__blob')!;const colors=new Set<string>();
        const api=(window as any).__minimalPreview;api.switchSong('cool');
        const started=performance.now();let again=false;
        await new Promise<void>(resolve=>{const step=()=>{const t=performance.now()-started;
            if(t>200&&!again){again=true;api.switchSong('normal')}
            colors.add(getComputedStyle(amb).getPropertyValue('--aurora-a'));
            if(t<1300)requestAnimationFrame(step);else resolve();};requestAnimationFrame(step);});
        return {samples:colors.size,same:blob===document.querySelector('.min-amb__blob'),duration:getComputedStyle(amb).transitionDuration};
    });expect(result.samples).toBeGreaterThan(5);expect(result.same).toBe(true);expect(result.duration).not.toBe('0s');
});
test('metadata is present before artwork decode and remains mounted through song crossfade',async({page})=>{
    await page.route('**/dev/assets/minimal-preview-cover.jpg',async route=>{await new Promise(r=>setTimeout(r,900));await route.continue();});
    await page.goto('/minimal-stage-preview.html?page=cover&stationary=1');
    await expect(page.locator('.min-cover__title')).toHaveText('并肩前行');
    expect(await page.locator('.min-cover__meta').evaluate(e=>Number(getComputedStyle(e).opacity))).toBeGreaterThanOrEqual(.72);
    await page.locator('.min-cover__art img').waitFor();await page.waitForTimeout(400);
    const result=await page.evaluate(async()=>{
        const caption=document.querySelector('.min-cover__meta');
        const decodedImage=document.querySelector('.min-cover__art img');
        (window as any).__minimalPreview.switchSong('cool');
        const started=performance.now();let fading=false,stable=true,minOld=1,minCaption=1;
        await new Promise<void>(resolve=>{const tick=()=>{
            const old=document.querySelector('.min-cover__art-layer--outgoing');const incoming=document.querySelector('.min-cover__art-layer--incoming');
            if(old&&incoming){fading=true;minOld=Math.min(minOld,Number(getComputedStyle(old).opacity));stable&&=old.querySelector('img')===decodedImage;}
            stable&&=caption===document.querySelector('.min-cover__meta');
            minCaption=Math.min(minCaption,Number(getComputedStyle(document.querySelector('.min-cover__meta')!).opacity));
            if(performance.now()-started<1100)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
        return {fading,stable,minOld,minCaption};
    });expect(result.fading).toBe(true);expect(result.stable).toBe(true);expect(result.minOld).toBe(1);expect(result.minCaption).toBeGreaterThanOrEqual(.71);
    await expect(page.locator('.min-cover__title')).toHaveText('深海');
});
test('a tap during paging cannot freeze it and diagonal-start lyric swipes still page',async({page})=>{
    await page.goto('/minimal-stage-preview.html?page=cover&stationary=1');await page.waitForTimeout(650);
    await page.locator('.min-dot').nth(1).click();await page.waitForTimeout(80);
    await page.mouse.click(180,400);
    await expect.poll(()=>page.evaluate(()=>(window as any).__minimalPreview.state().pos)).toBe(1);
    const before=await page.evaluate(()=>(window as any).__minimalPreview.state().seeks.length);
    await page.mouse.move(85,420);await page.mouse.down();
    await page.mouse.move(88,427);await page.mouse.move(95,429);
    await page.mouse.move(290,432,{steps:12});await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>Math.abs((window as any).__minimalPreview.state().pos))).toBe(0);
    expect(await page.evaluate(()=>(window as any).__minimalPreview.state().seeks.length)).toBe(before);
});

test('touch swipes page horizontally while vertical lyric scrolling remains native',async({browser,baseURL})=>{
    const context=await browser.newContext({baseURL,viewport:{width:393,height:873},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    try {
        const page=await context.newPage();await page.goto('/minimal-stage-preview.html?page=cover&stationary=1&lines=80');await page.waitForTimeout(700);
        const cdp=await context.newCDPSession(page);
        const swipe=async(x:number,y:number,dx:number,dy:number)=>{
            await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
            for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/12,y:y+dy*i/12}]});await page.waitForTimeout(18);}
            await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(450);
        };
        await swipe(310,400,-250,8);
        expect(await page.evaluate(()=>(window as any).__minimalPreview.state().pos)).toBe(1);
        const initial=await page.locator('.min-lyrics__scroll').evaluate(e=>e.scrollTop);
        await swipe(190,580,2,-180);
        expect(await page.locator('.min-lyrics__scroll').evaluate(e=>e.scrollTop)).toBeGreaterThan(initial+30);
        expect(await page.evaluate(()=>(window as any).__minimalPreview.state().pos)).toBe(1);
        await swipe(70,420,250,6);
        expect(await page.evaluate(()=>Math.abs((window as any).__minimalPreview.state().pos))).toBe(0);
    }finally{await context.close();}
});
