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
