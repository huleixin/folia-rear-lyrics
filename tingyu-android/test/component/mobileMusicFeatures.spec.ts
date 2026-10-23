import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import '../../dev/probes/homeBehavior/probeApi';

// test/component/mobileMusicFeatures.spec.ts
async function open(page: Page) {
    await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
    await page.goto('/dev-probe.html?probe=homeBehavior&sandbox');
    await page.waitForFunction(() => !!window.__homeProbe?.ready());
    await page.evaluate(() => window.__homeProbe!.setSuite('mobile'));
    await expect(page.locator('.ml-mix-personal')).toBeVisible();
}
async function setActive(page: Page, index: number, provider?: string) {
    return page.evaluate(
        async ({ index, provider }) => {
            const path = (name: string) =>
                performance
                    .getEntriesByType('resource')
                    .map((entry) => entry.name)
                    .find((url) => url.includes(`/src/${name}.ts`))!;
            const { useCollectionNavigationStore } = await import(path('stores/useCollectionNavigationStore'));
            const { collectionResourceRegistry } = await import(
                path('library/core/services/collectionResourceRegistry')
            );
            const { resolveCollectionResourceKey } = await import(
                path('library/core/services/createCollectionResource')
            );
            const descriptor = useCollectionNavigationStore.getState().snapshot.stack[0];
            const resource = collectionResourceRegistry.peekOrCreate(
                resolveCollectionResourceKey(descriptor),
                descriptor,
                () => {
                    throw Error('resource missing');
                }
            );
            const song = resource.getSnapshot().tracks[index];
            if (!song) throw Error('track not loaded');
            const playback = await import(path('stores/usePlaybackStore'));
            playback.setCurrentSong(
                provider ? { ...song, sourceRef: { ...song.sourceRef, providerId: provider } } : song
            );
            playback.setPlayerState('PLAYING');
            return song.name;
        },
        { index, provider }
    );
}
test.use({ viewport: { width: 390, height: 780 } });
test('real FM and daily entries precede upstream playlists and route through their original actions', async ({
    page,
}) => {
    await open(page);
    const titles = page.locator('.ml-feature-card h3');
    await expect(titles.nth(0)).toHaveText('Made for you');
    await expect(titles.nth(1)).toHaveText('Daily mix');
    await expect(titles.nth(2)).toHaveText('Recommended probe-a 0');
    await page.locator('.ml-mix-personal .ml-hero-art').click();
    await expect
        .poll(() =>
            page.evaluate(
                () => window.__homeProbe!.calls().filter((call) => call.kind === 'playSong' && call.isFm).length
            )
        )
        .toBe(1);
    await page.locator('.ml-mix-daily .ml-hero-art').click();
    await expect(page.getByTestId('mobile-collection')).toBeVisible();
    await expect(page.getByTestId('mobile-song-row').first()).toBeVisible();
    expect(
        await page.evaluate(() => window.__homeProbe!.requests().some((request) => request.op === 'dailySongs'))
    ).toBe(true);
});
test('empty personal recommendations produce a visible message instead of silent success', async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
        const url = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((url) => url.includes('/src/services/onlineMusic/providerRegistry.ts'))!;
        (await import(url)).getOnlineMusicProvider('probe-a').recommendations.getPersonalFm = async () => [];
    });
    await page.locator('.ml-mix-personal .ml-hero-art').click();
    await expect(page.locator('.ml-featured [role="status"]')).toHaveText(/No recommendations available/);
});
test('locator finds the current song, clears a hiding filter and keeps provider identities separate', async ({
    page,
}) => {
    await open(page);
    await page.evaluate(async () => {
        const url = performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .find((url) => url.includes('/src/stores/useCollectionNavigationStore.ts'))!;
        (await import(url)).useCollectionNavigationStore
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
    const collection = page.getByTestId('mobile-collection');
    await expect(collection.locator('.ml-song-row').first()).toBeVisible();
    const name = await setActive(page, 1);
    const list = collection.locator('.ml-track-list');
    await list.evaluate((element) => {
        element.scrollTop = 1600;
    });
    const locate = page.getByRole('button', { name: 'Find playing track', exact: true });
    await expect(locate).toBeVisible();
    await locate.click();
    await expect(collection.locator('.ml-song-row.is-current')).toContainText(name);
    await expect(collection.locator('.ml-song-row.is-current')).toBeInViewport();
    await expect(locate).toHaveCount(0);
    await collection.getByRole('button', { name: 'Search this playlist', exact: true }).click();
    await collection.getByRole('textbox', { name: 'Search this playlist', exact: true }).fill('Track 20');
    await expect(collection.locator('.ml-song-row.is-current')).toHaveCount(0);
    await locate.click();
    await expect(collection.getByRole('textbox')).toHaveCount(0);
    await expect(collection.locator('.ml-song-row.is-current')).toBeInViewport();
    await setActive(page, 1, 'probe-b');
    await list.evaluate((element) => {
        element.scrollTop = 1600;
    });
    await expect(locate).toHaveCount(0);
    expect(await collection.getByTestId('mobile-song-row').count()).toBeLessThan(22);
});
