import { expect, test } from './fixtures';

// test/component/nativeLandscapeSubtitle.spec.ts
// Browser plugin is unavailable in this session; use the repository Playwright gallery.
test('landscape subtitles sit above controls and settle at the bottom when controls hide',async({page},testInfo)=>{
    await page.setViewportSize({width:852,height:393});
    await page.goto('/dev-probe.html?probe=nativeLandscapeSubtitle');
    const lastLine=page.getByText('怀念你那鲜红的唇印');
    // Measure the positioned overlay; inline text has its own baseline/descender space.
    const bottom=()=>lastLine.evaluate(element=>element.closest('.absolute.pointer-events-none')!.getBoundingClientRect().bottom);
    await expect.poll(bottom).toBeCloseTo(283,0);
    await page.screenshot({path:testInfo.outputPath('controls-shown.png')});
    await page.getByTestId('toggle-controls').click();
    await expect.poll(bottom).toBeCloseTo(389,0);
    const textBottom=await lastLine.evaluate(element=>element.getBoundingClientRect().bottom);
    expect(393-textBottom).toBeGreaterThanOrEqual(4);
    expect(393-textBottom).toBeLessThanOrEqual(12);
    await page.screenshot({path:testInfo.outputPath('controls-hidden.png')});
    await page.getByTestId('toggle-controls').click();
    await expect.poll(bottom).toBeCloseTo(283,0);
    await page.setViewportSize({width:393,height:852});
    await expect.poll(bottom).toBeLessThan(800);
    await page.setViewportSize({width:852,height:393});
    await expect.poll(bottom).toBeCloseTo(283,0);
});

test('rear subtitle position stays independent of main control presence',async({page})=>{
    await page.setViewportSize({width:393,height:196});
    await page.goto('/dev-probe.html?probe=nativeLandscapeSubtitle&surface=rear');
    const line=page.getByText('怀念你那鲜红的唇印');
    const bottom=()=>line.evaluate(element=>element.closest('.absolute.pointer-events-none')!.getBoundingClientRect().bottom);
    // Existing rear reading box keeps its width-based 1.5% margin.
    // Wait for the initial overlay animation to settle before capturing a comparison baseline.
    await expect.poll(async()=>Math.abs(await bottom()-(196-393*.015))).toBeLessThan(.02);
    const before=await bottom();
    await page.getByTestId('toggle-controls').click();
    await expect.poll(bottom).toBeCloseTo(before,1);
});
