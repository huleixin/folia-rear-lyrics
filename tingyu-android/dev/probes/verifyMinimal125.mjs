import {chromium} from 'playwright';
import fs from 'node:fs';

// dev/probes/verifyMinimal125.mjs
// Browser plugin not available: reuse the local real-component preview, not a phone performance claim.
const base=process.env.PREVIEW_ORIGIN??'http://127.0.0.1:4399';
const out=process.env.QA_OUTPUT??'.minimal-125-qa'; fs.mkdirSync(out,{recursive:true});
const results=[];const check=(name,pass,detail='')=>{results.push({name,pass,detail});console.log(`${pass?'PASS':'FAIL'} ${name} ${detail}`);};
const browser=await chromium.launch();
try{
    for(const theme of ['dark','light']){
        const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
        const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(`${base}/minimal-stage-preview.html?stationary=1&theme=${theme}`);
        await page.waitForSelector('.min-art img');await page.waitForTimeout(550);
        const art=await page.locator('.min-cover__art').boundingBox();const bitmap=await page.locator('.min-cover__art .min-art').boundingBox();
        check(`${theme} cover has definite square geometry`,Math.abs(art.height-art.width)<1&&Math.abs(bitmap.height-art.height)<1);
        await page.screenshot({path:`${out}/${theme}-cover.png`});
        const covers=await page.evaluate(async()=>{
            let valid=true;const spans=[...document.querySelectorAll('.min-amb__blob')];
            const animations=spans.map(n=>n.getAnimations()[0]);
            animations.forEach(a=>a.pause());
            for(const t of [0,2000,5000,8000,12000,20000,28000]){
                animations.forEach(a=>a.currentTime=t);
                await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
                for(const n of spans){const r=n.getBoundingClientRect();if(r.left>0||r.top>0||r.right<innerWidth||r.bottom<innerHeight)valid=false;}
            }
            return valid;
        });
        check(`${theme} every glow covers all screen edges throughout its motion`,covers);
        await page.locator('.min-dot').nth(1).click();await page.waitForTimeout(500);
        await page.evaluate(()=>document.querySelector('.min-amb').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=0;}));
        const first=await page.locator('.min-amb').screenshot();
        await page.evaluate(()=>document.querySelector('.min-amb').getAnimations({subtree:true}).forEach(a=>a.currentTime=8000));
        const second=await page.locator('.min-amb').screenshot();
        const delta=await page.evaluate(async([first,second])=>{
            const canvas=document.createElement('canvas');canvas.width=80;canvas.height=160;const ctx=canvas.getContext('2d');
            const pixels=async(base64)=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();ctx.clearRect(0,0,80,160);ctx.drawImage(image,0,0,80,160);return ctx.getImageData(0,0,80,160).data;};
            const a=await pixels(first),b=await pixels(second);let sum=0;for(let i=0;i<a.length;i++)if(i%4!==3)sum+=Math.abs(a[i]-b[i]);return sum/(80*160*3);
        },[first.toString('base64'),second.toString('base64')]);
        check(`${theme} flow changes the actual background pixels`,delta>2,`mean RGB change=${delta.toFixed(2)}`);
        await page.screenshot({path:`${out}/${theme}-lyrics.png`});
        const tail=await page.locator('[data-folium-part="progress.thumb"]').evaluate(n=>({width:parseFloat(getComputedStyle(n.parentElement,'::before').width),animation:getComputedStyle(n.parentElement,'::before').animationName}));
        check(`${theme} progress tail fits the played distance`,tail.width>0&&tail.width<=76,JSON.stringify(tail));
        const range=page.locator('.min-seek input');await range.evaluate(n=>{n.value='150';n.dispatchEvent(new Event('input',{bubbles:true}));});
        check(`${theme} shared seek still reaches the requested time`,await page.evaluate(()=>window.__minimalPreview.state().seeks.includes(150)));
        const rangeBox=await range.boundingBox();await page.mouse.move(rangeBox.x+rangeBox.width*.5,rangeBox.y+rangeBox.height*.5);await page.mouse.down();
        check(`${theme} drag strengthens the tail`,await page.locator('.min-transport').getAttribute('data-seeking')!==null);await page.mouse.up();
        check(`${theme} scripts`,errors.length===0,errors.join('|'));await context.close();
    }
    const page=await browser.newPage({viewport:{width:393,height:852}});
    await page.goto(`${base}/minimal-stage-preview.html?stationary=1&broken=1`);
    await page.waitForFunction(()=>document.querySelector('.min-cover__art img')?.naturalWidth>0);
    check('failed display URL recovers the same-song metadata image',await page.locator('.min-cover__art img').getAttribute('src')==='/dev/assets/minimal-preview-cover.jpg');
    await page.screenshot({path:`out/recovered.png`.replace('out/',out+'/')});
    await page.route('**/dev/assets/minimal-preview-cover.jpg',route=>route.abort());
    await page.goto(`${base}/minimal-stage-preview.html?stationary=1&broken=1`);
    await page.waitForFunction(()=>document.querySelector('.min-cover__art .min-art')?.dataset.artworkState==='unavailable');
    check('complete failure shows a visible, nonzero placeholder',await page.locator('.min-cover__art .min-art__empty').isVisible()&&await page.locator('.min-cover__art img').count()===0);
    await page.unrouteAll();
    await page.goto(`${base}/minimal-stage-preview.html?stationary=1&preparing=1`);
    check('real preparation signal is distinguishable from a faded play glyph',await page.locator('.min-btn--play').getAttribute('aria-busy')==='true'&&await page.locator('.min-play-loading').isVisible());
    await page.goto(`${base}/minimal-stage-preview.html?stationary=1&paused=1`);
    check('pause stops glow animation',await page.locator('.min-amb__blob').first().evaluate(n=>getComputedStyle(n).animationPlayState)==='paused');
    check('pause stops progress shimmer',await page.locator('[data-folium-part="progress.thumb"]').evaluate(n=>getComputedStyle(n.parentElement,'::before').animationName)==='none');
    await page.emulateMedia({reducedMotion:'reduce'});
    check('system reduced-motion stops flow',await page.locator('.min-amb__blob').first().evaluate(n=>getComputedStyle(n).animationName)==='none');
    await page.close();
}finally{await browser.close();}
fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
console.log(`${results.filter(x=>x.pass).length}/${results.length} passed`);process.exitCode=results.some(x=>!x.pass)?1:0;
