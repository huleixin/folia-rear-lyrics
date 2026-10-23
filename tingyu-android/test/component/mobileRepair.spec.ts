import { test, expect } from './fixtures';

// test/component/mobileRepair.spec.ts — isolated fixtures; never production music data.
const before = process.env.FOLIA_REPAIR_PHASE === 'before';
test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

for (const width of [360, 393, 430]) {
    test(`recommendation alignment and BOTH recent viewport edges ${width}`, async ({ page }, info) => {
        const output = process.env.FOLIA_SCROLL_QA_OUTPUT ?? info.outputPath('captures');
        await page.setViewportSize({ width, height: Math.round(width * 2.17) });
        await page.goto('/dev-probe.html?probe=homeBehavior&sandbox');
        await page.waitForFunction(() => !!window.__homeProbe?.ready());
        await page.evaluate(() => window.__homeProbe!.setSuite('mobile'));
        await expect(page.locator('.ml-footer nav')).toBeVisible();
        await page.evaluate(async () => {
            const storePath = '/src/stores/useMobileLibraryStore.ts', i18nPath = '/src/i18n/config.ts';
            const { useMobileLibraryStore } = await import(storePath);
            const { default: i18n } = await import(i18nPath);
            await i18n.changeLanguage('zh-CN');
            useMobileLibraryStore.setState({ recentTracks: Array.from({ length: 12 }, (_, i) => ({
                id: `edge-${i}`, name: `边界测试 ${i + 1}`, artists: [{ id: 1, name: '测试数据' }],
                album: { id: i, name: '', coverUrl: `/assets/mobile-home/${i % 2 ? 'daily-30' : 'guess-you-like'}.png` },
                durationMs: 1000, sourceRef: { kind: 'online', providerId: 'probe-a', mediaId: `edge-${i}` },
            })) });
        });
        await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"]{display:none!important}' });
        await page.locator('.ml-home-scroll').evaluate(async el => {
            await Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {})));
        });
        const heroMetrics = await page.locator('.ml-feature-card').evaluateAll(cards => cards.map(card => {
            const box = card.getBoundingClientRect();
            const button = card.querySelector('.ml-hero-play,.ml-hero-unavailable')!.getBoundingClientRect();
            const title = card.querySelector('h3')!.getBoundingClientRect();
            return { left: button.x - box.x, bottom: box.bottom - button.bottom, width: button.width,
                height: button.height, titleTop: title.y - box.y, titleHeight: title.height };
        }));
        console.log('hero', width, heroMetrics);
        const rail = page.locator('.ml-feature-rail');
        for (const i of [1, 2, 0]) {
            await page.locator('.ml-feature-dots button').nth(i).click();
            await expect(page.locator('.ml-feature-dots button').nth(i)).toHaveAttribute('aria-current', 'true');
            await page.waitForTimeout(350);
            if (!before) await expect(page.locator('.ml-featured .ml-scroll-cue-x')).toBeHidden();
            if (width === 393) await page.screenshot({ path: `${output}/Folia-r254-${before ? 'before' : 'after'}-hero-${i}.png` });
        }
        const recent = page.locator('.ml-recent');
        const recentBox = await recent.boundingBox();
        const cover = await page.locator('.ml-recent-card').first().boundingBox();
        console.log('recent viewport', width, recentBox, 'cover', cover);
        const headingsBefore = await page.locator('.ml-home-section-heading').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().x));
        for (const position of ['initial', 'middle', 'end'] as const) {
            await recent.evaluate((el, p) => { el.scrollLeft = p === 'initial' ? 0 : p === 'end' ? el.scrollWidth : el.scrollWidth / 2; }, position);
            await page.waitForTimeout(200);
            if (width === 393) await page.screenshot({ path: `${output}/Folia-r254-${before ? 'before' : 'after'}-recent-${position}.png` });
            expect(await page.locator('.ml-home-section-heading').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().x))).toEqual(headingsBefore);
            for (const selector of ['html', 'body', '#root', '.ml-home-scroll']) {
                const dims = await page.locator(selector).evaluate(el => [el.scrollWidth, el.clientWidth, el.scrollLeft]);
                expect(dims[0]).toBeLessThanOrEqual(dims[1] + 1); expect(dims[2]).toBe(0);
            }
        }
        if (!before) {
            expect(recentBox!.x).toBeCloseTo(0, 0);
            expect(recentBox!.width).toBeCloseTo(width, 0);
            expect(cover!.x).toBeCloseTo(headingsBefore[0], 0);
            const last = await page.locator('.ml-recent-card').last().boundingBox();
            expect(last!.x + last!.width).toBeLessThanOrEqual(width - headingsBefore[0] + 1);
            expect(heroMetrics.every(m => Math.abs(m.bottom - heroMetrics[0].bottom) < 0.5 && Math.abs(m.height - heroMetrics[0].height) < 0.5 && Math.abs(m.left - heroMetrics[0].left) < 0.5)).toBe(true);
            // Hit-test both screen edges with a cover deliberately straddling each edge;
            // a full-width DOM box alone would miss an ancestor's hidden clipping.
            for (const edge of ['left', 'right'] as const) {
                await recent.evaluate((el, side) => {
                    const card = el.querySelector<HTMLElement>('.ml-recent-card')!;
                    const inset = parseFloat(getComputedStyle(el).paddingLeft);
                    const stride = card.offsetWidth + parseFloat(getComputedStyle(el).gap);
                    el.scrollLeft = side === 'left' ? inset + card.offsetWidth / 2 : inset + stride * 4 + card.offsetWidth / 2 - el.clientWidth;
                }, edge);
                await page.waitForTimeout(200);
                const hit = await recent.evaluate((el, side) => {
                    const art = el.querySelector('.ml-art')!.getBoundingClientRect();
                    return !!document.elementFromPoint(side === 'left' ? 1 : innerWidth - 1, art.y + art.height / 2)?.closest('.ml-recent-card');
                }, edge);
                expect(hit, `${edge} screen edge must show the straddling cover`).toBe(true);
                if (width === 393) await page.screenshot({ path: `${output}/Folia-r254-after-recent-${edge}-edge.png` });
            }
            const cue = page.locator('.ml-featured .ml-scroll-cue-x');
            await rail.evaluate(el => { el.scrollLeft = 100; });
            await expect(cue).toBeHidden();
        }
        await info.attach('layout', { body: JSON.stringify({ width, heroMetrics, recentBox, cover }), contentType: 'application/json' });
    });
}
