import { test, expect } from './fixtures';
// test/component/mobileSearchSettingsRepair.spec.ts
const before = process.env.FOLIA_REPAIR_PHASE === 'before';
const searchOnly = process.env.FOLIA_REPAIR_PHASE === 'search';
test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

test('search visible region resizes and settings do not scan all caches on entry', async ({ page }, info) => {
    const output = process.env.FOLIA_SCROLL_QA_OUTPUT ?? info.outputPath('captures');
    await page.addInitScript(() => {
        localStorage.setItem('library_suite', 'mobile'); localStorage.setItem('last_app_view', 'home');
        performance.setResourceTimingBufferSize(10000);
        (window as any).__cacheReads = [];
        const original = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function(...args) {
            if (['api_cache', 'user_cache', 'media_cache', 'metadata_cache'].includes(this.name))
                (window as any).__cacheReads.push(this.name);
            return original.apply(this, args as Parameters<typeof original>);
        };
    });
    await page.route('**/__mock_netease__/search/hot/detail*', route => route.fulfill({ json: { code: 200,
        data: Array.from({ length: 30 }, (_, i) => ({ searchWord: `Hot fixture ${i + 1}` })) } }));
    await page.route('**/__mock_netease__/search/default*', route => route.fulfill({ json: { code: 200, data: {} } }));
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 60000 });
    await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"]{display:none!important}' });
    await page.evaluate(async () => {
        const dbPath = '/src/services/appDatabase.ts';
        const { appDatabase } = await import(dbPath);
        // 10 MB metadata fixture, confined to this disposable browser context.
        await appDatabase.metadata_cache.bulkPut(Array.from({ length: 600 }, (_, i) => ({
            key: `lyric_perf_${i}`, data: 'x'.repeat(16384), timestamp: Date.now(),
        })));
        (window as any).__cacheReads = [];
    });
    const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
    const initial = await cdp.send('Performance.getMetrics');
    await page.locator('.ml-footer nav button').nth(3).click();
    const index = page.locator('.mobile-settings-index'); await expect(index).toBeVisible();
    await expect(page.locator('[data-folia-settings-overlay]')).toHaveCSS('opacity', '1');
    await page.waitForTimeout(1000);
    const reads = await page.evaluate(() => (window as any).__cacheReads as string[]);
    const end = await cdp.send('Performance.getMetrics');
    const metric = (list: typeof end, name: string) => list.metrics.find(m => m.name === name)?.value ?? 0;
    const taskMs = (metric(end, 'TaskDuration') - metric(initial, 'TaskDuration')) * 1000;
    console.log('settings entry', { phase: before ? 'before' : 'after', reads, taskMs });
    await info.attach('settings-performance', { body: JSON.stringify({ reads, taskMs }), contentType: 'application/json' });
    if (!before && !searchOnly) expect(reads).toEqual([]);
    await page.screenshot({ path: `${output}/Folia-r254-${before ? 'before' : 'after'}-settings.png` });
    await index.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await index.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await index.evaluate(el => { el.scrollTop = 0; });
    await index.getByRole('button', { name: /Visual settings/i }).click();
    await expect(page.locator('[data-folia-settings-content]')).toBeVisible();
    await page.getByRole('button', { name: 'All settings', exact: true }).click();
    await index.getByRole('button', { name: /Playback settings/i }).click();
    await page.getByRole('button', { name: /Global Timing Offset/ }).click();
    const apply = page.getByRole('button', { name: 'Apply', exact: true });
    await expect(apply).toBeVisible();
    await expect.poll(() => apply.evaluate(el => getComputedStyle(el.closest('.fixed')!).opacity)).toBe('1');
    await page.screenshot({ path: `${output}/Folia-r254-settings-dialog.png` });
    // Close without changing the stored offset or the original lyric timeline.
    await apply.locator('..').getByRole('button').first().click();
    await expect(apply).toHaveCount(0);
    await page.getByRole('button', { name: 'All settings', exact: true }).click();
    await index.getByRole('button', { name: /Storage/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__cacheReads.length)).toBeGreaterThanOrEqual(4);
    await page.keyboard.press('Escape'); await expect(index).toBeVisible();
    await page.keyboard.press('Escape'); await expect(index).toHaveCount(0);
    await page.locator('.ml-footer nav button').nth(2).click();
    await expect(page.getByRole('button', { name: '1 Hot fixture 1', exact: true })).toBeVisible();
    await page.evaluate(() => {
        document.documentElement.dataset.foliaAndroid = 'true';
        document.documentElement.style.setProperty('--folia-main-inset-top', '28px');
        document.documentElement.style.setProperty('--folia-main-inset-bottom', '20px');
    });
    const workspace = page.locator('[data-folia-search-workspace]');
    for (const height of [852, 500, 852]) {
        await page.setViewportSize({ width: 393, height });
        await expect(workspace).toHaveCSS('opacity', '1');
        const metrics = await workspace.evaluate(el => {
            const input = el.querySelector('input')!.getBoundingClientRect();
            const scroller = el.querySelector('.overflow-y-auto') as HTMLElement;
            const box = scroller.getBoundingClientRect();
            scroller.scrollTop = scroller.scrollHeight;
            return { inputTop: input.top, inputBottom: input.bottom, scrollBottom: box.bottom,
                height: box.height, total: scroller.scrollHeight, client: scroller.clientHeight,
                bottomPadding: parseFloat(getComputedStyle(el).paddingBottom), scrollTop: scroller.scrollTop };
        });
        console.log('search resized', height, metrics);
        expect(metrics.inputTop).toBeGreaterThanOrEqual(28);
        expect(metrics.inputBottom).toBeLessThan(height);
        if (metrics.total > metrics.client) expect(metrics.scrollTop).toBeGreaterThan(0);
        if (!before) expect(metrics.bottomPadding).toBeLessThanOrEqual(36);
        await page.screenshot({ path: `${output}/Folia-r254-${before ? 'before' : 'after'}-search-${height}.png` });
    }
    await page.keyboard.press('Escape');
    await expect(workspace).toHaveCount(0);
    expect(errors).toEqual([]);
});
