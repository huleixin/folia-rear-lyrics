import { test, expect } from './fixtures';

// test/component/tingyuMobileMatcher.spec.ts
for(const size of [{width:320,height:640},{width:393,height:852},{width:430,height:932}])test(`matching uses a touch-friendly single column at ${size.width}`,async({page})=>{
    await page.addInitScript(()=>{localStorage.setItem('i18nextLng','zh-CN');localStorage.setItem('folia_app_language','zh-CN');});
    await page.setViewportSize(size);await page.goto('/dev-probe.html?probe=mobileLyricMatcher&sandbox');
    const sheet=page.getByTestId('mobile-lyric-matcher');await expect(sheet).toBeVisible();
    const search=sheet.getByRole('searchbox',{name:'歌名或歌手'});await search.fill('岛屿');
    await expect(sheet.getByRole('button',{name:'岛屿来信（现场版）',exact:false})).toBeVisible();
    await sheet.getByRole('button',{name:'岛屿来信（现场版）',exact:false}).click();
    await expect(sheet.locator('.ty-match-result').nth(1)).toHaveAttribute('aria-pressed','true');
    const controls=await sheet.locator('button,select,input').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height));expect(controls.every(h=>h>=44)).toBe(true);
    const confirm=sheet.getByRole('button',{name:'使用这份歌词'}),rect=await confirm.boundingBox();expect(rect!.y+rect!.height).toBeLessThanOrEqual(size.height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await confirm.click();await expect(sheet).toHaveCount(0);await expect(page.getByText('已选择',{exact:true})).toBeVisible();
});
