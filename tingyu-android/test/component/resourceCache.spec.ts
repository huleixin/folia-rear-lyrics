import {test,expect} from './fixtures';
import path from 'node:path';
// test/component/resourceCache.spec.ts
const evidence=process.env.TINGYU_QA_DIR||'test-results';
for(const width of [320,360,393])test(`storage layout ${width}`,async({page,mount})=>{
 await page.setViewportSize({width,height:852});await mount('resourceCache');
 await expect(page.getByRole('heading',{name:'智能资源预缓存'})).toBeVisible();
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','396');
 await expect(page.getByRole('button',{name:'继续缓存',exact:true})).toHaveCount(0);
 await expect(page.locator('.resource-diagnostics')).toHaveCount(0);
 expect(await page.locator('.resource-card').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(510);
 expect(await page.locator('.cache-details-grid').evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(370);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('main').screenshot({path:path.join(evidence,`storage-${width}-dark.png`)});
 await page.getByRole('button',{name:'切换预览主题'}).click();await page.evaluate(()=>document.documentElement.style.fontSize='24px');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'任务详情',exact:true}).click();
 await page.getByRole('button',{name:'清理可重新下载的资源'}).click();
 await expect(page.getByRole('button',{name:'确认清理'})).toBeVisible();
 await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('button',{name:'确认清理'})).toHaveCount(0);
 await page.locator('main').screenshot({path:path.join(evidence,`storage-${width}-large-light.png`)});
});
test('cache actions preserve successful results and settings',async({page,mount})=>{
 await mount('resourceCache');await page.getByRole('button',{name:'预览处理中'}).click();
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','72');
 const ratio=await page.locator('.resource-meter').evaluate(el=>el.firstElementChild!.getBoundingClientRect().width/el.getBoundingClientRect().width);
 expect(ratio).toBeCloseTo(72/396,2);
 await page.getByRole('button',{name:'继续缓存',exact:true}).click();await expect(page.locator('output')).toHaveText('resume');
 await page.getByRole('switch',{name:'仅 Wi-Fi 缓存'}).click();await expect(page.getByRole('switch',{name:'仅 Wi-Fi 缓存'})).toHaveAttribute('aria-checked','true');
 await page.getByRole('button',{name:'刷新缓存状态'}).click();await expect(page.locator('output')).toHaveText('refresh');
 await page.getByRole('button',{name:'任务详情',exact:true}).click();await page.getByRole('button',{name:'清理可重新下载的资源'}).click();
 await page.getByRole('button',{name:'确认清理'}).click();await expect(page.locator('output')).toHaveText('clear');
 await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','72');
});
test('native display list includes real progress boxes and operates collapsed details',async({page,mount})=>{
 await mount('resourceCache');await page.getByRole('button',{name:'预览处理中'}).click();
 const geometry=await page.evaluate(()=>{
  const root=document.querySelector('main')!.getBoundingClientRect(),meter=document.querySelector('.resource-meter')!.getBoundingClientRect();
  const result=(window as any).__captureStorage();
  return result.document.paints.filter((p:any)=>p.kind==='box'&&Math.abs(p.y-(meter.y-root.y))<1&&p.h===6).map((p:any)=>p.w);
 });expect(geometry.length).toBeGreaterThanOrEqual(2);expect(Math.min(...geometry)/Math.max(...geometry)).toBeCloseTo(72/396,2);
 await page.evaluate(()=>{const result=(window as any).__captureStorage();const c=result.document.controls.find((c:any)=>c.label==='任务详情');result.actions[c.id]({});});
 await expect(page.getByRole('button',{name:'任务详情',exact:true})).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('.resource-diagnostics')).toBeVisible();
});
test('sync configuration is optional and keeps draft values across collapse',async({page,mount})=>{
 await mount('resourceCache');await expect(page.getByPlaceholder('https://your-server.workers.dev')).toHaveCount(0);
 await page.getByRole('button',{name:'服务器设置'}).click();const url=page.getByPlaceholder('https://your-server.workers.dev');await url.fill('https://test.example');
 await page.getByRole('button',{name:'服务器设置'}).click();await page.getByRole('button',{name:'服务器设置'}).click();await expect(url).toHaveValue('https://test.example');
 await page.getByRole('switch',{name:'启用同步服务'}).click();await expect(page.getByRole('switch',{name:'启用同步服务'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByRole('button',{name:'同步 AI 主题'})).toBeVisible();
 await page.getByRole('switch',{name:'启用同步服务'}).click();await expect(page.getByRole('button',{name:'服务器设置'})).toHaveAttribute('aria-expanded','true');
 await expect(page.getByRole('button',{name:'保存',exact:true})).toBeVisible();
});
