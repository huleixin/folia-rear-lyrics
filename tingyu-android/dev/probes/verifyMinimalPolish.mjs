import { chromium } from 'playwright';
import fs from 'node:fs';

// dev/probes/verifyMinimalPolish.mjs
// Browser plugin not available. Real components with mocked playback; no phone/frame-presentation claim.
const base = process.env.PREVIEW_ORIGIN ?? 'http://127.0.0.1:4399';
const output = '.minimal-qa';
fs.mkdirSync(output,{recursive:true});
const browser = await chromium.launch();
const checks=[];
const check=(name,pass,detail)=>{checks.push({name,pass,detail}); console.log(`${pass?'PASS':'FAIL'} ${name} ${detail??''}`);};
try {
    for(const theme of ['dark','light']) {
        const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true});
        const page=await context.newPage(); const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(`${base}/minimal-stage-preview.html?stationary=1&theme=${theme}`);
        await page.waitForFunction(()=>document.querySelector('.min-cover__art img')?.naturalWidth>0);
        await page.waitForTimeout(750);
        await page.screenshot({path:`${output}/${theme}-cover.png`});
        const art=await page.locator('.min-cover__art').boundingBox();
        check(`${theme} smaller square cover`,Math.abs(art.width-art.height)<1 && art.width<340,art.width.toFixed(1));
        await page.locator('.min-cover__artist button').click();
        check(`${theme} cover artist identity`,await page.evaluate(()=>document.documentElement.dataset.openedArtist==='周杰伦'));
        await page.locator('[data-min-more]').click();
        const menu=await page.locator('[role=menu]').boundingBox();
        check(`${theme} menu fits viewport`,menu.x>=0&&menu.x+menu.width<=393&&menu.y>=40&&menu.y+menu.height<=828);
        check(`${theme} menu has five separate rows`,await page.locator('[role=menuitem]').count()===5);
        await page.screenshot({path:`${output}/${theme}-menu.png`});
        await page.keyboard.press('Escape');
        check(`${theme} Escape closes menu`,await page.locator('[role=menu]').count()===0);
        await page.locator('.min-dot').nth(1).click();await page.waitForTimeout(500);
        await page.locator('.min-lyrics__artist button').click();
        check(`${theme} lyrics artist clickable`,await page.locator('.min-lyrics__artist button').count()===1);
        await page.screenshot({path:`${output}/${theme}-lyrics.png`});
        check(`${theme} script errors`,errors.length===0,errors.join('|'));
        await context.close();
    }
    const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.goto(`${base}/player-transition-preview.html?stationary=1`);
    await page.waitForSelector('.min');await page.waitForTimeout(500);
    await page.evaluate(()=>{window.retainedMinimal=document.querySelector('.min');});
    for(let attempt=0;attempt<3;attempt++){
        await page.locator('[data-testid=minimal-open-stage]').click(); await page.waitForTimeout(100);
        const incoming=await page.evaluate(()=>[...document.querySelectorAll('[data-stage-motion]')].map(n=>n.getBoundingClientRect().y));
        check(`visit ${attempt} stage and chrome rise together`,incoming.length===2&&incoming[0]>0&&Math.abs(incoming[0]-incoming[1])<1);
        await page.waitForTimeout(400); await page.locator('[data-testid=stage-collapse]').click();await page.waitForTimeout(110);
        const outgoing=await page.evaluate(()=>document.querySelector('[data-testid=player-visual-surface]').getBoundingClientRect().y);
        check(`visit ${attempt} stage falls downward`,outgoing>0);
        await page.waitForTimeout(400);
        check(`visit ${attempt} original lyric page retained`,await page.evaluate(()=>document.querySelector('.min')===window.retainedMinimal&&window.__stagePreview.state().page==='lyrics'&&window.__stagePreview.state().counts.stage===0));
    }
    await context.close();
} finally {await browser.close();}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(checks,null,2));
console.log(`${checks.filter(c=>c.pass).length}/${checks.length} passed`);
process.exitCode=checks.some(c=>!c.pass)?1:0;
