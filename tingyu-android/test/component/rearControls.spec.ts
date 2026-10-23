import { test, expect } from './fixtures';

// test/component/rearControls.spec.ts
test.use({ viewport: { width: 321, height: 203 } });
test('rear tap controls share the safe progress area, dispatch playback actions and hide together', async ({ page }) => {
    let playing = true;
    const actions: string[] = [];
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__folia_rear/state*', route => route.fulfill({ json: {
        revision: 1, clock: { currentTime: 40, duration: 213, sentAtMs: Date.now(), playbackRate: 1, playerState: playing ? 'PLAYING' : 'PAUSED' },
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
    expect(errors).toEqual([]);
});
