import { test, expect } from './fixtures';

// test/component/mobileStageChrome.spec.ts
test.use({ viewport: { width: 390, height: 780 } });
test('unified chrome binds playback, previous/next, repeat and seek without a second clock', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/dev-probe.html?probe=mobileStageChrome');
    await expect(page.getByTestId('mobile-stage-chrome')).toBeVisible();
    await expect(page.locator('.mps-header')).not.toHaveAttribute('data-glass-engine');
    await expect(page.locator('.mps-player')).not.toHaveAttribute('data-glass-engine');
    await expect(page.locator('.mps-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.mps-header')).toHaveCSS('backdrop-filter', 'none');
    expect(await page.locator('.mps-player').evaluate((el) => getComputedStyle(el).backdropFilter)).toMatch(/blur\(/);
    await page.getByRole('button', { name: /More|更多/, exact: true }).click();
    await page.getByRole('menuitem', { name: /Stage appearance|舞台外观/ }).click();
    await expect(page.getByTestId('style-route')).toHaveText('true:visualizer:visualizer');
    await expect(page.getByTestId('mobile-stage-chrome')).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByTestId('stage-result')).toContainText('PAUSED:1');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Next track', exact: true }).click();
    await expect(page.locator('.mps-song')).toContainText('Track 2');
    await page.getByRole('button', { name: 'Previous track', exact: true }).click();
    await expect(page.locator('.mps-song')).toContainText('Track 1');
    await page.getByRole('button', { name: 'Change repeat mode', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Change repeat mode', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
    );
    const seek = page.getByRole('slider', { name: 'Playback position', exact: true });
    const box = await seek.boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
    await expect.poll(() => seek.inputValue().then(Number)).toBeGreaterThan(120);
    await expect.poll(() => seek.inputValue().then(Number)).toBeLessThan(150);
    await page.getByRole('button', { name: 'Back to music', exact: true }).click();
    await expect(page.getByTestId('stage-result')).toContainText(':1');
    for (const viewport of [
        { width: 320, height: 568 },
        { width: 844, height: 390 },
        { width: 1024, height: 768 },
    ]) {
        await page.setViewportSize(viewport);
        const header = await page.locator('.mps-header').boundingBox(),
            player = await page.locator('.mps-player').boundingBox();
        expect(header!.y + header!.height).toBeLessThan(player!.y);
        expect(player!.x).toBeGreaterThanOrEqual(0);
        expect(player!.x + player!.width).toBeLessThanOrEqual(viewport.width);
        expect(player!.y + player!.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.getByRole('button', { name: 'Change fixture theme' }).click();
    await expect(page.locator('.mobile-player-stage')).toHaveCSS('color', 'rgb(255, 253, 246)');
    expect(errors).toEqual([]);
});

test('stage more menu exposes shared sleep timer and appearance without crowding the header',async({page})=>{
 await page.goto('/dev-probe.html?probe=mobileStageChrome');
 await page.getByRole('button',{name:/More|更多/,exact:true}).click();
 await expect(page.getByRole('menu')).toBeVisible();
 await expect(page.getByRole('menuitem',{name:/睡眠定时|Sleep timer/i})).toHaveCount(1);
 await expect(page.getByRole('menuitem',{name:/舞台外观|Stage appearance/i})).toHaveCount(1);
 await expect(page.getByTestId('stage-orientation')).toHaveAttribute('aria-pressed','false');
 const menu=page.getByRole('menu');
 expect((await menu.boundingBox())!.width).toBeLessThanOrEqual(204);
 for(const size of [{width:320,height:568},{width:844,height:390}]) {
     await page.setViewportSize(size);
     const box=(await menu.boundingBox())!;
     expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);
     expect(box.y+box.height).toBeLessThanOrEqual(size.height);
     const sleep=page.getByRole('menuitem',{name:/睡眠定时|Sleep timer/i});
     await sleep.scrollIntoViewIfNeeded();
     await expect(sleep).toBeVisible();
 }
 await page.getByRole('menuitem',{name:/睡眠定时|Sleep timer/i}).click();
 await expect.poll(()=>page.evaluate(async()=>{
     const path='/src/stores/useSleepTimerStore.ts';
     const {useSleepTimerStore}=await import(/* @vite-ignore */path);
     return useSleepTimerStore.getState().sleepTimerSheetOpen;
 })).toBe(true);
});

test('landscape control locks and restores the display without resetting playback',async({page})=>{
    await page.addInitScript(()=>{
        const calls:string[]=[];
        Object.assign(window,{stageOrientationCalls:calls});
        Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async(value:string)=>{calls.push(value);}});
        Object.defineProperty(screen.orientation,'unlock',{configurable:true,value:()=>{calls.push('unlock');}});
        Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:async()=>undefined});
    });
    // Establish the landscape viewport before the stage requests native fullscreen.
    await page.setViewportSize({width:844,height:390});
    await page.goto('/dev-probe.html?probe=mobileStageChrome&longTitle');
    const toggle=page.getByTestId('stage-orientation');
    const before=await page.getByTestId('stage-result').textContent();
    await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','true');
    const header=(await page.locator('.mps-header').boundingBox())!;
    const player=(await page.locator('.mps-player').boundingBox())!;
    expect(header.width).toBeGreaterThan(700);expect(player.width).toBeLessThanOrEqual(470);
    await expect(toggle).toHaveAccessibleName(/Restore orientation|恢复原方向/);
    await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','false');
    await expect(page.getByTestId('stage-result')).toHaveText(before!);
    const calls=await page.evaluate(()=>(window as unknown as {stageOrientationCalls:string[]}).stageOrientationCalls);
    expect(calls[0]).toBe('landscape');expect(calls).toContain('unlock');
});

