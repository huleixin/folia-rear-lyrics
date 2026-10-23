import { test, expect } from './fixtures';
import path from 'node:path';

// test/component/mobileEnhancements.spec.ts
const output = (name: string) => path.resolve('..', '..', 'outputs', `Folia-mobile-r250-${name}.png`);
test.use({ viewport: { width: 390, height: 844 } });
async function openApp(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        localStorage.setItem('library_suite', 'mobile');
        localStorage.setItem('last_app_view', 'home');
        performance.setResourceTimingBufferSize(10000);
    });
    await page.goto('/');
    await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 60000 });
    await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"] { display: none !important; }' });
    await expect(page.locator('.ml-footer')).toBeVisible();
}
test('mobile settings use grouped navigation and search has real discovery plus editable history', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/__mock_netease__/search/hot/detail*', route => route.fulfill({ json: { code: 200, data: [{ searchWord: 'Hot search fixture' }, { searchWord: 'Second fixture' }] } }));
    await page.route('**/__mock_netease__/search/default*', route => route.fulfill({ json: { code: 200, data: { realkeyword: 'Discover fixture' } } }));
    await page.route('**/__mock_netease__/cloudsearch*', route => route.fulfill({ json: { code: 200, result: { songs: [], songCount: 0 } } }));
    await openApp(page);
    await expect(page.locator('.ml-feature-card-personal')).toBeVisible();
    await page.screenshot({ path: output('home'), scale: 'css' });
    await page.locator('.ml-footer').getByRole('button', { name: 'Settings', exact: true }).click();
    const index = page.locator('.mobile-settings-index');
    await expect(index).toBeVisible();
    await expect(page.locator('[data-folia-settings-overlay]')).toHaveCSS('opacity', '1');
    await expect(page.locator('[data-folia-settings-panel]')).toHaveCSS('background-color', 'rgb(8, 19, 16)');
    await expect(page.locator('[data-folia-settings-content]')).toBeHidden();
    await page.screenshot({ path: output('settings'), scale: 'css' });
    await index.getByRole('button').first().click();
    await expect(page.locator('[data-folia-settings-content]')).toBeVisible();
    await page.getByRole('button', { name: 'All settings', exact: true }).click();
    await expect(index).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(index).toHaveCount(0);
    await page.locator('.ml-footer').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('button', { name: /Discover fixture/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Hot search fixture/ })).toBeVisible();
    await expect(page.locator('[data-folia-search-workspace]')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: output('search'), scale: 'css' });
    await page.getByRole('button', { name: /Hot search fixture/ }).click();
    const input = page.locator('[data-folia-search-workspace] input');
    await expect(input).toHaveValue('Hot search fixture');
    await expect(page.locator('[data-folia-search-workspace] .animate-spin')).toHaveCount(0);
    await input.fill('');
    await expect(page.getByText('Recent searches', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Remove Hot search fixture', exact: true }).click();
    await expect(page.getByText('Recent searches', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
});
test('stage controls do not overflow at phone widths, glass remains legible', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=mobileStageChrome');
    await expect(page.getByTestId('mobile-stage-chrome')).toBeVisible();
    for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 780 });
        const bounds = await page.locator('.mps-player').boundingBox();
        for (const button of await page.locator('.mps-transport button').all()) {
            const box = await button.boundingBox();
            expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
            expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
        }
    }
    await page.screenshot({ path: output('stage'), scale: 'css' });
});
test('Android chrome idle reveal keeps a full-size stage and stable safe margins', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
        const capacitor = (window as any).Capacitor;
        capacitor.getPlatform = () => 'android';
        // CSS and reveal-policy simulation only. Native bridge calls are covered separately.
        document.documentElement.style.setProperty('--folia-main-inset-top', '28px');
        document.documentElement.style.setProperty('--folia-main-inset-bottom', '20px');
        const modulePath = '/src/stores/usePlaybackStore.ts';
        const playback = await import(modulePath);
        playback.setCurrentSong({ id: 'safe-area-fixture', name: 'Safe area fixture', artists: [{ id: 1, name: 'Fixture' }],
            album: { id: 1, name: '' }, durationMs: 213000, sourceRef: { kind: 'online', providerId: 'netease', mediaId: 'safe-area-fixture' } });
        playback.setDuration(213); playback.setPlayerState('PAUSED');
    });
    await page.getByRole('button', { name: 'Open original lyrics stage', exact: true }).click();
    const chrome = page.getByTestId('mobile-stage-chrome');
    await expect(chrome).toBeVisible();
    await expect(page.locator('[data-folia-app-shell]')).toHaveAttribute('data-folia-android', 'true');
    const before = await chrome.boundingBox();
    expect((await page.locator('.mps-header').boundingBox())!.y).toBeGreaterThanOrEqual(38);
    const player = await page.locator('.mps-player').boundingBox();
    expect(player!.y + player!.height).toBeLessThanOrEqual(824);
    await page.screenshot({ path: output('android-stage-visible'), scale: 'css' });
    await expect(chrome).toBeHidden({ timeout: 5000 });
    await page.mouse.click(190, 350);
    await expect(chrome).toBeVisible();
    expect(await chrome.boundingBox()).toEqual(before);
});
