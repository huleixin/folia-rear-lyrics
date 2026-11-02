import {test,expect} from './fixtures';
import path from 'node:path';
import fs from 'node:fs';
import type {Page} from '@playwright/test';

// test/component/rearControl.spec.ts
// Browser plugin not available: use the repository Playwright gallery; screenshots are Web previews.
const evidence=process.env.TINGYU_QA_DIR||'test-results';
async function capture(page:Page,name:string){
    fs.mkdirSync(evidence,{recursive:true});
    await page.locator('[data-folia-settings-panel]').screenshot({path:path.join(evidence,name+'.png')});
    const colors=await page.locator('.ty-rear-center strong,.ty-rear-center small,.ty-rear-fact,.ty-rear-choices button').evaluateAll(elements=>elements.filter(e=>!e.closest(':disabled')).map(el=>{
        const css=getComputedStyle(el),box=(el.closest('.ty-settings-row')??el).getBoundingClientRect();
        let opacity=1;for(let node:Element|null=el;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);
        return{text:el.textContent,color:css.color,opacity,fontSize:css.fontSize,x:box.left+6,y:box.top+5};
    }));
    fs.writeFileSync(path.join(evidence,name+'.colors.json'),JSON.stringify(colors,null,2));
}
for(const backend of ['lsp','shizuku'] as const)for(const light of [false,true])test(`${backend} ${light?'light':'dark'} control and advanced`,async({page,mount})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width:393,height:852});await mount('rearControl');
    await page.evaluate(({backend,light})=>(window as any).__rearFixture(backend,light),{backend,light});
    await expect(page.locator('.ty-rear-entry')).toContainText(backend==='lsp'?'LSP':'Shizuku');
    expect(await page.locator('.ty-rear-entry').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(85);
    await expect(page.locator('.ty-rear-entry')).not.toContainText('控制引擎');await expect(page.locator('.ty-rear-entry img')).toHaveCount(0);
    await page.locator('.ty-rear-entry').click();await expect(page.getByRole('heading',{name:'背屏歌词',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'LSP',exact:true})).toHaveAttribute('aria-pressed',String(backend==='lsp'));
    await expect(page.getByText(backend==='lsp'?'LSPosed 模块':'Shizuku 服务',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await capture(page,`rear-${backend}-${light?'light':'dark'}-web`);
    await page.getByRole('button',{name:/高级设置/}).click();await expect(page.getByRole('heading',{name:'高级设置',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:/Legacy/})).toBeVisible();await expect(page.getByText('锁屏启动路线',{exact:true})).toHaveCount(backend==='shizuku'?1:0);
    await page.getByRole('button',{name:/Legacy/}).click();await expect(page.getByRole('button',{name:/Legacy/})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('switch',{name:'遮盖息屏'}).click();await expect(page.getByRole('switch',{name:'遮盖息屏'})).toHaveAttribute('aria-checked','true');
    await capture(page,`rear-${backend}-${light?'light':'dark'}-advanced-web`);
    await page.getByRole('button',{name:'返回',exact:true}).click();await expect(page.getByRole('heading',{name:'背屏歌词',exact:true})).toBeVisible();
    await page.getByRole('switch',{name:'背屏歌词',exact:true}).click();await expect(page.getByText('背屏已活跃',{exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'LSP',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Shizuku',exact:true})).toBeDisabled();
    await page.getByRole('switch',{name:'背屏歌词',exact:true}).click();await expect(page.getByRole('button',{name:'Shizuku',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:backend==='lsp'?/模块配置与使用说明/:/授权说明与故障帮助/}).click();
    await expect(page.getByRole('button',{name:'返回',exact:true})).toBeVisible();
    await expect(page.getByTestId('rear-lsp-guide')).toHaveCount(backend==='lsp'?1:0);
    await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:/诊断与日志/}).click();
    await expect(page.getByRole('button',{name:'导出诊断数据',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
});
for(const width of [320,360])test(`small screen and 150% text ${width}`,async({page,mount})=>{
    await page.setViewportSize({width,height:852});await mount('rearControl');
    await page.evaluate(()=>(window as any).__rearFixture('shizuku',true));await page.locator('.ty-rear-entry').click();
    await page.evaluate(()=>document.documentElement.style.fontSize='24px');
    await page.getByRole('button',{name:/高级设置/}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:/Legacy/}).click();await expect(page.getByRole('button',{name:/Legacy/})).toHaveAttribute('aria-pressed','true');
    await page.locator('.ty-rear-page-scroll').evaluate(element=>element.scrollTop=0);
    await expect(page.getByRole('heading',{name:'高级设置',exact:true})).toBeInViewport();
    await page.locator('[data-folia-settings-panel]').screenshot({path:path.join(evidence,`rear-${width}-large-light-web.png`)});
});
