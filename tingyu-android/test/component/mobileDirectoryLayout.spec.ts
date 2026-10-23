import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import '../../dev/probes/homeBehavior/probeApi';

// test/component/mobileDirectoryLayout.spec.ts
// Image dimensions and virtual row bounds must be tested together; compilation cannot catch missing CSS.
test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const before = process.env.FOLIA_DIRECTORY_QA_PHASE === 'before';

async function rows(page: Page) {
    return page.locator('.ml-directory').evaluate((list) => ({
        clientWidth: list.clientWidth, scrollWidth: list.scrollWidth,
        rows: Array.from(list.querySelectorAll<HTMLElement>('.ml-card-row')).map((row) => {
            const art = row.querySelector<HTMLElement>('.ml-art')!;
            const box = row.getBoundingClientRect();
            const cover = art.getBoundingClientRect();
            const slot = row.parentElement!.getBoundingClientRect();
            return { name: row.textContent?.slice(0, 40), x: box.x, width: box.width, height: box.height,
                coverWidth: cover.width, coverHeight: cover.height,
                bottom: box.bottom, slotBottom: slot.bottom };
        }),
    }));
}

for (const width of [360, 393, 430]) {
    test(`directory original rows, tabs, search and bottom clearance at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 852 });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
        await page.goto('/dev-probe.html?probe=homeBehavior&sandbox&covers=1');
        await page.waitForFunction(() => !!window.__homeProbe?.ready());
        await page.evaluate(() => window.__homeProbe!.setSuite('mobile'));
        await expect(page.locator('.ml-footer nav')).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
        await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"] {display:none !important}' });
        // Test-only account data: existing real probe records plus a large directory, oversized/missing covers and long text.
        await page.evaluate(async () => {
            const url = performance.getEntriesByType('resource').map((entry) => entry.name)
                .find((name) => name.includes('/src/stores/useOnlineProviderAccountStore.ts'))!;
            const { useOnlineProviderAccountStore } = await import(url);
            const store = useOnlineProviderAccountStore.getState();
            const originals = store.accounts['probe-a'].collections;
            store.updateAccount('probe-a', { collections: [
                ...originals.map((card: object, index: number) => ({ ...card,
                    coverUrl: index === 1 ? undefined : '/assets/mobile-home/guess-you-like.png' })),
                ...Array.from({ length: 80 }, (_, index) => ({ ...originals[0], id: `layout-${index}`,
                    name: `Layout ${index} ${'长歌单标题'.repeat(20)}`, trackCount: 99999,
                    coverUrl: index % 2 ? '/assets/mobile-home/daily-30.png' : undefined })),
            ] });
        });
        const homeSnapshot = async () => page.locator('.ml-home').evaluate((home) =>
            ['.ml-home-header', '.ml-feature-card', '.ml-home-section-heading', '.ml-home-playlist-card'].flatMap((selector) =>
                Array.from(home.querySelectorAll(selector)).slice(0, 4).map((element) => {
                    const box = element.getBoundingClientRect();
                    const css = getComputedStyle(element);
                    return { selector, x: box.x, y: box.y, width: box.width, height: box.height,
                        background: css.background, font: css.font, radius: css.borderRadius };
                })));
        await page.locator('.ml-home-scroll').evaluate(async (element) => {
            await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
        });
        const home = await homeSnapshot();
        const capture = (label: string) => process.env.FOLIA_SCROLL_QA_OUTPUT
            ? `${process.env.FOLIA_SCROLL_QA_OUTPUT}/Folia-library-${label}-${width}.png`
            : info.outputPath(`Folia-library-${label}-${width}.png`);
        await page.locator('.ml-footer nav button').nth(1).click();
        await page.evaluate(() => window.__homeProbe!.setTab('playlist'));
        await expect(page.locator('.ml-card-row').first()).toBeVisible();
        await page.locator('.ml-directory-shell').evaluate(async (element) => {
            await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
        });
        console.log(`directory-${before ? 'before' : 'after'}-${width}`, JSON.stringify(await rows(page)));
        await page.screenshot({ path: capture(before ? 'before' : 'after'), animations: 'disabled' });
        if (before) return;
        const assertRows = async () => {
            const geometry = await rows(page);
            expect(geometry.rows.length).toBeGreaterThan(0);
            expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
            for (const row of geometry.rows) {
                expect(row.coverWidth, row.name!).toBeCloseTo(56, 2);
                expect(row.coverHeight, row.name!).toBeCloseTo(56, 2);
                expect(row.height).toBeCloseTo(68, 2);
                expect(row.bottom).toBeLessThanOrEqual(row.slotBottom + 0.5);
                expect(row.x).toBeGreaterThanOrEqual(0);
                expect(row.x + row.width).toBeLessThanOrEqual(width);
            }
        };
        await assertRows();
        const filter = page.locator('.ml-directory-shell input');
        await filter.fill('Layout 79');
        await expect(page.locator('.ml-card-row')).toHaveCount(1);
        await assertRows();
        await filter.fill('not-a-matching-playlist');
        await expect(page.locator('.ml-card-row')).toHaveCount(0);
        await expect(page.locator('.ml-empty')).toBeVisible();
        await filter.fill('');
        await page.locator('.ml-directory').evaluate((element) => { element.scrollTop = element.scrollHeight; });
        await expect(page.locator('.ml-card-row').last()).toContainText('Layout 79');
        await assertRows();
        const last = await page.locator('.ml-card-row').last().boundingBox();
        const footer = await page.locator('.ml-footer').boundingBox();
        expect(last!.y + last!.height, 'final directory item must clear both floating bars').toBeLessThanOrEqual(footer!.y);
        expect(await page.locator('.ml-card-row').count(), 'virtualization remains bounded').toBeLessThan(30);
        await page.locator('.ml-directory').evaluate((element) => { element.scrollTop = 0; });
        await page.locator('.ml-card-row').filter({ hasText: 'Public Playlist' }).click();
        await expect(page.getByTestId('mobile-collection')).toBeVisible();
        await page.evaluate(() => window.__homeProbe!.closeCollection());
        for (const tab of ['radio', 'albums', 'local', 'navidrome', 'playlist'] as const) {
            await page.evaluate((tab) => window.__homeProbe!.setTab(tab), tab);
            await expect(page.locator('.ml-card-row').first()).toBeVisible();
            await assertRows();
        }
        for (const selector of ['html', 'body', '#root', '.ml-home']) {
            expect(await page.locator(selector).evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        }
        await page.locator('.ml-footer nav button').nth(0).click();
        await page.locator('.ml-home-scroll').evaluate(async (element) => {
            await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
        });
        expect(await homeSnapshot(), 'home layout and visual styles must remain unchanged').toEqual(home);
        expect(errors).toEqual([]);
    });
}
