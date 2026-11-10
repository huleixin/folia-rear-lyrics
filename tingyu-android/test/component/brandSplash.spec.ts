import { test, expect, Page } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Exercise the production HTML and blocking startup scripts without mounting the player.
async function openSplash(page: Page, style = 'classic', mode = 'dark', native?: Record<string, unknown>, query = '') {
  await page.setViewportSize({width:384,height:800});
  await page.addInitScript(({style,mode,native}) => {
    localStorage.setItem('tingyu_interface_theme_v1',style);
    localStorage.setItem('tingyu_interface_appearance_v1',mode);
    if (native) Object.assign(window,{TingyuLaunch:{config:()=>JSON.stringify(native),ready:()=>{
      const root=document.documentElement;
      root.dataset.readyCalls=String(Number(root.dataset.readyCalls||0)+1);
    }}});
  },{style,mode,native});
  await page.route('http://brand.test/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/')return route.fulfill({contentType:'text/html',body:readFileSync('index.html','utf8')});
    if(path==='/src/index.tsx'||path==='/runtime-config.js')return route.fulfill({contentType:'application/javascript',body:''});
    const allowed=['/brand-splash.css','/brand-splash.js','/interface-theme-startup.css','/interface-theme-startup.js','/brand/logo-symbol.svg'];
    if(!allowed.includes(path))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'application/javascript',body:readFileSync(resolve('public','.'+path))});
  });
  await page.goto('http://brand.test/'+query);
}
const hide = (page:Page) => page.evaluate(()=> (window as unknown as {__tingyuHideSplash:()=>void}).__tingyuHideSplash());

for(const [style,mode,bg] of [
  ['classic','light','rgb(244, 245, 238)'],['classic','dark','rgb(16, 45, 37)'],
  ['glacier','light','rgb(227, 236, 245)'],['glacier','dark','rgb(16, 26, 40)'],
]) test(style+' '+mode+' preserves starting color and finishes with no wave residue',async({page})=>{
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await openSplash(page,style,mode);
  await expect(page.locator('#app-splash')).toHaveCSS('background-color',bg);
  await expect(page.locator('.subtitle')).toHaveCSS('opacity','1');
  await expect(page.locator('.opening-wave')).toHaveCSS('visibility','hidden');
  await expect(page.locator('.logo img')).toHaveAttribute('src','/brand/logo-symbol.svg');
  if(process.env.BRAND_SCREENSHOT_DIR){mkdirSync(process.env.BRAND_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.BRAND_SCREENSHOT_DIR,style+'-'+mode+'.png')});}
  expect(errors).toEqual([]);
  await hide(page);
  await expect(page.locator('#app-splash')).toHaveCount(0);
});

test('native preferences override stale web storage and ready is idempotent',async({page})=>{
  await openSplash(page,'classic','dark',{show:true,native:true,style:'glacier',light:true,mode:'system'});
  await expect(page.locator('#app-splash')).toHaveCSS('background-color','rgb(227, 236, 245)');
  await hide(page);await hide(page);
  await expect(page.locator('html')).toHaveAttribute('data-ready-calls','1');
  await expect(page.locator('#app-splash')).toBeVisible();
  await page.evaluate(()=> (window as unknown as {__tingyuFinishSplash:()=>void}).__tingyuFinishSplash());
  await expect(page.locator('#app-splash')).toHaveCount(0);
});

test('early ready has no minimum animation wait and cannot replay',async({page})=>{
  await openSplash(page);
  await hide(page);
  await expect(page.locator('#app-splash')).toHaveCount(0,{timeout:1000});
  await page.evaluate(()=>{window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('visibilitychange'));document.documentElement.dataset.interfaceTheme='glacier';});
  await expect(page.locator('#app-splash')).toHaveCount(0);
});

test('native page timeout remains recoverable after React is ready',async({page})=>{
  await page.clock.install();
  await openSplash(page,'classic','dark',{show:true,native:true});
  await hide(page);
  await page.clock.fastForward(12001);
  await expect(page.getByRole('button',{name:'点击重新加载'})).toBeVisible();
});

test('native web stage handoff fades the HTML cover and cleans it up',async({page})=>{
  await openSplash(page,'glacier','dark',{show:true,native:true});
  await hide(page);
  await page.evaluate(()=> (window as unknown as {__tingyuFadeSplash:()=>void}).__tingyuFadeSplash());
  await expect(page.locator('#app-splash')).toHaveCount(0,{timeout:1000});
});

test('warm Android documents never draw a logo',async({page})=>{
  await openSplash(page,'glacier','dark',{show:false,native:true});
  await expect(page.locator('#app-splash')).toHaveCount(0);
});

test('system mode and invalid theme fallback',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});
  await openSplash(page,'unknown','system');
  await expect(page.locator('#app-splash')).toHaveCSS('background-color','rgb(244, 245, 238)');
});

for(const native of [false,true]) test('reduced motion '+(native?'Android':'browser'),async({page})=>{
  if(!native)await page.emulateMedia({reducedMotion:'reduce'});
  await openSplash(page,'glacier','dark',native?{show:true,native:false,reduced:true}:undefined);
  await expect(page.locator('.opening-wave')).toHaveCSS('visibility','hidden');
  await expect(page.locator('.logo')).toHaveCSS('animation-name','none');
  await expect(page.locator('.subtitle')).toHaveCSS('opacity','1');
  await hide(page);await expect(page.locator('#app-splash')).toHaveCount(0);
});

test('OBS transparent entrance bypasses splash',async({page})=>{
  await openSplash(page,'classic','dark',undefined,'?obs=1');
  await expect(page.locator('#app-splash')).toHaveCount(0);
});
