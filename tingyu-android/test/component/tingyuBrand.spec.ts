import { test, expect } from './fixtures';

// test/component/tingyuBrand.spec.ts
test.use({ viewport: { width: 393, height: 852 } });
test('Tingyu loads all vector states and switches navigation without moving its icons', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('library_suite', 'mobile');
        localStorage.setItem('last_app_view', 'home');
        localStorage.setItem('folia_last_seen_ponder_onboarding_version', '1.0.0');
    });
    await page.goto('/');
    await expect(page).toHaveTitle('听屿');
    await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 60000 });
    await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"] { display: none !important; }' });
    await page.locator('#app-splash').waitFor({ state: 'detached' });
    const nav = page.locator('.ml-footer nav');
    const icons = nav.locator('.tingyu-nav-icon');
    await expect(icons).toHaveCount(4);
    for (const name of ['recommend', 'library', 'search', 'settings']) {
        for (const state of ['active', 'inactive']) {
            const response = await page.request.get(`/assets/tingyu-nav/${name}-${state}.svg`);
            expect(response.ok()).toBe(true);
            expect(await response.text()).toContain('viewBox="0 0 24 24"');
        }
    }
    const start = await icons.evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    await nav.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(nav.locator('button[aria-current="page"] img')).toHaveAttribute('src', /library-active/);
    await expect(page.getByTestId('mobile-home')).toHaveAttribute('data-page', 'library');
    const end = await icons.evaluateAll((nodes) => nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    expect(end).toEqual(start);
    await nav.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.locator('[data-folia-search-workspace]')).toBeVisible();
    await expect(nav.locator('button[aria-current="page"] img')).toHaveAttribute('src', /search-active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-folia-search-workspace]')).toHaveCount(0);
    await nav.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.locator('.mobile-settings-index')).toBeVisible();
    await expect(nav.locator('button[aria-current="page"] img')).toHaveAttribute('src', /settings-active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mobile-settings-index')).toHaveCount(0);
    expect(errors).toEqual([]);
});
