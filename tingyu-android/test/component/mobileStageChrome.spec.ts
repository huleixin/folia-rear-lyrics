import { test, expect } from './fixtures';

// test/component/mobileStageChrome.spec.ts
test.use({ viewport: { width: 390, height: 780 } });
test('unified chrome binds playback, previous/next, repeat and seek without a second clock', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/dev-probe.html?probe=mobileStageChrome');
    await expect(page.getByTestId('mobile-stage-chrome')).toBeVisible();
    await expect(page.locator('.mps-header')).not.toHaveAttribute('data-glass-engine');
    await expect(page.locator('.mps-player')).not.toHaveAttribute('data-glass-engine');
    await expect(page.locator('.mps-header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.mps-header')).toHaveCSS('backdrop-filter', 'none');
    expect(await page.locator('.mps-player').evaluate((el) => getComputedStyle(el).backdropFilter)).toMatch(/blur\(/);
    await page.getByRole('button', { name: /Lyrics style|歌词样式/ }).click();
    await expect(page.getByTestId('style-route')).toHaveText('true:visualizer:visualizer');
    await expect(page.getByTestId('mobile-stage-chrome')).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByTestId('stage-result')).toContainText('PAUSED:1');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Next track', exact: true }).click();
    await expect(page.locator('.mps-song')).toContainText('Track 2');
    await page.getByRole('button', { name: 'Previous track', exact: true }).click();
    await expect(page.locator('.mps-song')).toContainText('Track 1');
    await page.getByRole('button', { name: 'Change repeat mode', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Change repeat mode', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
    );
    const seek = page.getByRole('slider', { name: 'Playback position', exact: true });
    const box = await seek.boundingBox();
    await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height / 2);
    await expect.poll(() => seek.inputValue().then(Number)).toBeGreaterThan(120);
    await expect.poll(() => seek.inputValue().then(Number)).toBeLessThan(150);
    await page.getByRole('button', { name: 'Back to music', exact: true }).click();
    await expect(page.getByTestId('stage-result')).toContainText(':1');
    for (const viewport of [
        { width: 320, height: 568 },
        { width: 844, height: 390 },
        { width: 1024, height: 768 },
    ]) {
        await page.setViewportSize(viewport);
        const header = await page.locator('.mps-header').boundingBox(),
            player = await page.locator('.mps-player').boundingBox();
        expect(header!.y + header!.height).toBeLessThan(player!.y);
        expect(player!.x).toBeGreaterThanOrEqual(0);
        expect(player!.x + player!.width).toBeLessThanOrEqual(viewport.width);
        expect(player!.y + player!.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.getByRole('button', { name: 'Change fixture theme' }).click();
    await expect(page.locator('.mobile-player-stage')).toHaveCSS('color', 'rgb(255, 253, 246)');
    expect(errors).toEqual([]);
});
