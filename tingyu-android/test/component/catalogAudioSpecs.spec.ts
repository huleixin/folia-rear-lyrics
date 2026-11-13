import { test, expect } from './fixtures';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// test/component/catalogAudioSpecs.spec.ts
for (const width of [320, 393, 840]) for (const appearance of ['light', 'dark']) {
    test(`catalog badges preserve the track row at ${width}px ${appearance}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 852 });
        await page.addInitScript(() => localStorage.setItem('folia_app_language', 'zh-CN'));
        const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto('/dev-probe.html?probe=catalogAudioSpecs');
        await page.evaluate(mode => Object.assign(document.documentElement.dataset, { interfaceTheme: 'classic', interfaceAppearance: mode, interfacePalette: 'classic' }), appearance);
        const rows = page.getByTestId('mobile-song-row');
        await expect(rows.first()).toBeVisible();
        expect(await rows.count()).toBeLessThan(40);
        await expect(rows.nth(1).locator('.ml-audio-spec')).toHaveCount(3);
        await expect(rows.nth(1).locator('[data-spec="hires"]')).toBeVisible();
        await expect(rows.nth(1).locator('[data-spec="dolby"]')).toBeVisible();
        await expect(rows.nth(2).locator('[data-spec="dts"]')).toBeVisible();
        if (width < 360) {
            await expect(rows.nth(2).locator('[data-spec="lossless"]')).toBeVisible();
            await expect(rows.nth(2).locator('[data-spec="dts"]')).toBeVisible();
            await expect(rows.nth(2).locator('[data-spec="vip"]')).toBeHidden();
        } else {
            await expect(rows.nth(2).locator('[data-spec="lossless"]')).toBeVisible();
            await expect(rows.nth(2).locator('[data-spec="dts"]')).toBeVisible();
            await expect(rows.nth(2).locator('[data-spec="vip"]')).toBeVisible();
        }
        await expect(rows.nth(3).locator('[data-spec="paid"]')).toBeVisible();
        if (width < 360) await expect(rows.nth(1).locator('[data-spec="vip"]')).toBeHidden();
        else await expect(rows.nth(1).locator('[data-spec="vip"]')).toBeVisible();
        await expect(rows.nth(4).locator('.ml-audio-spec')).toHaveCount(0);
        const badged = await rows.nth(1).boundingBox(), plain = await rows.nth(4).boundingBox();
        expect(badged?.height).toBe(plain?.height);
        for (const row of [rows.first(), rows.nth(1), rows.nth(2)]) {
            const specs = await row.locator('.ml-audio-specs').boundingBox();
            const duration = await row.locator('.ml-duration').boundingBox();
            expect(specs!.x + specs!.width).toBeLessThanOrEqual(duration!.x);
            const artist = await row.locator('.ml-song-artist').boundingBox();
            expect(artist!.width).toBeGreaterThan(12);
        }
        const evidence = process.env.CATALOG_BADGE_EVIDENCE || path.join(os.tmpdir(), 'tingyu-catalog-badges');
        await mkdir(evidence, { recursive: true });
        await page.screenshot({ path: path.join(evidence, `catalog-${width}-${appearance}.png`) });
        expect(await page.locator('vite-error-overlay').count()).toBe(0);
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
