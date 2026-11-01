import {test,expect} from './fixtures';
// test/component/resourceCache.spec.ts
for(const width of [320,393,588])test(`cache layout ${width}`,async({page,mount})=>{
 await page.setViewportSize({width,height:1280});await mount('resourceCache');
 await expect(page.getByText('72 / 396 首')).toBeVisible();
 expect(await page.getByRole('progressbar').getAttribute('value')).toBe('72');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/resource-cache-${width}.png`,fullPage:true});
 await page.evaluate(()=>document.documentElement.style.fontSize='24px');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'清理可重新下载的资源'}).click();
 await expect(page.getByRole('button',{name:'确认清理'})).toBeVisible();
 await page.evaluate(()=>{const main=document.querySelector('main')!;main.style.setProperty('--text-primary','#153729');main.style.setProperty('--text-secondary','#456254');main.style.background='#edf5ee';});
 await page.screenshot({path:`test-results/resource-cache-${width}-large-light.png`,fullPage:true});
});
