import { test, expect } from './fixtures';

// test/component/mobileStatusBar.spec.ts
// Android WebView is edge-to-edge: the page background must reach y=0, while interactive
// content still starts below the native status-bar inset. Browser-only simulation; the
// Android window/inset path is covered by the native build and device checks.
test.use({ viewport: { width: 390, height: 844 } });

async function setAndroidInsets(page: import('@playwright/test').Page, top: number) {
    await page.evaluate((top) => {
        document.documentElement.style.setProperty('--folia-main-inset-top', top + 'px');
        document.documentElement.style.setProperty('--folia-main-inset-bottom', '20px');
        const shell = document.querySelector('[data-folia-app-shell]');
        shell?.setAttribute('data-folia-android', 'true');
        shell?.setAttribute('data-folia-mobile-library', 'true');
    }, top);
}

test('Android status bar uses the active mobile page background without moving content', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('library_suite', 'mobile');
        localStorage.setItem('last_app_view', 'home');
    });
    await page.goto('/');
    await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 60000 });

    for (const top of [24, 44]) {
        await setAndroidInsets(page, top);
        const home = await page.evaluate(() => {
            const pageEl = document.querySelector('.ml-home')!;
            const brand = document.querySelector('.ml-brand')!;
            const atTop = document.elementFromPoint(innerWidth / 2, 2);
            const layer = document.querySelector('[data-wall-handoff-layer="home"]')!;
            return {
                pageTop: pageEl.getBoundingClientRect().top,
                brandTop: brand.getBoundingClientRect().top,
                backgroundImage: getComputedStyle(pageEl).backgroundImage,
                atTopInsidePage: Boolean(atTop?.closest('.ml-home')),
                layerTop: getComputedStyle(layer).top,
            };
        });
        expect(home.pageTop).toBeCloseTo(0, 0);
        expect(home.layerTop).toBe('0px');
        expect(home.atTopInsidePage, 'status bar area must be painted by the page').toBe(true);
        expect(home.brandTop).toBeGreaterThanOrEqual(top + 20);
        expect(home.backgroundImage).not.toBe('none');
    }

    const openCollection = () =>
        page.evaluate(async () => {
            const url = performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .find((entry) => entry.includes('/src/stores/useCollectionNavigationStore.ts'))
                || '/src/stores/useCollectionNavigationStore.ts';
            const { useCollectionNavigationStore } = await import(url);
            useCollectionNavigationStore.getState().openRoot(
                {
                    source: 'online',
                    providerId: 'netease',
                    type: 'playlist',
                    id: 'statusbar-test',
                    name: 'Status bar test playlist',
                    trackCount: 3,
                },
                'home'
            );
        });

    const collection = page.getByTestId('mobile-collection');
    for (let round = 0; round < 2; round += 1) {
        await openCollection();
        await expect(collection).toBeVisible();
        for (const top of [24, 44]) {
            await setAndroidInsets(page, top);
            await expect.poll(() => collection.evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
            const details = await page.evaluate(() => {
                const pageEl = document.querySelector('.ml-collection')!;
                const atTop = document.elementFromPoint(innerWidth / 2, 2);
                const buttons = [...document.querySelectorAll('.ml-collection-top .ml-icon')]
                    .map((element) => element.getBoundingClientRect().top);
                return {
                    background: getComputedStyle(pageEl).backgroundColor,
                    backgroundImage: getComputedStyle(pageEl).backgroundImage,
                    atTopInsideCollection: Boolean(atTop?.closest('.ml-collection')),
                    buttons,
                };
            });
            expect(details.atTopInsideCollection, 'playlist background must reach status bar').toBe(true);
            expect(details.buttons.every((value) => value >= top)).toBe(true);
            expect(details.background).toBe('rgb(3, 24, 18)');
            expect(details.backgroundImage).toContain('linear-gradient');
        }
        await collection.getByRole('button', { name: 'Back', exact: true }).click();
        await expect(collection).toHaveCount(0);
        await expect(page.getByTestId('mobile-home')).toBeVisible();
        await expect.poll(() => page.locator('.ml-home').evaluate((element) => element.getBoundingClientRect().top)).toBe(0);
    }
    expect(errors).toEqual([]);
});
