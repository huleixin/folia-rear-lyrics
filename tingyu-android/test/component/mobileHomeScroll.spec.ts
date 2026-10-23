import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import '../../dev/probes/homeBehavior/probeApi';

// test/component/mobileHomeScroll.spec.ts
const phase = process.env.FOLIA_SCROLL_QA_PHASE || 'after';
test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

async function metrics(page: Page) {
    return page.evaluate(() => {
        const selectors = ['html', 'body', '#root', '.ml-home', '.ml-home-scroll', '.ml-featured', '.ml-feature-rail', '.ml-recent'];
        return {
            viewport: { innerWidth, dpr: devicePixelRatio, visualWidth: visualViewport?.width, scale: visualViewport?.scale },
            nodes: Object.fromEntries(selectors.map((selector) => {
                const element = document.querySelector<HTMLElement>(selector)!;
                const box = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return [selector, { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
                    scrollLeft: element.scrollLeft, x: box.x, width: box.width,
                    overflowX: style.overflowX, overflowY: style.overflowY, transform: style.transform }];
            })),
        };
    });
}

async function alignment(page: Page) {
    return page.evaluate(() => ['.ml-home-header', '.ml-home-section-heading', '.ml-playlist-grid', '.ml-footer', '.ml-mini', '.ml-footer nav']
        .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)).map((element, index) => {
            const box = element.getBoundingClientRect();
            return { key: `${selector}:${index}`, x: box.x, width: box.width };
        })));
}

// CDP dispatches native compositor touch scrolling, rather than synthetic DOM touch events.
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= 12; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
            x: from.x + (to.x - from.x) * step / 12, y: from.y + (to.y - from.y) * step / 12,
        }] });
        await page.waitForTimeout(16);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
}

