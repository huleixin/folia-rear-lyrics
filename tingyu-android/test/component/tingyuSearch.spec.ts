import { test, expect } from './fixtures';

// test/component/tingyuSearch.spec.ts
test.use({ viewport: { width: 393, height: 852 } });

// fixtures 把语言种成 en；这个页面按产品中文文案验收，所以在它之后覆盖。
test.beforeEach(async ({ page }) => {
    // 组件夹具不依赖远端头像/CDN，避免外网请求阻塞页面 load 和布局回归。
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await page.addInitScript(() => {
        localStorage.setItem('i18nextLng', 'zh-CN');
        localStorage.setItem('folia_app_language', 'zh-CN');
    });
});

test('comprehensive search shows five categories with a real best match', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
    const workspace = page.getByTestId('tingyu-search-workspace');
    await expect(workspace).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText(['综合', '单曲', '歌手', '歌单', '专辑']);
    await expect(workspace.locator('.ty-artist-section .ty-row')).toContainText('歌曲:430');
    await expect(workspace.locator('.ty-section-title')).toContainText(['歌手', '单曲', '歌单', '专辑']);
    await workspace.locator('.ty-artist-section .ty-row').click();
    expect(await page.evaluate(() => window.__searchProbeOpens.map(item => `${item.type}:${item.name}`)))
        .toEqual(['artist:许嵩']);
    expect(errors).toEqual([]);
});

test('view all switches category and rows open the existing collection view', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
    const workspace = page.getByTestId('tingyu-search-workspace');
    await workspace.getByRole('tab', { name: '歌手' }).click();
    await expect(workspace.getByRole('tab', { name: '歌手' })).toHaveAttribute('aria-selected', 'true');
    await expect(workspace.locator('.ty-row')).toHaveCount(1);
    await workspace.locator('.ty-row').first().click();
    expect(await page.evaluate(() => window.__searchProbeOpens.length)).toBe(1);

    await workspace.getByRole('tab', { name: '专辑' }).click();
    await expect(workspace.locator('.ty-row')).toContainText('安泊猜想');
    await workspace.locator('.ty-row').first().click();
    expect(await page.evaluate(() => window.__searchProbeOpens.at(-1)!.type)).toBe('album');

    await workspace.getByRole('tab', { name: '歌单' }).click();
    await expect(workspace.locator('.ty-row')).toContainText('最动听的许嵩');
    await workspace.locator('.ty-row').first().click();
    expect(await page.evaluate(() => window.__searchProbeOpens.at(-1)!.type)).toBe('playlist');
});

test('switching to a source without artist search hides that tab', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
    const workspace = page.getByTestId('tingyu-search-workspace');
    await workspace.getByRole('button', { name: '本地', exact: true }).click();
    await expect(workspace.getByRole('tab')).toHaveText(['综合', '单曲', '歌单']);
});

for (const width of [360, 393, 430]) {
    test(`search layout keeps touch targets and no horizontal overflow at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 780 });
        await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
        const workspace = page.getByTestId('tingyu-search-workspace');
        await expect(workspace).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const heights = await workspace.locator('.ty-search-tab, .ty-search-chip, .ty-search-close, .ty-search-clear, .ty-suggest-row, .ty-row, .ty-section-more').evaluateAll(nodes => nodes
            .filter(node => node.getClientRects().length)
            .map(node => node.getBoundingClientRect().height));
        expect(Math.min(...heights)).toBeGreaterThanOrEqual(36);
        const inputSize = await workspace.locator('input').evaluate(node => getComputedStyle(node).fontSize);
        expect(inputSize).toBe('16px');
    });
}

test('suggestion rows keep type labels, real metadata and keyword highlight', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=searchSuggestions&sandbox');
    // 第一行是「搜索当前关键词」，随后是四类建议，最后一行来自搜索历史。
    await expect(page.locator('.ty-suggest-search')).toHaveCount(1);
    await expect(page.locator('.ty-suggest-row').nth(1)).toContainText('歌手');
    await expect(page.locator('.ty-suggest-row').nth(2)).toContainText('单曲');
    await expect(page.locator('.ty-suggest-row').nth(3)).toContainText('专辑');
    await expect(page.locator('.ty-suggest-row').nth(4)).toContainText('许嵩 安泊猜想');
    await expect(page.locator('.ty-suggest-hit').first()).toHaveText('许嵩');
});

/** 用运行时替身记录联想请求；探针里 omni 是同一个模块实例，替换方法即可拦截。 */
async function stubSuggestions(page: import('@playwright/test').Page) {
    await page.evaluate(() => window.__stubOmniSuggest());
}

test('typing debounces suggestions to one request for the final keyword', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
    await stubSuggestions(page);
    const input = page.locator('.ty-search-field input');
    await input.click();
    await input.fill('许');
    await page.waitForTimeout(80);
    await input.fill('许嵩');
    await expect(page.locator('.ty-suggest-row').filter({ hasText: '许嵩 测试' })).toHaveCount(1);
    expect(await page.evaluate(() => window.__suggestCalls)).toEqual(['许嵩']);
});

test('composition input does not request suggestions until it ends', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
    await stubSuggestions(page);
    const input = page.locator('.ty-search-field input');
    await input.click();
    await input.evaluate(node => {
        node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        (node as HTMLInputElement).value = 'xusong';
        node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => window.__suggestCalls)).toEqual([]);
    await input.evaluate(node => {
        (node as HTMLInputElement).value = '许嵩';
        node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '许嵩' }));
    });
    await expect(page.locator('.ty-suggest-row').filter({ hasText: '许嵩 测试' })).toHaveCount(1);
    expect(await page.evaluate(() => window.__suggestCalls)).toEqual(['许嵩']);
});

test('clearing the input stops showing previous suggestions', async ({ page }) => {
    await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
    await stubSuggestions(page);
    const input = page.locator('.ty-search-field input');
    await input.click();
    await input.fill('许嵩');
    await expect(page.locator('.ty-suggest-row').filter({ hasText: '许嵩 测试' })).toHaveCount(1);
    await page.locator('.ty-search-clear').click();
    await expect(page.locator('.ty-suggest-row')).toHaveCount(0);
    await expect(page.getByTestId('tingyu-search-landing')).toBeVisible();
});
