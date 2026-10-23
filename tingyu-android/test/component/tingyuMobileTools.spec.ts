import { test, expect } from './fixtures';

// test/component/tingyuMobileTools.spec.ts
test.beforeEach(async({page})=>{await page.addInitScript(()=>{localStorage.setItem('i18nextLng','zh-CN');localStorage.setItem('folia_app_language','zh-CN');});await page.goto('/dev-probe.html?probe=mobileSongTools&sandbox');await expect(page.getByTestId('mobile-lyrics-tools')).toBeVisible();});
for(const size of [{width:320,height:640},{width:393,height:852},{width:430,height:932}]){
    test(`phone lyric tools fit ${size.width}x${size.height} and retain touch targets`,async({page})=>{
        await page.setViewportSize(size);
        await expect(page.getByRole('button',{name:'重新匹配歌词'})).toBeVisible();
        const targets=await page.locator('.ty-sheet button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({h:n.getBoundingClientRect().height,w:n.getBoundingClientRect().width})));
        expect(targets.every(r=>r.h>=44&&r.w>=44)).toBe(true);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
        const dialog=await page.getByRole('dialog').boundingBox();expect(dialog!.y).toBeGreaterThanOrEqual(0);expect(dialog!.y+dialog!.height).toBeLessThanOrEqual(size.height+1);
        await page.getByRole('button',{name:'延后 0.25 秒'}).click();
        await expect.poll(()=>page.evaluate(()=>window.__mobileToolsProbe!.state().offset)).toBe(250);
        await page.getByRole('button',{name:'提前 0.25 秒'}).click();
        await expect.poll(()=>page.evaluate(()=>window.__mobileToolsProbe!.state().offset)).toBe(0);
    });
}
test('imports a lyric file, switches sources and restores the platform source',async({page})=>{
    await page.getByLabel('导入歌词文件',{exact:true}).setInputFiles({name:'island.lrc',mimeType:'text/plain',buffer:Buffer.from('[00:01.00]海风吹过岛屿')});
    await expect(page.locator('.ty-actions [role="status"]')).toContainText('已提交');
    await expect(page.getByRole('button',{name:'导入的歌词',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'平台歌词',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.__mobileToolsProbe!.state().source)).toBe('online');
    await page.getByText('更多歌词操作',{exact:true}).click();
    await page.getByRole('button',{name:'恢复平台原始歌词'}).click();
    await expect(page.getByRole('button',{name:'导入的歌词',exact:true})).toHaveCount(0);
});
test('matching hands over to the existing matching action and closes the sheet',async({page})=>{
    await page.getByRole('button',{name:'重新匹配歌词'}).click();
    await expect(page.getByTestId('mobile-player-sheet')).toHaveCount(0);
    expect(await page.evaluate(()=>window.__mobileToolsProbe!.state().matched)).toBe(1);
});
test('changing song resets timing and closing the sheet restores the page',async({page})=>{
    await page.getByRole('button',{name:'延后 0.25 秒'}).click();
    await page.evaluate(()=>window.__mobileToolsProbe!.next());
    await expect(page.getByRole('heading',{name:'另一首测试歌曲'})).toBeVisible();
    expect(await page.evaluate(()=>window.__mobileToolsProbe!.state().offset)).toBe(0);
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
