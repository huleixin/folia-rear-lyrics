import { test, expect } from './fixtures';
import '../../dev/probes/homeBehavior/probeApi';

// test/component/mobilePlaylistDetail.spec.ts
// 在浏览器权限恢复后运行：覆盖歌单专用布局、原版迷你播放器和末项可达性。
for (const width of [360, 393, 430]) {
    test(`playlist details preserve chrome, metadata and long-list access at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 852 });
        await page.goto('/dev-probe.html?probe=homeBehavior&sandbox');
        await page.waitForFunction(() => !!window.__homeProbe?.ready());
        await page.evaluate(() => window.__homeProbe!.setSuite('mobile'));
        await expect(page.getByTestId('mobile-home')).toBeVisible();
        await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"]{display:none!important}' });
        const mini = page.getByTestId('mobile-mini-player');
        const oldSize = await mini.boundingBox();
        const oldStyle = await mini.evaluate(node => ({ radius: getComputedStyle(node).borderRadius, filter: getComputedStyle(node).backdropFilter, engine: node.getAttribute('data-glass-engine') }));
        await page.evaluate(async () => {
            const moduleUrl = '/src/stores/useCollectionNavigationStore.ts';
            const { useCollectionNavigationStore } = await import(moduleUrl);
            document.documentElement.style.setProperty('--folia-main-inset-top', '32px');
            document.documentElement.style.setProperty('--folia-main-inset-bottom', '24px');
            useCollectionNavigationStore.getState().openRoot({ source: 'online', providerId: 'probe-a', type: 'playlist', id: 'big', name: '你是无意穿堂风 偏偏孤倨引山洪', trackCount: 350 }, 'home');
        });
        const detail = page.getByTestId('mobile-collection');
        await expect(detail).toHaveClass(/ml-playlist-detail/);
        await expect(detail.getByTestId('mobile-song-row').first()).toBeVisible();
        await expect(page.locator('.ml-footer nav')).toHaveCount(0);
        expect(await mini.boundingBox()).toMatchObject({ height: oldSize!.height, width: oldSize!.width });
        expect(await mini.evaluate(node => ({ radius: getComputedStyle(node).borderRadius, filter: getComputedStyle(node).backdropFilter, engine: node.getAttribute('data-glass-engine') }))).toEqual(oldStyle);
        expect(await detail.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        const cover = await detail.locator('.ml-playlist-cover').boundingBox();
        expect(cover!.width).toBeCloseTo(cover!.height, 0);
        const hero = await detail.locator('.ml-playlist-hero').boundingBox();
        expect(cover!.width).toBeLessThan(hero!.width / 2);
        expect(await detail.getByTestId('mobile-song-row').count()).toBeLessThan(30);
        await detail.locator('.ml-track-list').evaluate(node => { node.scrollTop = node.scrollHeight; });
        const last = detail.getByTestId('mobile-song-row').last();
        await expect(last).toContainText('Track 349 Ember');
        await expect(last).toBeInViewport({ ratio: 1 });
        expect((await last.boundingBox())!.y + (await last.boundingBox())!.height).toBeLessThanOrEqual((await mini.boundingBox())!.y);
        await detail.getByRole('button', { name: 'Back', exact: true }).click();
        await expect(detail).toHaveCount(0);
        await expect(page.locator('.ml-footer nav')).toBeVisible();
        await expect(page.locator('.ml-footer nav')).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
    });
}
