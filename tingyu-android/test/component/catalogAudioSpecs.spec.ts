import { test, expect } from './fixtures';

// test/component/catalogAudioSpecs.spec.ts
for (const width of [320, 393, 840]) {
    test(`catalog badges preserve the track row at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 852 });
        await page.addInitScript(() => localStorage.setItem('folia_app_language', 'zh-CN'));
        const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto('/dev-probe.html?probe=catalogAudioSpecs');
        const rows = page.getByTestId('mobile-song-row');
        await expect(rows.first()).toBeVisible();
        expect(await rows.count()).toBeLessThan(40);
        await expect(rows.nth(1).locator('.ml-audio-spec')).toHaveCount(2);
        await expect(rows.nth(4).locator('.ml-audio-spec')).toHaveCount(0);
        const badged = await rows.nth(1).boundingBox(), plain = await rows.nth(4).boundingBox();
        expect(badged?.height).toBe(plain?.height);
        for (const row of [rows.first(), rows.nth(1), rows.nth(2)]) {
            const specs = await row.locator('.ml-audio-specs').boundingBox();
            const duration = await row.locator('.ml-duration').boundingBox();
            expect(specs!.x + specs!.width).toBeLessThanOrEqual(duration!.x);
        }
        await rows.first().locator('.ml-song-copy').click();
        await expect(page.getByTestId('spec-action')).toContainText('播放：无损规格示例');
        await rows.nth(1).locator('.ml-icon').click();
        await expect(page.getByTestId('spec-action')).toContainText('菜单：高清与杜比规格示例');
        await page.getByTestId('spec-filter').click();
        await expect(page.locator('.ml-audio-spec')).toHaveCount(0);
        await expect(rows.first()).toContainText('未知规格示例');
        expect(errors).toEqual([]);
    });
}
