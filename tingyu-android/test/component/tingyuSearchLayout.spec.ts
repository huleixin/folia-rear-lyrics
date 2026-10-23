import { test, expect } from './fixtures';

// test/component/tingyuSearchLayout.spec.ts
// 必须加载真机标记和 Android 全局样式；单独测搜索 CSS 会漏掉导航栏遗留占位。
test.beforeEach(async ({ page }) => {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    await page.addInitScript(() => {
        localStorage.setItem('i18nextLng', 'zh-CN');
        document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.dataset.foliaAndroid = 'true';
            document.documentElement.style.setProperty('--folia-main-inset-top', '28px');
            document.documentElement.style.setProperty('--folia-main-inset-bottom', '24px');
        });
    });
});

async function openSearch(page: import('@playwright/test').Page) {
    await page.goto('/dev-probe.html?probe=searchWorkspace&sandbox');
    await expect(page.getByTestId('tingyu-search-workspace')).toBeVisible();
    await page.addStyleTag({ url: '/src/styles/mobileGlass.css?direct' });
    await page.evaluate(() => window.__seedSearchLayout());
}

async function expectBottomReached(page: import('@playwright/test').Page, selector: string, height: number) {
    await expect.poll(() => page.locator(selector).evaluate(node => node.getBoundingClientRect().bottom))
        .toBeCloseTo(height, 0);
}

for (const width of [360, 393, 430]) {
    test(`Android search uses full height and reaches the last row at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 852 });
        await openSearch(page);
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await expect(page.locator('.ty-search')).toHaveCSS('padding-bottom', '0px');
        const input = page.locator('.ty-search-field input');
        await input.click();
        await input.fill('许嵩');
        await expect(page.locator('.ty-suggest-row')).toHaveCount(13);

        for (const height of [520, 852, 460, 852]) {
            await page.setViewportSize({ width, height });
            await expectBottomReached(page, '.ty-search-scroll', height);
            await page.locator('.ty-search-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
            const last = page.locator('.ty-suggest-row').last();
            await expect(last).toBeInViewport({ ratio: 1 });
            expect(await page.locator('.ty-search-field input').inputValue()).toBe('许嵩');
        }

        await page.locator('.ty-search-clear').click();
        const landing = page.getByTestId('tingyu-search-landing');
        await landing.locator('.ty-hot-expand').click();
        await expect(landing.getByRole('button', { name: '30 热门词 30', exact: true })).toBeAttached();
        await expectBottomReached(page, '[data-testid="tingyu-search-landing"]', 852);
        await landing.evaluate(node => { node.scrollTop = node.scrollHeight; });
        await expect(landing.getByRole('button', { name: '30 热门词 30', exact: true })).toBeInViewport({ ratio: 1 });
        expect(await landing.locator(':scope > div').evaluate(node => getComputedStyle(node).overflowY)).toBe('visible');
        expect(errors).toEqual([]);
    });

    test(`songs and pagination share one scroller at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 852 });
        await openSearch(page);
        await page.getByRole('tab', { name: '单曲', exact: true }).click();
        const scroller = page.locator('.ty-list-slot > div');
        await expectBottomReached(page, '.ty-search-body', 852);
        for (const height of [520, 852]) {
            await page.setViewportSize({ width, height });
            await expectBottomReached(page, '.ty-search-body', height);
            await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
            await expect(page.getByRole('button', { name: '布局测试歌曲 20', exact: true })).toBeInViewport({ ratio: 1 });
            await expect(page.locator('.ty-load-more button')).toBeInViewport({ ratio: 1 });
            const positions = await scroller.evaluate(node => {
                const title = Array.from(node.querySelectorAll('button')).find(button => button.textContent === '布局测试歌曲 20')!;
                const song = title.closest('.ty-track')!.getBoundingClientRect();
                const more = node.querySelector('.ty-load-more')!.getBoundingClientRect();
                return { songBottom: song.bottom, moreTop: more.top };
            });
            expect(positions.moreTop).toBeGreaterThanOrEqual(positions.songBottom);
        }
        await page.getByRole('button', { name: '布局测试歌曲 20', exact: true }).click();
        await page.locator('.ty-load-more button').click();
        await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
        await expect(page.getByRole('button', { name: '分页新增歌曲', exact: true })).toBeInViewport({ ratio: 1 });
        await expect(page.locator('.ty-load-more')).toHaveCount(0);
        expect(await page.evaluate(() => window.__searchProbeActions)).toEqual(['play:layout-19', 'loadMore']);
    });
}

test('visual viewport shrink, pan and restore retain suggestions and full scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    // layout viewport 不变，单独模拟 WebView 可视视口缩小及输入法顶起页面。
    // Hook 在挂载时绑定，所以通过 init script 注入视口。
    await page.addInitScript(() => {
        const target = new EventTarget();
        const viewport = { height: 852, offsetTop: 0, addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) };
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
        Object.assign(window, { __setSearchViewport: (height: number, offsetTop: number) => {
            Object.assign(viewport, { height, offsetTop });
            target.dispatchEvent(new Event('resize'));
        } });
    });
    await openSearch(page);
    await page.locator('.ty-search-field input').click();
    await page.locator('.ty-search-field input').fill('许嵩');
    await expect(page.locator('.ty-suggest-row')).toHaveCount(13);
    for (const [height, top] of [[520, 0], [470, 35], [852, 0]]) {
        await page.evaluate(([h, t]) => (window as unknown as { __setSearchViewport: (h: number, t: number) => void }).__setSearchViewport(h, t), [height, top]);
        await expectBottomReached(page, '.ty-search-scroll', height + top);
        await page.locator('.ty-search-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
        expect(await page.locator('.ty-search-scroll').evaluate(node => {
            const bottom = node.querySelector('.ty-suggest-row:last-child')!.getBoundingClientRect().bottom;
            return bottom <= node.getBoundingClientRect().bottom;
        })).toBe(true);
        await expect(page.locator('.ty-search-field input')).toHaveValue('许嵩');
    }
});
