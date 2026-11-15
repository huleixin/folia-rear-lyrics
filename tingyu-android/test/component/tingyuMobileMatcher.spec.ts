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

test('long matching results scroll by touch while the save action stays visible',async({page,context})=>{
    await page.setViewportSize({width:393,height:852});
    await page.goto('/dev-probe.html?probe=mobileLyricMatcher&sandbox');
    const sheet=page.getByTestId('mobile-lyric-matcher'),results=sheet.locator('.ty-match-results');
    await expect(sheet).toBeVisible();
    expect(await results.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
    const rect=(await results.boundingBox())!,cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
    const x=rect.x+rect.width/2,start=rect.y+rect.height-30,end=rect.y+30;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:start}]});
    for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:start+(end-start)*i/12}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>results.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
    const confirm=await sheet.locator('.ty-confirm').boundingBox();
    expect(confirm!.y+confirm!.height).toBeLessThanOrEqual(852);
    await results.evaluate(el=>{el.scrollTop=el.scrollHeight});
    const last=sheet.locator('.ty-match-result').last();await last.click();
    await expect(last).toHaveAttribute('aria-pressed','true');
    await cdp.detach();
});
