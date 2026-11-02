import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

// test/component/rearAppearanceUi.spec.ts
// Browser plugin not available. Real DOM layout plus native-document/actions; no device claims.
const evidence=process.env.TINGYU_QA_DIR||'test-results';
async function appearance(page:Page,mount:(name:string)=>Promise<unknown>,light=false){
    await mount('rearControl');await page.evaluate(light=>(window as any).__rearFixture('lsp',light),light);
    await page.locator('.ty-rear-entry').click();await page.getByRole('button',{name:/歌词舞台外观/}).click();
    await page.evaluate(()=>{document.documentElement.style.setProperty('--folia-main-inset-top','34px');document.documentElement.style.setProperty('--folia-main-inset-bottom','24px');});
}
async function nativeDocument(page:Page){
    return page.evaluate(async()=>{
        const module='/src/services/nativeSettingsDocument.ts',m=await import(/* @vite-ignore */module);
        const start=performance.now(),result=m.captureSettingsDocument(document.querySelector('[data-mobile-settings]'));
        return{...result.document,captureMs:performance.now()-start};
    });
}
test('follow keeps disabled controls visible; native actions obey the master switch',async({page,mount})=>{
    await page.setViewportSize({width:393,height:852});await appearance(page,mount);
    const master=page.getByRole('switch',{name:'独立配置背屏歌词舞台',exact:true});
    await expect(page.getByRole('button',{name:/舞台样式与字体/})).toBeVisible();
    await expect(page.getByRole('button',{name:/舞台样式与字体/})).toBeDisabled();
    const before=await nativeDocument(page);expect(before.controls.find((c:any)=>c.label==='舞台浅色外观')?.disabled).toBe(true);
    // Exercise exactly the JS action called by Compose, not just a browser pointer.
    await page.evaluate(async()=>{const module='/src/services/nativeSettingsDocument.ts',m=await import(/* @vite-ignore */module);const {document:doc,actions}=m.captureSettingsDocument(document.querySelector('[data-mobile-settings]'));const c=doc.controls.find((c:any)=>c.label==='独立配置背屏歌词舞台');actions[c.id]({});});
    await expect(master).toHaveAttribute('aria-checked','true');await expect(page.getByRole('button',{name:/主题与配色/})).toBeEnabled();
    const limiter=page.getByRole('switch',{name:'动画帧率上限',exact:true});
    await limiter.click();await expect(page.locator('.ty-rear-fps input')).toBeDisabled();await limiter.click();
    await page.locator('.ty-rear-fps input').fill('2');
    await expect.poll(()=>page.evaluate(()=>(window as any).__rearAppearance().profile.visual.visualizerFrameRate)).toBe(90);
    await page.getByRole('switch',{name:'歌词舞台静态模式',exact:true}).click();
    await master.click();await expect(page.getByRole('button',{name:/备份与恢复/})).toBeDisabled();await master.click();
    await expect(page.getByRole('switch',{name:'歌词舞台静态模式',exact:true})).toHaveAttribute('aria-checked','true');
    await page.getByRole('button',{name:/备份与恢复/}).click();await expect(page.getByRole('heading',{name:'备份与恢复',exact:true})).toBeVisible();
    await page.evaluate(()=>(window as any).Capacitor.getPlatform=()=> 'web');
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出背屏外观 JSON',exact:true}).click();
    const download=await downloadEvent,saved=await fs.readFile((await download.path())!,'utf-8');expect(JSON.parse(saved).profile.visual.staticMode).toBe(true);
    await page.getByRole('textbox',{name:'导入背屏外观 JSON',exact:true}).fill(saved);
    await page.getByRole('button',{name:'导入背屏外观 JSON',exact:true}).click();
    await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page.getByRole('heading',{name:'歌词舞台外观',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>(window as any).__rearCalls)).toEqual([]);
});
for(const width of [320,360,393])for(const light of [false,true])test(`editors fit ${width} ${light?'light':'dark'} and palette changes reach the rear config`,async({page,mount})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:852});await appearance(page,mount,light);
    if(width===320)await page.evaluate(()=>document.documentElement.style.fontSize='24px');
    await page.getByRole('switch',{name:'独立配置背屏歌词舞台',exact:true}).click();
    await page.screenshot({path:path.join(evidence,`rear-appearance-${width}-${light?'light':'dark'}.png`)});
    const start=Date.now();await page.getByRole('button',{name:/主题与配色/}).click();await page.locator('.react-colorful').waitFor();
    const readyMs=Date.now()-start;
    await expect(page.getByRole('heading',{name:'主题与配色',exact:true})).toBeInViewport();
    expect((await page.getByRole('heading',{name:'主题与配色',exact:true}).boundingBox())!.y).toBeGreaterThanOrEqual(34);
    await expect(page.getByRole('button',{name:'编辑浅色配色',exact:true})).toBeInViewport();
    const doc=await nativeDocument(page);expect(doc.areas.length).toBeGreaterThan(0);
    expect(doc.controls.find((c:any)=>c.label==='编辑浅色配色').y).toBeGreaterThan(34);
    for(const area of doc.areas){expect(area.y).toBeGreaterThanOrEqual(34);expect(area.y+area.h).toBeLessThanOrEqual(853);}
    await page.getByRole('button',{name:'编辑浅色配色',exact:true}).click();
    await page.getByRole('button',{name:/背景 #08251d/i}).click();
    await page.getByRole('button',{name:'#74D9BA',exact:true}).click();
    await page.getByRole('button',{name:'保存自定义主题',exact:true}).click();
    await page.getByRole('switch',{name:'舞台浅色外观',exact:true}).click();
    const resolved=await page.evaluate(async()=>{const module='/src/services/rearStageAppearance.ts',{resolveRearStageConfig}=await import(/* @vite-ignore */module);const data=(window as any).__rearAppearance();return resolveRearStageConfig({playbackSongKey:'current-song',playbackSessionId:'current-session',lyrics:{lines:[{fullText:'kept'}]}},data);});
    expect(resolved.theme.backgroundColor.toLowerCase()).toBe('#74d9ba');expect(resolved.playbackSongKey).toBe('current-song');expect(resolved.lyrics.lines[0].fullText).toBe('kept');
    await page.getByRole('button',{name:/主题与配色/}).click();await expect(page.getByRole('button',{name:/背景 #74d9ba/i})).toBeVisible();
    await page.screenshot({path:path.join(evidence,`rear-theme-${width}-${light?'light':'dark'}.png`)});
    await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:/舞台样式与字体/}).click();
    await expect(page.getByRole('button',{name:'通用',exact:true})).toBeVisible();
    expect((await page.getByRole('heading',{name:'舞台样式与字体',exact:true}).boundingBox())!.y).toBeGreaterThanOrEqual(34);
    await page.getByRole('button',{name:'背景',exact:true}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:path.join(evidence,`rear-stage-${width}-${light?'light':'dark'}.png`)});
    expect(errors).toEqual([]);expect(await page.evaluate(()=>(window as any).__rearCalls)).toEqual([]);
    console.log(JSON.stringify({width,light,readyMs,captureMs:doc.captureMs,paints:doc.paints.length,controls:doc.controls.length,areas:doc.areas.length}));
});
