import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import '../../dev/probes/homeBehavior/probeApi';

// test/component/mobileRefinements.spec.ts
async function open(page: Page) {
    await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
    await page.goto('/dev-probe.html?probe=homeBehavior&sandbox');
    await page.waitForFunction(() => !!window.__homeProbe?.ready());
    await page.evaluate(() => window.__homeProbe!.setSuite('mobile'));
    await expect(page.getByTestId('mobile-home')).toBeVisible();
}
test.use({ viewport: { width: 390, height: 780 } });
test('all scrollbars are space-free thin overlays and fade after scrolling', async ({ page }) => {
    await open(page);
    await expect(page.locator('.ml-explore-section')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recommended probe-a 0', exact: true })).toBeVisible();
    // Explicit overflow fixture, independent of how many recommendations the fake account returns.
    await page.locator('.ml-feature-rail').evaluate((element) => {
        const card = element.firstElementChild!;
        for (let index = 0; index < 4; index++) element.append(card.cloneNode(true));
    });
    const rail = page.locator('.ml-feature-rail');
    await rail.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
    });
    const cue = rail.locator('..').locator(':scope > .ml-scroll-cue-x');
    await expect(cue).toHaveCSS('opacity', '1');
    await expect(cue).toHaveCSS('height', '2px');
    await expect(cue).toHaveCSS('pointer-events', 'none');
    expect((await cue.boundingBox())!.width).toBeGreaterThanOrEqual(24);
    await expect(cue).toHaveCSS('opacity', '0', { timeout: 2500 });
    expect(await rail.evaluate((element) => getComputedStyle(element, '::-webkit-scrollbar').display)).toBe('none');
    const scroller = page.locator('.ml-home-scroll');
    await scroller.evaluate((element) => {
        element.scrollTop = 150;
    });
    const vertical = scroller.locator('..').locator(':scope > .ml-scroll-cue-y');
    await expect(vertical).toHaveCSS('opacity', '1');
    await expect(vertical).toHaveCSS('width', '2px');
    expect((await vertical.boundingBox())!.height).toBeGreaterThanOrEqual(24);
    await expect(vertical).toHaveCSS('opacity', '0', { timeout: 2500 });
    const footer = page.locator('.ml-footer');
    expect(await footer.evaluate((element) => getComputedStyle(element, '::before').backdropFilter)).toMatch(
        /blur\(40px\)/
    );
    for (const item of [page.locator('.ml-mini'), page.locator('.ml-footer nav')]) {
        const color = await item.evaluate((element) => getComputedStyle(element).backgroundColor);
        // The shared footer samples and blurs the scrolling surface. The pills add only a tint.
        expect(Number(color.match(/[\d.]+(?=\))/)?.[0])).toBeGreaterThanOrEqual(0.7);
        await expect(item).toHaveCSS('backdrop-filter', 'none');
    }
});
test('playlist header scrolls away, no-version cache reentry is immediate and restores position', async ({ page }) => {
    await open(page);
    const openBig = () =>
        page.evaluate(async () => {
            const url = performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .find((url) => url.includes('/src/stores/useCollectionNavigationStore.ts'))!;
            const { useCollectionNavigationStore } = await import(url);
            useCollectionNavigationStore
                .getState()
                .openRoot(
                    {
                        source: 'online',
                        providerId: 'probe-a',
                        type: 'playlist',
                        id: 'big',
                        name: 'Big Playlist',
                        trackCount: 350,
                    },
                    'home'
                );
        });
    await openBig();
    const collection = page.getByTestId('mobile-collection');
    const list = collection.locator('.ml-track-list');
    await expect(collection.locator('h1')).toHaveText('Big Playlist');
    await expect
        .poll(() =>
            page.evaluate(() => window.__homeProbe!.requests().filter((item) => item.op === 'playlistTracks').length)
        )
        .toBeGreaterThan(0);
    await expect(collection.locator('.ml-song-copy').first()).toBeVisible();
    await list.evaluate((element) => {
        element.scrollTop = 1300;
    });
    await expect(collection.locator('h1')).toHaveCount(0);
    const position = await list.evaluate((element) => element.scrollTop);
    const requests = await page.evaluate(
        () => window.__homeProbe!.requests().filter((item) => item.op === 'playlistTracks').length
    );
    await collection.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(collection).toHaveCount(0);
    await openBig();
    await expect(collection.locator('.ml-song-copy').first()).toBeVisible();
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(position - 20);
    expect(
        await page.evaluate(() => window.__homeProbe!.requests().filter((item) => item.op === 'playlistTracks').length)
    ).toBe(requests);
    expect(await collection.getByTestId('mobile-song-row').count()).toBeLessThan(22);
});
test('current-song bars animate while playing and freeze when paused', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /Public Playlist/ }).click();
    await expect(page.getByTestId('mobile-song-row').first()).toBeVisible();
    await page.evaluate(async () => {
        const module = (name: string) =>
            performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .find((url) => url.includes(`/src/${name}.ts`))!;
        const playback = await import(module('stores/usePlaybackStore'));
        const { useCollectionNavigationStore } = await import(module('stores/useCollectionNavigationStore'));
        const registryPath = '/src/library/core/services/collectionResourceRegistry.ts';
        const creationPath = '/src/library/core/services/createCollectionResource.ts';
        const { collectionResourceRegistry } = await import(registryPath);
        const { resolveCollectionResourceKey } = await import(creationPath);
        const descriptor = useCollectionNavigationStore.getState().snapshot.stack[0];
        const resource = collectionResourceRegistry.peekOrCreate(
            resolveCollectionResourceKey(descriptor),
            descriptor,
            () => {
                throw Error('missing retained resource');
            }
        );
        playback.setCurrentSong(resource.getSnapshot().tracks[0]);
        playback.setPlayerState('PLAYING');
    });
    const bars = page.locator('.ml-song-playing i').first();
    await expect(bars).toBeVisible();
    const sample = () => bars.evaluate((element) => getComputedStyle(element).transform);
    const first = await sample();
    await expect.poll(sample).not.toBe(first);
    await page.evaluate(async () => {
        const url = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((url) => url.includes('/src/stores/usePlaybackStore.ts'))!;
        (await import(url)).setPlayerState('PAUSED');
    });
    await expect(bars).toHaveCSS('animation-play-state', 'paused');
    await bars.evaluate(async element => {
        await Promise.all(element.getAnimations().map(animation => animation.ready));
    });
    const paused = await sample();
    await page.waitForTimeout(180);
    expect(await sample()).toBe(paused);
});
