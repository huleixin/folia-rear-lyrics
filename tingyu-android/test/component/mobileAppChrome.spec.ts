import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// test/component/mobileAppChrome.spec.ts
async function openPlayingApp(page: Page) {
    await page.addInitScript(() => {
        performance.setResourceTimingBufferSize(10000);
        localStorage.setItem('library_suite', 'mobile');
        localStorage.setItem('last_app_view', 'home');
        localStorage.setItem('library_suite_prompt_seen', 'true');
        localStorage.setItem('static_mode', 'true');
    });
    await page.goto('/');
    await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 60000 });
    await page.evaluate(async () => {
        const modulePath = (name: string) =>
            performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .find((url) => url.includes(`/src/${name}.ts`) && !url.includes('.tsx')) || `/src/${name}.ts`;
        const playback = await import(modulePath('stores/usePlaybackStore'));
        playback.setCurrentSong({
            id: 'fixture',
            name: 'Phone playback regression',
            artists: [{ id: 1, name: 'Test artist' }],
            album: { id: 1, name: 'Test album' },
            durationMs: 270000,
            sourceRef: { kind: 'online', providerId: 'netease', mediaId: 'fixture' },
        });
        playback.setDuration(270);
        playback.setPlayerState('PLAYING');
        const { useStageSettingsStore } = await import(modulePath('stores/useStageSettingsStore'));
        useStageSettingsStore.setState({ stageTrackPillMode: 'always', stageTrackPillShowOnHome: true });
    });
}
test.use({ viewport: { width: 390, height: 780 } });
test('full playing app has one library player, then unified stage chrome without legacy controls', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openPlayingApp(page);
    await expect(page.getByTestId('mobile-mini-player')).toContainText('Phone playback regression');
    await expect(page.locator('[data-folia-player-controls]')).toHaveCount(0);
    await expect(page.locator('[data-folia-now-playing-toast]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open command palette', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open original lyrics stage', exact: true }).click();
    await expect(page.getByTestId('mobile-home')).toHaveCount(0);
    const shell = page.locator('[data-folia-app-shell]');
    // CSS/native integration scope, not a claim that Chromium is an Android device.
    await shell.evaluate((node) => node.setAttribute('data-folia-android', 'true'));
    const bar = page.locator('.mps-player');
    await expect(bar).toBeVisible();
    const card = page.locator('.mps-header');
    await expect(card).toBeVisible();
    const bounds = await bar.boundingBox(),
        toast = await card.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(toast!.y + toast!.height).toBeLessThan(bounds!.y);
    await expect(page.locator('[data-folia-player-controls]')).toHaveCount(0);
    await expect(page.locator('[data-folia-now-playing-toast]')).toHaveCount(0);
    await expect(page.getByTestId('panel-toggle')).toBeHidden();
    await page.getByRole('button', { name: 'More playback options', exact: true }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    const panel = page.getByTestId('panel-toggle');
    if (await panel.isVisible()) {
        const box = await panel.boundingBox();
        expect(box!.y + box!.height).toBeLessThan(bounds!.y);
    }
    await page.getByRole('button', { name: 'Play queue', exact: true }).click();
    await expect.poll(() => page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').map(entry => entry.name).find(url => url.includes('/src/stores/useAppViewStore.ts'))!;
        const state = (await import(url)).useAppViewStore.getState();
        return `${state.isPanelOpen}:${state.panelTab}`;
    })).toBe('true:queue');
    await expect(page.getByRole('dialog', { name: 'Play queue' })).toBeVisible();
    await expect(page.getByTestId('mobile-stage-chrome')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mobile-queue-sheet')).toHaveCount(0);
    await expect(page.getByTestId('mobile-stage-chrome')).toBeVisible();
    expect(errors).toEqual([]);
});

test('classic, fume and tilt keep their original stage mounted when chrome hides and reveals', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openPlayingApp(page);
    // Browser simulation of the existing Android idle policy, not a native-device assertion.
    await page.evaluate(() => { (window as any).Capacitor.getPlatform = () => 'android'; });
    await page.getByRole('button', { name: 'Open original lyrics stage', exact: true }).click();
    for (const mode of ['classic', 'fume', 'tilt']) {
        await page.evaluate(async mode => {
            const url = performance.getEntriesByType('resource').map(entry => entry.name)
                .find(url => url.includes('/src/stores/useVisualizerSettingsStore.ts'))!;
            (await import(url)).useVisualizerSettingsStore.getState().handleSetVisualizerMode(mode, {notify:false});
        }, mode);
        const stage = page.locator('div.transition-colors.duration-1000.w-full.h-full').first();
        await expect(stage).toBeVisible();
        await stage.evaluate((element, mode) => { element.setAttribute('data-qa-stage-identity', mode); }, mode);
        await page.mouse.click(190, 350);
        const chrome = page.getByTestId('mobile-stage-chrome');
        await expect(chrome).toBeVisible();
        await expect(chrome).toBeHidden({timeout:6000});
        await expect(page.locator(`[data-qa-stage-identity="${mode}"]`)).toBeVisible();
        await page.mouse.click(190, 350);
        await expect(chrome).toBeVisible();
        await expect(page.locator(`[data-qa-stage-identity="${mode}"]`)).toBeVisible();
    }
    expect(errors).toEqual([]);
});
