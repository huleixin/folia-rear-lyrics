import {test,expect} from './fixtures';
// test/component/sleepTimer.spec.ts
for(const width of [320,393,588])test(`sleep sheet ${width}`,async({page,mount})=>{
 await page.setViewportSize({width,height:1280});await mount('sleepTimer');
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('button',{name:'30 分钟'})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('radio',{name:'当前歌曲播放完暂停',exact:false}).click();await expect(page.getByRole('button',{name:'30 分钟'})).toHaveCount(0);
 await page.getByRole('radio',{name:'时间结束立即暂停'}).click();await page.getByRole('button',{name:'自定义'}).click();
 await expect(page.getByRole('spinbutton',{name:'小时'})).toBeVisible();
 await page.evaluate(()=>document.documentElement.style.fontSize='24px');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/sleep-timer-${width}.png`,fullPage:true});
});
