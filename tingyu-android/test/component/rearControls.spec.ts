import { test, expect } from './fixtures';
import { rearStageConfig } from './rearStageFixture';

// test/component/rearControls.spec.ts
test.use({ viewport: { width: 321, height: 203 } });
test('rear tap controls share the safe progress area, dispatch playback actions and hide together', async ({ page }) => {
    await page.addInitScript(() => { (window as any).__nativeSegmenter = Intl.Segmenter; });
    let playing = true;
    const actions: string[] = [];
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__folia_rear/state*', route => route.fulfill({ json: {
        revision: 1, config: rearStageConfig('classic'), clock: { currentTime: 40, duration: 213, sentAtMs: Date.now(), playbackRate: 1, playerState: playing ? 'PLAYING' : 'PAUSED' },
    } }));
    await page.route('**/__folia_rear/control*', route => {
        expect(route.request().method()).toBe('POST');
        const action = new URL(route.request().url()).searchParams.get('action')!;
        actions.push(action);
        if (action === 'pause' || action === 'play') playing = action === 'play';
        return route.fulfill({ json: {} });
    });
    await page.goto('/rear-lyrics.html?layer=lyrics');
    const progress = page.getByTestId('rear-progress');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    for (const button of await progress.getByRole('button').all()) {
        const box = await button.boundingBox();
        expect(box!.x).toBeGreaterThan(130);
        expect(box!.x + box!.width).toBeLessThan(300);
        expect(box!.y + box!.height).toBeLessThan(185);
    }
    await page.getByRole('button', { name: 'Previous track' }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Next track' }).click();
    expect(actions).toEqual(['previous', 'pause', 'play', 'next']);
    await expect(progress).toHaveCSS('opacity', '0', { timeout: 4000 });
    await page.mouse.click(260, 70);
    await expect(progress).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => Intl.Segmenter === (window as any).__nativeSegmenter)).toBe(true);
    expect(errors).toEqual([]);
});

for (const mode of ['machi', 'nebbia', 'hanabi'] as const) {
    test(`${mode} paints rear controls above the actual stage and respects live switch changes`, async ({ page }) => {
        let enabled = true, revision = 1;
        const actions: string[] = [];
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/__folia_rear/state*', route => route.fulfill({ json: { revision,
            config: { ...rearStageConfig(mode), rearTapControls: enabled },
            clock: { currentTime: 40, duration: 213, sentAtMs: Date.now(), playbackRate: 1, playerState: 'PAUSED' },
        } }));
        await page.route('**/__folia_rear/control*', route => {
            actions.push(new URL(route.request().url()).searchParams.get('action')!);
            return route.fulfill({ json: {} });
        });
        await page.goto('/rear-lyrics.html?layer=lyrics');
        await expect(page.locator(`[data-visualizer-mode="${mode}"] canvas`).first()).toBeVisible();
        const progress = page.getByTestId('rear-progress');
        const play = progress.getByRole('button', { name: 'Play', exact: true });
        await page.mouse.click(260, 70);
        await expect(progress).toHaveCSS('opacity', '1');
        // A pointer-events:none canvas can cover visible controls without failing hit-testing.
        // Changing only the button paint must change its screenshot pixels.
        await play.evaluate(button => { button.style.background = '#ff00ff'; });
        const painted = await play.screenshot();
        await play.evaluate(button => { button.style.background = '#00ffff'; });
        const repainted = await play.screenshot();
        expect(painted.equals(repainted), 'button pixels must reach the displayed surface').toBe(false);
        await play.click();
        expect(actions).toEqual(['play']);
        enabled = false; revision++;
        await expect(progress).toBeHidden();
        await page.mouse.click(260, 70);
        await expect(progress).toBeHidden();
        enabled = true; revision++;
        await expect(progress).toBeVisible();
        await expect(progress).toHaveCSS('opacity', '1');
        expect(errors).toEqual([]);
    });
}
