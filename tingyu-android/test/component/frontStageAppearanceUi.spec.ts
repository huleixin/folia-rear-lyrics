import {test,expect,type Page} from '@playwright/test';
import {APP_VERSION,GUIDE_VERSION_STORAGE_KEY} from '../helpers/appState';

// test/component/frontStageAppearanceUi.spec.ts
// Browser plugin not available. Exercise the actual SettingsModal and Compose document actions.
const base=process.env.TINGYU_QA_URL??'http://127.0.0.1:4173';
test.use({serviceWorkers:'block'});
async function openFront(page:Page,light:boolean){
    await page.addInitScript(({light,version,key})=>{
        localStorage.clear();localStorage.setItem('i18nextLng','zh-CN');localStorage.setItem('library_suite','mobile');
        localStorage.setItem('library_suite_prompt_seen','true');localStorage.setItem('static_mode','true');
        localStorage.setItem(key,version);localStorage.setItem('tingyu_interface_appearance_v1',light?'light':'dark');
        localStorage.setItem('default_theme_daylight',String(light));
    },{light,version:APP_VERSION,key:GUIDE_VERSION_STORAGE_KEY});
    await page.goto(base+'/');await page.getByText('为你发现更多好音乐',{exact:true}).waitFor();
    await page.evaluate(async()=>{
        // Vite HMR can timestamp module URLs. Reuse the loaded store instead of creating a second instance.
        const url=performance.getEntriesByType('resource').find(r=>r.name.includes('/src/stores/useSettingsModalStore.ts'))!.name;
        const {useSettingsModalStore}=await import(/* @vite-ignore */url);useSettingsModalStore.getState().openSettings('options','visualizer');
    });
    await page.locator('[data-front-stage-settings]').waitFor();
    await page.evaluate(async light=>{
        document.documentElement.style.setProperty('--folia-main-inset-top','34px');document.documentElement.style.setProperty('--folia-main-inset-bottom','24px');
        // Android's appearance bridge supplies these page tokens. Simulate that boundary in Chromium.
        const module='/src/services/interfaceAppearance.ts';const {lightInterfaceTokens}=await import(/* @vite-ignore */module);
        document.documentElement.dataset.interfaceAppearance=light?'light':'dark';
        for(const [key,value] of Object.entries(lightInterfaceTokens)){if(light)document.documentElement.style.setProperty(key,value as string);else document.documentElement.style.removeProperty(key);}
    },light);
}
async function pad(page:Page,label:string,x:number,y:number,root='[data-front-stage-settings]'){
    await page.evaluate(async({label,x,y,root})=>{
        const module='/src/services/nativeSettingsDocument.ts';const {captureSettingsDocument}=await import(/* @vite-ignore */module);
        const {document:doc,actions}=captureSettingsDocument(document.querySelector(root));
        const control=doc.controls.find((c:any)=>c.kind==='pad'&&c.label===label);
        if(!control)throw Error('Missing native color pad: '+label);
        actions[control.id]({value:1,text:JSON.stringify({x,y})});actions[control.id]({value:2,text:JSON.stringify({x,y})});
    },{label,x,y,root});
}
for(const width of [320,393])for(const light of [false,true])test(`front editor ${width} ${light?'light':'dark'}: page, hue, persistence and back`,async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize({width,height:852});await openFront(page,light);
    const front=page.locator('[data-front-stage-settings]');
    await expect(front.getByRole('heading',{name:'舞台样式与字体',exact:true})).toBeInViewport();
    expect((await front.locator('h1').boundingBox())!.y).toBeGreaterThanOrEqual(34);
    await expect(front.locator('[data-stage-presentation="page"]')).toBeVisible();
    await front.getByRole('button',{name:'歌词动画',exact:true}).click();
    await front.getByRole('button',{name:'浮名',exact:true}).click();
    await front.locator('[data-folia-stage-preview] canvas').first().waitFor({timeout:15000});
    await page.screenshot({path:info.outputPath('stage.png')});
    await front.getByRole('button',{name:'主题与配色',exact:true}).click();
    await expect(front.getByRole('heading',{name:'主题与配色',exact:true})).toBeInViewport();
    await expect(front.locator('.ty-rear-theme-hint')).toContainText('当前正面舞台');
    await front.getByRole('button',{name:'编辑深色配色',exact:true}).click();
    const accent=front.getByRole('button',{name:/强调色 #/});
    await accent.click();
    // Start at exact white, then exercise the very same pad actions invoked by Compose.
    await pad(page,'Color',0,0);await expect(accent).toContainText(/#ffffff/i);
    await pad(page,'Hue',0.34,0.5);await expect(accent).not.toContainText(/#ffffff/i);
    const green=(await accent.innerText()).match(/#[0-9a-f]{6}/i)![0].toLowerCase();
    await pad(page,'Hue',0.7,0.5);await expect.poll(async()=>(await accent.innerText()).toLowerCase()).not.toContain(green);
    const blue=(await accent.innerText()).match(/#[0-9a-f]{6}/i)![0].toLowerCase();
    expect(blue).not.toBe('#f4f4f5');
    await page.screenshot({path:info.outputPath('theme.png')});
    await front.getByRole('button',{name:'保存自定义主题',exact:true}).click();
    await expect(front.getByRole('heading',{name:'舞台样式与字体',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('custom_dual_theme')!).dark.accentColor.toLowerCase())).toBe(blue);
    await front.getByRole('button',{name:'主题与配色',exact:true}).click();
    await front.getByRole('button',{name:'编辑深色配色',exact:true}).click();
    await expect(front.getByRole('button',{name:/强调色 #/})).toContainText(new RegExp(blue,'i'));
    await page.keyboard.press('Escape');await expect(front.getByRole('heading',{name:'舞台样式与字体',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.keyboard.press('Escape');await expect(front).toHaveCount(0);
    expect(errors).toEqual([]);
});
for(const light of [false,true])test(`rear palette ${light?'light':'dark'}: neutral hue edit stays in the rear profile`,async({page},info)=>{
    await page.setViewportSize({width:393,height:852});
    await page.addInitScript(()=>{localStorage.clear();localStorage.setItem('i18nextLng','zh-CN');});
    await page.goto(base+'/dev-probe.html?probe=rearControl');
    await page.waitForFunction(()=>Boolean((window as any).__rearFixture));
    await page.evaluate(light=>(window as any).__rearFixture('lsp',light),light);
    await page.locator('.ty-rear-entry').click();await page.getByRole('button',{name:/歌词舞台外观/}).click();
    await page.getByRole('switch',{name:'独立配置背屏歌词舞台',exact:true}).click();
    const frontBefore=await page.evaluate(()=>localStorage.getItem('custom_dual_theme'));
    await page.getByRole('button',{name:/主题与配色/}).click();await page.locator('.react-colorful').waitFor();
    await page.getByRole('button',{name:'编辑深色配色',exact:true}).click();
    const accent=page.getByRole('button',{name:/强调色 #/});await accent.click();
    await pad(page,'Color',0,0,'[data-mobile-settings]');await expect(accent).toContainText(/#ffffff/i);
    await pad(page,'Hue',0.7,0.5,'[data-mobile-settings]');await expect(accent).not.toContainText(/#ffffff/i);
    const value=(await accent.innerText()).match(/#[0-9a-f]{6}/i)![0].toLowerCase();
    await page.screenshot({path:info.outputPath('rear-theme.png')});
    await page.getByRole('button',{name:'保存自定义主题',exact:true}).click();
    const rear=await page.evaluate(()=>(window as any).__rearAppearance());expect(rear.profile.themes.dark.accentColor.toLowerCase()).toBe(value);
    expect(await page.evaluate(()=>localStorage.getItem('custom_dual_theme'))).toBe(frontBefore);
    expect(await page.evaluate(()=>(window as any).__rearCalls)).toEqual([]);
});
