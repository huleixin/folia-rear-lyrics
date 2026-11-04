import {test,expect,type Page} from '@playwright/test';
import type {NativeSettingsDocument} from '../../src/types/nativeSettingsDocument';

// test/component/nativeSettingsBoundary.spec.ts
// Real DOM paint/layout, with all external traffic blocked. This is not Android GPU evidence.
test.use({serviceWorkers:'block'});
async function fixture(page:Page){
 await page.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)?route.continue():route.abort();});
 await page.goto('/dev-probe.html');
 await page.evaluate(async()=>{
  const link=document.createElement('link');link.rel='stylesheet';link.href='/src/styles/nativePages.css';document.head.append(link);await new Promise(r=>link.onload=r);
  const host=document.createElement('div');host.innerHTML=`
   <div data-testid="player-visual-surface" style="position:fixed;inset:0;background:red">OLD STAGE TITLE</div>
   <div data-testid="mobile-stage-chrome">OLD SONG CONTROLS</div>
   <main data-native-document-root data-native-page="true" style="position:fixed;inset:0">
    <div style="overflow-y:auto;height:600px"><div data-native-live="true" data-folia-stage-preview style="position:relative;width:300px;height:220px;border-radius:28px;background:rgb(0,0,80)">
      <div style="position:fixed;left:-100px;top:-100px;width:1000px;height:1000px;background:rgb(0,0,80)">ONE PREVIEW TITLE</div>
      <button style="position:absolute;right:0;bottom:0">Pause preview</button>
    </div><button>Mode A</button><div style="height:1200px"></div></div>
   </main>`;
  document.body.append(host);document.documentElement.dataset.nativeFirst='true';document.documentElement.dataset.nativeRoute='settings';document.documentElement.dataset.nativeSettingsDocument='true';
 });
}
test('clips a live island and excludes its chrome from the native display list',async({page})=>{
 await fixture(page);
 const result=await page.evaluate(async()=>{
  const module='/src/services/nativeSettingsDocument.ts';const {captureSettingsDocument}=await import(/* @vite-ignore */module);
  const root=document.querySelector('[data-native-document-root]') as HTMLElement;
  const captured:NativeSettingsDocument=captureSettingsDocument(root).document;
  const preview=root.querySelector('[data-native-live]') as HTMLElement;
  return {live:captured.paints.filter(p=>p.kind==='live'),texts:captured.paints.filter(p=>p.kind==='text').map(p=>p.text),labels:captured.controls.map(c=>c.label),contain:getComputedStyle(preview).contain,
    stage:getComputedStyle(document.querySelector('[data-testid="player-visual-surface"]')!).visibility,
    chrome:getComputedStyle(document.querySelector('[data-testid="mobile-stage-chrome"]')!).visibility,
    hit:document.elementFromPoint(330,240)?.closest('[data-native-live]')!==null};
 });
 expect(result.live).toHaveLength(1);expect(result.live[0].radius).toBe(28);
 expect(result.texts.join(' ')).not.toContain('PREVIEW TITLE');expect(result.labels).not.toContain('Pause preview');expect(result.labels).toContain('Mode A');
 expect(result.stage).toBe('hidden');expect(result.chrome).toBe('hidden');expect(result.contain).toContain('paint');expect(result.hit).toBe(false);
});