for (const width of [360, 393, 430]) {
    test.describe(`${width}px`, () => {
        test.use({ viewport: { width, height: width === 360 ? 780 : 852 } });
        test('home owns only vertical scrolling while its two rails own horizontal scrolling', async ({ page }, testInfo) => {
            const capturePath = (label: string) => {
                const name = `Folia-home-scroll-${label}-${width}.png`;
                return process.env.FOLIA_SCROLL_QA_OUTPUT ? `${process.env.FOLIA_SCROLL_QA_OUTPUT}/${name}` : testInfo.outputPath(name);
            };
            const errors: string[] = [];
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('console', (message) => {
                if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
            });
            await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
            await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
            await page.goto('/dev-probe.html?probe=homeBehavior&sandbox');
            await page.waitForFunction(() => !!window.__homeProbe?.ready());
            await page.evaluate(() => window.__homeProbe!.setSuite('mobile'));
            await expect(page.locator('.ml-footer nav')).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
            await page.evaluate(async () => {
                const resource = (name: string) => performance.getEntriesByType('resource').map((entry) => entry.name)
                    .find((url) => url.includes(`/src/${name}.ts`)) || `/src/${name}.ts`;
                const { useMobileLibraryStore } = await import(resource('stores/useMobileLibraryStore'));
                const { default: i18n } = await import(resource('i18n/config'));
                await i18n.changeLanguage('zh-CN');
                // Isolated probe fixtures exercise a populated horizontal rail; never shipped as app data.
                useMobileLibraryStore.setState({ recentTracks: Array.from({ length: 12 }, (_, index) => ({
                    id: `scroll-test-${index}`, name: `测试歌曲 ${index + 1}`, artists: [{ id: 1, name: '滚动测试' }],
                    album: { id: index, name: '', coverUrl: `/assets/mobile-home/${index % 2 ? 'daily-30' : 'guess-you-like'}.png` },
                    durationMs: 1000, sourceRef: { kind: 'online', providerId: 'probe-a', mediaId: `scroll-test-${index}` },
                })) });
            });
            await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"] { display:none !important; }' });
            await page.locator('.ml-home-scroll').evaluate(async (element) => {
                await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
            });
            const baseline = await alignment(page);
            console.log(`initial-${width}`, JSON.stringify(await metrics(page)));
            const heading = await page.locator('.ml-home-section-heading').first().boundingBox();
            await swipe(page, { x: width - 90, y: heading!.y + 12 }, { x: 50, y: heading!.y + 12 });
            console.log(`native-heading-swipe-${width}`, JSON.stringify(await metrics(page)));
            // A vertical-only owner must also reject programmatic/restored horizontal offsets.
            await page.locator('.ml-home-scroll').evaluate((element) => { element.scrollLeft = 1000; });
            console.log(`horizontal-attempt-${width}`, JSON.stringify(await metrics(page)));
            if (phase === 'before') await page.screenshot({ path: capturePath('before'), animations: 'disabled' });

            const assertOwners = async () => {
                const current = await metrics(page);
                for (const selector of ['html', 'body', '#root', '.ml-home', '.ml-home-scroll']) {
                    const node = current.nodes[selector];
                    expect(node.scrollWidth, `${selector} horizontal range at ${width}px`).toBeLessThanOrEqual(node.clientWidth + 1);
                    expect(node.scrollLeft, `${selector} unexpected scrollLeft`).toBe(0);
                }
                const currentAlignment = await alignment(page);
                for (const item of currentAlignment) {
                    const original = baseline.find((entry) => entry.key === item.key)!;
                    expect(Math.abs(item.x - original.x), item.key).toBeLessThan(0.75);
                    expect(Math.abs(item.width - original.width), item.key).toBeLessThan(0.75);
                }
            };
            await assertOwners();
            const rail = page.locator('.ml-feature-rail');
            const hero = await page.locator('.ml-feature-card').first().boundingBox();
            await swipe(page, { x: width - 55, y: hero!.y + 80 }, { x: 60, y: hero!.y + 80 });
            await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeGreaterThan(50);
            await assertOwners();
            for (const index of [2, 1, 0]) {
                await page.locator('.ml-feature-dots button').nth(index).click();
                await expect(page.locator('.ml-feature-dots button').nth(index)).toHaveAttribute('aria-current', 'true');
                await assertOwners();
            }
            await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeLessThan(1);
            const recent = page.locator('.ml-recent');
            const recentBox = await recent.boundingBox();
            await swipe(page, { x: width - 65, y: recentBox!.y + 42 }, { x: 55, y: recentBox!.y + 42 });
            await expect.poll(() => recent.evaluate((element) => element.scrollLeft)).toBeGreaterThan(50);
            await assertOwners();
            const playlistColumns = await page.locator('.ml-playlist-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns);
            expect(playlistColumns.split(' ')).toHaveLength(2);

            const currentHero = await page.locator('.ml-feature-card').first().boundingBox();
            expect(await page.locator('.ml-home-scroll').evaluate((element) => element.scrollHeight - element.clientHeight), 'fixture must have vertical content to scroll').toBeGreaterThan(10);
            await swipe(page, { x: width * 0.6, y: currentHero!.y + 150 }, { x: width * 0.6, y: currentHero!.y + 40 });
            await expect.poll(() => page.locator('.ml-home-scroll').evaluate((element) => element.scrollTop)).toBeGreaterThan(10);
            await expect.poll(() => rail.evaluate((element) => element.scrollLeft)).toBeLessThan(1);
            await assertOwners();
            await page.locator('.ml-footer nav button').nth(1).click();
            await expect(page.getByTestId('mobile-home')).toHaveAttribute('data-page', 'library');
            await page.locator('.ml-footer nav button').nth(0).click();
            await expect(page.getByTestId('mobile-home')).toHaveAttribute('data-page', 'home');
            await expect.poll(() => page.locator('.ml-home-scroll').evaluate((element) => element.scrollLeft)).toBe(0);
            await assertOwners();
            await page.locator('.ml-home-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; });
            const last = await page.locator('.ml-home-playlist-card').last().boundingBox();
            const footer = await page.locator('.ml-footer').boundingBox();
            expect(last!.y + last!.height).toBeLessThanOrEqual(footer!.y + 1);
            await page.locator('.ml-home-scroll').evaluate((element) => { element.scrollTop = 0; });
            await page.screenshot({ path: capturePath('after'), animations: 'disabled' });
            console.log(`final-${width}`, JSON.stringify(await metrics(page)));
            expect(errors).toEqual([]);
        });
    });
}