// Browser plugin not available; the existing Playwright harness checks the WebView menu boundary.
test('ordinary stage menu follows glacier while its lyric surface keeps its own palette',async({page})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/dev-probe.html?probe=mobileStageChrome&theme=saturated');
    const stage=page.locator('.mobile-player-stage');
    await expect(stage).toBeVisible();
    // Settings warmup loads the shared glass styles; capture the baseline after that import.
    await page.evaluate(async()=>{
        const path='/src/components/app/dialogs/settingsModule.ts';
        const {loadSettingsModule}=await import(/* @vite-ignore */path);
        await loadSettingsModule();
    });
    await expect(page.locator('.mps-player')).toHaveCSS('background-color','rgba(12, 23, 21, 0.62)');
    const colors=()=>stage.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundImage,
        player:getComputedStyle(el.querySelector('.mps-player')!).backgroundColor}));
    const original=await colors();
    await page.getByRole('button',{name:/More|更多/,exact:true}).click();
    const menu=page.getByRole('menu');await expect(menu).toBeVisible();
    const classic=await menu.evaluate(el=>({color:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
    await menu.evaluate(el=>el.setAttribute('data-retained','true'));
    for(const mode of ['light','dark']) {
        // Keep the existing light/dark glass behavior; only the global style must be isolated.
        await page.evaluate(mode=>Object.assign(document.documentElement.dataset,{interfaceTheme:'classic',interfaceAppearance:mode,interfacePalette:'classic'}),mode);
        await expect(page.locator('.mps-player')).toHaveCSS('background-color',mode==='light'?'rgba(241, 244, 237, 0.533)':'rgba(12, 23, 21, 0.62)');
        const modeBaseline=await colors();
        expect(modeBaseline.color).toEqual(original.color);
        expect(modeBaseline.background).toEqual(original.background);
        await page.evaluate(mode=>Object.assign(document.documentElement.dataset,{interfaceTheme:'glacier',interfaceAppearance:mode,interfacePalette:'semantic'}),mode);
        await expect(menu).toHaveCSS('color',mode==='light'?'rgb(23, 42, 56)':'rgb(232, 241, 249)');
        await expect(menu).toHaveCSS('background-color',mode==='light'?'rgb(245, 249, 252)':'rgb(27, 41, 58)');
        await expect(menu).toHaveAttribute('data-retained','true');
        expect(await colors()).toEqual(modeBaseline);
        for(const width of [320,393,1024]) {
            await page.setViewportSize({width,height:852});
            const box=(await menu.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
        }
        await page.setViewportSize({width:393,height:852});
        await page.screenshot({path:(process.env.TINGYU_QA_DIR||'test-results')+'/glacier-stage-menu-'+mode+'.png',animations:'disabled'});
    }
    await page.evaluate(()=>Object.assign(document.documentElement.dataset,{interfaceTheme:'classic',interfaceAppearance:'dark',interfacePalette:'classic'}));
    await expect(menu).toHaveCSS('color',classic.color);
    await expect(menu).toHaveCSS('background-color',classic.background);
    await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
    await page.getByRole('button',{name:/More|更多/,exact:true}).click();await expect(menu).toBeVisible();
    expect(errors).toEqual([]);
});
