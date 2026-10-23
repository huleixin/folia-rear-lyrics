import { test, expect } from './fixtures';

// test/component/mobileStageAppearance.spec.ts
test.use({ viewport: { width: 393, height: 852 } });
test('transparent header and theme-adaptive matte player remain readable and inside phone bounds', async ({page}, info) => {
    const colors = new Set<string>();
    for (const theme of ['light', 'dark', 'saturated']) {
        await page.goto(`/dev-probe.html?probe=mobileStageChrome&theme=${theme}&longTitle=1`);
        const header = page.locator('.mps-header');
        const panel = page.locator('.mps-player');
        await expect(header).toBeVisible();
        await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(header).toHaveCSS('box-shadow', 'none');
        await expect(header).toHaveCSS('backdrop-filter', 'none');
        await expect(header).toHaveCSS('border-top-width', '0px');
        expect(await page.locator('.mps-song strong').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
        colors.add(await panel.evaluate(el => getComputedStyle(el).backgroundColor));
        for (const width of [320, 360, 393, 430]) {
            await page.setViewportSize({width,height:852});
            const viewport = await panel.boundingBox();
            for (const button of await page.locator('.mps-header button, .mps-transport button').all()) {
                const box = (await button.boundingBox())!;
                expect(box.x).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
                expect(box.width).toBeGreaterThanOrEqual(48);
                expect(box.height).toBeGreaterThanOrEqual(48);
            }
            expect(viewport!.height).toBeLessThan(160);
            const overflow = await page.locator('body').evaluate(el => el.scrollWidth - el.clientWidth);
            if (overflow > 1) console.log('stage-overflow', width, await page.evaluate(() =>
                Array.from(document.querySelectorAll<HTMLElement>('body *')).map(el => ({tag:el.tagName, cls:el.className,
                    right:el.getBoundingClientRect().right, overflow:getComputedStyle(el).overflowX})).filter(el => el.right > innerWidth + 1).slice(0,20)));
            expect(overflow).toBeLessThanOrEqual(1);
        }
        await page.setViewportSize({width:393,height:852});
        await page.screenshot({path: process.env.FOLIA_SCROLL_QA_OUTPUT ? `${process.env.FOLIA_SCROLL_QA_OUTPUT}/Folia-stage-matte-${theme}.png` : info.outputPath(`stage-${theme}.png`), animations:'disabled'});
    }
    expect(colors.size, 'the control console must actually adapt to different theme backgrounds').toBe(3);
});
