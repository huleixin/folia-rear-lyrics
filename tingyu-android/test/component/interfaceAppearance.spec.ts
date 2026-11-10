import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
import fs from 'node:fs';

// test/component/interfaceAppearance.spec.ts
// Browser plugin not available. Playwright verifies DOM/CSS; it is not Android GPU evidence.
const evidence=process.env.TINGYU_QA_DIR||'test-results';
async function nativeBoundary(page:Page,seed=true){
    await page.addInitScript((seed)=>{
        (window as any).CapacitorCustomPlatform={name:'android'};
        (window as any).Capacitor={getPlatform:()=> 'android'};
        if(seed)localStorage.setItem('tingyu_interface_appearance_v1','dark');
        localStorage.setItem('i18nextLng','zh-CN');
    },seed);
    await page.route('**/src/services/nativeChrome.ts',async route=>{
        const response=await route.fetch();let source=await response.text();
        source=source.replace(/export const chromeNative = registerPlugin(?:<[\s\S]*?>)?\(['"]TingyuChrome['"]\);/,`export const chromeNative = {
            appearance:async ({mode,style})=>{if(mode)localStorage.setItem('native-appearance-mirror',mode);if(style)localStorage.setItem('native-style-mirror',style);const current=mode||localStorage.getItem('native-appearance-mirror')||'dark';return {mode:current,style:style||localStorage.getItem('native-style-mirror')||'classic',systemLight:matchMedia('(prefers-color-scheme: light)').matches};},
            addListener:async()=>({remove:async()=>{}}),
            probe:async()=>({supported:false}),
        };`);
        await route.fulfill({response,body:source});
    });
}
for(const width of [320,393,588])test(`appearance live switch and typography ${width}`,async({page,mount})=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await nativeBoundary(page);await page.setViewportSize({width,height:1000});await mount('interfaceAppearance');
    const identity=await page.getByTestId('mount-id').textContent();
    await page.getByRole('textbox',{name:'保留的搜索内容'}).fill('周杰伦');
    const before=await page.getByTestId('player-visual-surface').evaluate(node=>({ink:getComputedStyle(node).color,bg:getComputedStyle(node).backgroundColor}));
    await page.getByRole('radio',{name:'浅色',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-interface-appearance','light');
    await expect(page.getByRole('textbox')).toHaveValue('周杰伦');
    await expect(page.getByTestId('mount-id')).toHaveText(identity!);
    expect(await page.getByTestId('player-visual-surface').evaluate(node=>({ink:getComputedStyle(node).color,bg:getComputedStyle(node).backgroundColor}))).toEqual(before);
    await expect(page.getByTestId('stage-state')).toHaveText('false');
    await page.evaluate(()=>document.documentElement.style.fontSize='24px');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.waitForTimeout(900); // Settle the production JS spring before comparing color pixels.
    await page.screenshot({path:`${evidence}/appearance-light-settings-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'普通弹窗',exact:true}).click();
    await expect(page.locator('[data-folia-themed-dialog] h2')).toHaveClass(/text-zinc-900/);
    await page.locator('[data-folia-themed-dialog] button').first().click();
    await expect(page.locator('[data-folia-themed-dialog]')).toHaveCount(0);
    await page.getByRole('button',{name:'定时关闭',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(241, 244, 237)');
    await page.waitForTimeout(900); // Settle the production JS spring before comparing color pixels.
    await page.screenshot({path:`${evidence}/appearance-light-sleep-${width}.png`});
    expect(errors).toEqual([]);
});
test('system follows live changes, overrides ignore them and reopening restores selection',async({page,mount})=>{
    await nativeBoundary(page);await page.emulateMedia({colorScheme:'dark'});await mount('interfaceAppearance');
    await page.getByRole('radio',{name:'跟随系统',exact:true}).click();
    await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-interface-appearance','light');
    await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-interface-appearance','dark');
    await page.getByRole('radio',{name:'浅色',exact:true}).click();
    await page.emulateMedia({colorScheme:'light'});await page.emulateMedia({colorScheme:'dark'});
    await expect(page.locator('html')).toHaveAttribute('data-interface-appearance','light');
    // A second mount uses the same store; it must not reset the deadline/preference.
    await page.evaluate(async()=>{await window.unmount();await window.mount({story:'interfaceAppearance'});});await expect(page.getByRole('radio',{name:'浅色',exact:true})).toHaveAttribute('aria-checked','true');
    await page.getByRole('radio',{name:'深色',exact:true}).click();
    await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-interface-appearance','dark');
});

test('actual mobile home, directory and playlist retain their dark pixels after a round trip',async({page})=>{
    await page.setViewportSize({width:393,height:852});
    await page.goto('/dev-probe.html?probe=homeBehavior&sandbox');
    await page.waitForFunction(()=>!!window.__homeProbe?.ready());
    await page.evaluate(()=>window.__homeProbe!.setSuite('mobile'));
    const home=page.getByTestId('mobile-home');await expect(home).toBeVisible();
    await page.addStyleTag({content:'[data-testid="dev-library-renderer-switch"]{display:none!important}*{transition:none!important;animation:none!important}'});
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(900);
    const colors=()=>home.evaluate(node=>Array.from(node.querySelectorAll('.ml-home-playlist-card,.ml-home-playlist-copy,h2,button')).map(el=>{const s=getComputedStyle(el);return [s.color,s.backgroundColor,s.backgroundImage,s.borderColor];}));
    const baseline=await colors();
    const card=page.locator('.ml-home-playlist-card').first();
    await page.evaluate(()=>document.documentElement.dataset.interfaceAppearance='light');
    await page.waitForTimeout(900); // Settle the production JS spring before comparing color pixels.
    await page.screenshot({path:`${evidence}/appearance-light-home.png`});
    expect(await home.evaluate(node=>getComputedStyle(node).getPropertyValue('--ml-ink').trim())).toBe('#213e34');
    expect(await card.evaluate(node=>getComputedStyle(node).backgroundImage)).not.toContain('20, 36, 31');
    await page.evaluate(()=>document.documentElement.dataset.interfaceAppearance='dark');
    await page.waitForTimeout(900);
    // No dark CSS paint rules changed. This catches accidental generic selector changes.
    expect(await colors()).toEqual(baseline);
    await page.waitForTimeout(900); // Settle the production JS spring before comparing color pixels.
    await page.screenshot({path:`${evidence}/appearance-dark-home.png`});
    await page.evaluate(()=>document.documentElement.dataset.interfaceAppearance='light');
    await page.locator('.ml-home-playlist-copy').filter({hasText:'Public Playlist'}).click();
    const collection=page.getByTestId('mobile-collection');await expect(collection.getByTestId('mobile-song-row').first()).toBeVisible();
    await page.waitForTimeout(900); // Settle the production JS spring before comparing color pixels.
    await page.screenshot({path:`${evidence}/appearance-light-playlist.png`});
    await collection.getByRole('button',{name:'Search this playlist'}).click();
    const filter=collection.getByRole('textbox',{name:'Search this playlist'});await filter.fill('Track 2 Cedar');
    await page.evaluate(()=>document.documentElement.dataset.interfaceAppearance='dark');
    await page.evaluate(()=>document.documentElement.dataset.interfaceAppearance='light');
    await expect(filter).toHaveValue('Track 2 Cedar');
    await collection.getByRole('button',{name:'Back',exact:true}).click();
    await page.locator('.ml-footer nav button').nth(1).click();
    await expect(page.locator('[data-page="library"]')).toBeVisible();
    await page.waitForTimeout(900); // Settle the production JS spring before comparing color pixels.
    await page.screenshot({path:`${evidence}/appearance-light-library.png`});
});
test('actual search keeps focus and query through light/dark switching and keyboard resize',async({page})=>{
    await page.setViewportSize({width:360,height:852});
    await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
    await expect(page.getByTestId('tingyu-search-workspace')).toBeVisible();
    await page.locator('.ty-search').evaluate(async node=>{await Promise.all(node.getAnimations().map(animation=>animation.finished));});
    await page.evaluate(()=>window.__stubOmniSuggest());
    const input=page.locator('.ty-search-field input');await input.fill('许嵩');
    await page.evaluate(()=>document.documentElement.dataset.interfaceAppearance='light');
    await expect(input).toHaveValue('许嵩');await expect(input).toBeFocused();
    await page.waitForTimeout(900); // Settle the production JS spring before comparing color pixels.
    await page.screenshot({path:`${evidence}/appearance-light-search.png`});
    await page.setViewportSize({width:360,height:520});
    await page.evaluate(()=>document.documentElement.dataset.interfaceAppearance='dark');
    await page.evaluate(()=>document.documentElement.dataset.interfaceAppearance='light');
    await expect(input).toHaveValue('许嵩');await expect(input).toBeFocused();
    expect(await page.locator('.ty-search').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
});

test('all four palettes update open UI without losing input, scroll, dialog or independent stage state',async({page,mount})=>{
    await nativeBoundary(page);await page.setViewportSize({width:393,height:1000});await mount('interfaceAppearance');
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    const identity=await page.getByTestId('mount-id').textContent();
    await page.getByRole('textbox',{name:'保留的搜索内容'}).fill('保留音乐搜索');
    const stage=()=>page.getByTestId('player-visual-surface').evaluate(el=>({ink:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
    const before=await stage();
    const flow=await page.locator('.ty-interface-setting').evaluate(async element=>{
        const module='/src/services/nativeSettingsSemantic.ts';
        const {captureSemanticSettings}=await import(/* @vite-ignore */module);
        return captureSemanticSettings(element as HTMLElement,'theme-preview','外观').document.flow;
    });
    fs.writeFileSync(evidence+'/theme-preview.json',JSON.stringify(flow,null,2));
    for(const [style,label,light,dark] of [['classic','经典','rgb(33, 62, 52)','rgb(244, 244, 245)'],['glacier','冰川','rgb(23, 42, 56)','rgb(232, 241, 249)']]){
        await page.getByRole('radio',{name:label,exact:true}).click();
        for(const [mode,modeLabel,ink] of [['light','浅色',light],['dark','深色',dark]]){
            await page.getByRole('radio',{name:modeLabel,exact:true}).click();
            await expect(page.locator('html')).toHaveAttribute('data-interface-theme',style);
            await expect(page.locator('html')).toHaveAttribute('data-interface-appearance',mode);
            expect(await page.locator('.ty-interface-setting').evaluate(el=>getComputedStyle(el).color)).toBe(ink);
            await expect(page.getByTestId('mount-id')).toHaveText(identity!);
            await expect(page.getByRole('textbox')).toHaveValue('保留音乐搜索');expect(await stage()).toEqual(before);
            await page.screenshot({path:evidence+'/theme-'+style+'-'+mode+'.png',fullPage:true});
        }
    }
    await page.getByRole('button',{name:'普通弹窗',exact:true}).click();
    await page.locator('[data-folia-themed-dialog]').evaluate(el=>el.setAttribute('data-same-dialog','retained'));
    const scroll=await page.evaluate(()=>{window.scrollTo(0,90);return scrollY;});
    // Exercise the original settings callbacks while the modal stays mounted.
    await page.getByRole('radio',{name:'经典',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());
    await page.getByRole('radio',{name:'冰川',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());
    await expect(page.locator('[data-same-dialog="retained"]')).toBeVisible();
    expect(await page.evaluate(()=>scrollY)).toBe(scroll);
    expect(await page.locator('[data-folia-themed-dialog]').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(27, 41, 58)');
    expect(await page.locator('[data-folia-themed-dialog] h2').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(232, 241, 249)');
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('native-style-mirror'))).toBe('glacier');
    expect(await stage()).toEqual(before);expect(errors).toEqual([]);
});
test('glacier system changes preserve style and a fresh document restores the saved pair',async({page,mount,browser})=>{
    await nativeBoundary(page);await mount('interfaceAppearance');
    await page.getByRole('radio',{name:'冰川',exact:true}).click();
    await page.getByRole('radio',{name:'跟随系统',exact:true}).click();
    await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-interface-appearance','light');
    await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-interface-appearance','dark');
    await expect(page.locator('html')).toHaveAttribute('data-interface-theme','glacier');
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('native-appearance-mirror'))).toBe('system');
    const restored=await browser.newContext({storageState:await page.context().storageState(),colorScheme:'light'});
    try{
        const fresh=await restored.newPage();await nativeBoundary(fresh,false);
        await fresh.goto('http://127.0.0.1:4173/dev-probe.html');await fresh.waitForFunction(()=>typeof window.mount==='function');
        await fresh.evaluate(()=>window.mount({story:'interfaceAppearance'}));
        await expect(fresh.getByRole('radio',{name:'冰川',exact:true})).toHaveAttribute('aria-checked','true');
        await expect(fresh.getByRole('radio',{name:'跟随系统',exact:true})).toHaveAttribute('aria-checked','true');
        await expect(fresh.locator('html')).toHaveAttribute('data-interface-appearance','light');
    }finally{await restored.close();}
});
