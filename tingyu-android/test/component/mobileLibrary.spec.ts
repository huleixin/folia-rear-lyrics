import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import '../../dev/probes/homeBehavior/probeApi';

// test/component/mobileLibrary.spec.ts
const openMobileHome = async (page: Page) => {
    await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
    await page.goto('/dev-probe.html?probe=homeBehavior&sandbox');
    await page.waitForFunction(() => !!window.__homeProbe?.ready());
    await page.evaluate(() => window.__homeProbe!.setSuite('mobile'));
    await expect(page.getByTestId('mobile-home')).toBeVisible();
    await expect(page.locator('.ml-footer nav')).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
    await page.locator('.ml-home-scroll').evaluate(async (element) => {
        await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
    });
    // This probe-only renderer switch sits over the bottom navigation and otherwise intercepts
    // the very footer taps these tests need to verify.
    await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"] { display: none !important; }' });
};
test.use({ viewport: { width: 390, height: 844 } });
test('mobile home preserves provider navigation, playlist playback, queue and original-stage entry', async ({
    page,
}) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openMobileHome(page);
    await page.locator('.ml-home-playlist-copy').filter({ hasText: 'Public Playlist' }).click();
    await expect(page.getByTestId('mobile-song-row').first()).toBeVisible();
    const collection = page.getByTestId('mobile-collection');
    await collection.locator('.ml-song-copy').first().click();
    await expect
        .poll(() => page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'playSong').length))
        .toBe(1);
    await collection.getByRole('button', { name: /Play all/ }).click();
    await expect
        .poll(() => page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'playAll').length))
        .toBe(1);
    await collection.locator('.ml-song-row .ml-icon').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add to queue', exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'addSongToQueue').length)
        )
        .toBe(1);
    await collection.getByRole('button', { name: 'Search this playlist' }).click();
    await collection.getByRole('textbox', { name: 'Search this playlist' }).fill('Track 2 Cedar');
    await expect(collection.locator('.ml-song-copy strong')).toHaveText(['Track 2 Cedar']);
    await expect(page.locator('.ml-footer nav')).toHaveCount(0);
    await collection.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(collection).toHaveCount(0);
    await expect(page.locator('.ml-footer nav')).toBeVisible();
    await page.getByRole('button', { name: 'Open original lyrics stage' }).click();
    await expect
        .poll(() =>
            page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'backToPlayer').length)
        )
        .toBe(1);
    expect(errors).toEqual([]);
});
test('footer, sheets and responsive layout stay inside the phone viewport', async ({ page }) => {
    await openMobileHome(page);
    for (const viewport of [
        { width: 320, height: 568 },
        { width: 430, height: 932 },
        { width: 844, height: 390 },
    ]) {
        await page.setViewportSize(viewport);
        const footer = await page.locator('.ml-footer').boundingBox();
        expect(footer!.x).toBeGreaterThanOrEqual(0);
        expect(footer!.x + footer!.width).toBeLessThanOrEqual(viewport.width);
        expect(footer!.y + footer!.height).toBeLessThanOrEqual(viewport.height);
        // The shell applies its viewport measurements asynchronously after resize.
        await expect.poll(() => page.getByTestId('mobile-home')
            .evaluate((element) => element.scrollWidth > element.clientWidth), { message: JSON.stringify(viewport) }).toBe(false);
        const hero = await page.locator('.ml-feature-card').first().boundingBox();
        const heroPlay = await page.locator('.ml-feature-card').first().locator('.ml-hero-play').boundingBox();
        expect(heroPlay!.y + heroPlay!.height).toBeLessThanOrEqual(hero!.y + hero!.height);
    }
    await page.locator('.ml-source').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /probe-b/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});
test('large playlists mount only a small window of rows and can reach the final track', async ({ page }) => {
    await openMobileHome(page);
    await page.evaluate(async () => {
        const moduleUrl = '/src/stores/useCollectionNavigationStore.ts';
        const { useCollectionNavigationStore } = await import(moduleUrl);
        useCollectionNavigationStore.getState().openRoot(
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
    await expect(collection.locator('.ml-playlist-count')).toHaveText('350 tracks');
    await expect(collection.getByTestId('mobile-song-row').first()).toBeVisible();
    expect(await collection.getByTestId('mobile-song-row').count()).toBeLessThan(20);
    await collection.locator('.ml-track-list').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await expect(collection.getByText('Track 349 Ember', { exact: true })).toBeVisible();
    expect(await collection.getByTestId('mobile-song-row').count()).toBeLessThan(20);
    await page.setViewportSize({ width: 844, height: 390 });
    // Header scrolls away with the songs, rather than remaining a separate fixed panel.
    await expect(collection.getByRole('button', { name: 'Play all', exact: true })).toHaveCount(0);
    const list = await collection.locator('.ml-track-list').boundingBox();
    expect(list!.height).toBeGreaterThan(80);
    await collection.locator('.ml-track-list').evaluate(element => { element.scrollTop = 0; });
    await expect(collection.getByRole('button', { name: 'Play all', exact: true })).toBeVisible();
});
test('mobile sheets and page entries respect reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMobileHome(page);
    expect(await page.locator('.ml-home-scroll').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    await page.locator('.ml-source').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});
test('clock updates do not redraw the browsing page or reintroduce a progress capsule', async ({ page }) => {
    await openMobileHome(page);
    // Image decoding/fallbacks belong to initialization, not to the clock update being measured.
    await page.getByTestId('mobile-home').locator('img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => {}))));
    const result = await page.evaluate(async () => {
        const modulePath = (name: string) =>
            performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .find((url) => url.includes(`/src/${name}.ts`) && !url.includes('.tsx')) || `/src/${name}.ts`;
        const { currentTime } = await import(modulePath('stores/motionSignals'));
        const { usePlaybackStore } = await import(modulePath('stores/usePlaybackStore'));
        usePlaybackStore.getState().setDuration(200);
        await new Promise((resolve) => setTimeout(resolve, 50));
        let mutations = 0;
        const changes: string[] = [];
        const observer = new MutationObserver((records) => {
            mutations += records.length;
            changes.push(...records.map(record => `${(record.target as HTMLElement).className}:${record.attributeName}`));
        });
        observer.observe(document.querySelector('[data-testid="mobile-home"]')!, {
            subtree: true,
            attributes: true,
            childList: true,
            characterData: true,
        });
        observer.observe(document.querySelector('[data-testid="mobile-mini-player"]')!, {
            subtree: true,
            attributes: true,
            childList: true,
            characterData: true,
        });
        for (let index = 0; index <= 100; index++) currentTime.set(index);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        observer.disconnect();
        return {
            mutations,
            changes,
            progressBars: document.querySelectorAll('.ml-mini-progress').length,
        };
    });
    expect(result.changes).toEqual([]);
    expect(result.progressBars).toBe(0);
});
test('separate glass player and navigation retain real pause and next transport actions', async ({ page }) => {
    await openMobileHome(page);
    await page.evaluate(async () => {
        const url =
            performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .find((name) => name.includes('/src/stores/usePlaybackStore.ts')) || '/src/stores/usePlaybackStore.ts';
        const playback = await import(url);
        playback.setCurrentSong({
            id: 'test',
            name: 'Control fixture',
            artists: [],
            album: { id: 0, name: '' },
            durationMs: 1000,
            sourceRef: { kind: 'online', providerId: 'probe-a', mediaId: 'test' },
        });
        playback.setPlayerState('PLAYING');
    });
    const player = page.getByTestId('mobile-mini-player');
    await player.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect
        .poll(() =>
            page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'togglePlayback').length)
        )
        .toBe(1);
    await player.getByRole('button', { name: 'Next track', exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'nextTrack').length))
        .toBe(1);
    const bar = await player.boundingBox();
    const nav = await page.locator('.ml-footer nav').boundingBox();
    expect(nav!.y - (bar!.y + bar!.height)).toBeGreaterThanOrEqual(6);
    await expect(player).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
    await expect(page.locator('.ml-footer nav')).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
    // The selected-tab highlight sits inside the outer lens, without a second backdrop capture.
    await expect(page.locator('.ml-footer nav [aria-current="page"]')).not.toHaveAttribute('data-glass-engine');
    expect(await player.evaluate((el) => getComputedStyle(el).backdropFilter)).toMatch(/^url\(/);
    expect(await page.locator('.ml-footer nav').evaluate((el) => getComputedStyle(el).backdropFilter)).toMatch(
        /^url\(/
    );
});

test('mobile home uses the three supplied recommendation artworks without changing the glass footer', async ({ page }) => {
    await openMobileHome(page);
    const cards = page.locator('.ml-feature-card');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('[data-recommendation-kind="personal"] .ml-hero-background')).toHaveAttribute(
        'src',
        '/assets/mobile-home/guess-you-like.png'
    );
    await expect(page.locator('[data-recommendation-kind="daily"] .ml-hero-background')).toHaveAttribute(
        'src',
        '/assets/mobile-home/daily-30.png'
    );
    await expect(page.locator('[data-recommendation-kind="new"] .ml-hero-background')).toHaveAttribute(
        'src',
        '/assets/mobile-home/new-releases.png'
    );
    await expect(page.locator('[data-recommendation-kind="new"] .ml-hero-unavailable')).toBeVisible();
    const geometry = await cards.first().evaluate((card) => {
        const box = card.getBoundingClientRect();
        return { ratio: box.width / box.height, visibleWidth: box.width, viewport: innerWidth };
    });
    expect(geometry.ratio).toBeGreaterThan(1.12);
    expect(geometry.ratio).toBeLessThan(1.22);
    expect(geometry.visibleWidth).toBeLessThan(geometry.viewport);
    await expect(page.locator('.ml-mini')).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
    await expect(page.locator('.ml-footer nav')).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
    await page.locator('.ml-feature-dots button').nth(2).click();
    await expect(page.locator('.ml-feature-dots button').nth(2)).toHaveAttribute('aria-current', 'true');
    await expect.poll(() => page.locator('.ml-feature-rail').evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    await page.locator('.ml-home-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const lastPlaylist = await page.locator('.ml-home-playlist-card').last().boundingBox();
    const footer = await page.locator('.ml-footer').boundingBox();
    expect(lastPlaylist!.y + lastPlaylist!.height).toBeLessThanOrEqual(footer!.y);
});

test('home song and playlist menus keep working playback actions', async ({ page }) => {
    await openMobileHome(page);
    await page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').map((entry) => entry.name)
            .find((name) => name.includes('/src/stores/useMobileLibraryStore.ts')) || '/src/stores/useMobileLibraryStore.ts';
        const { useMobileLibraryStore } = await import(url);
        useMobileLibraryStore.setState({ recentTracks: [{ id: 'recent-fixture', name: 'Recent fixture', artists: [],
            album: { id: 0, name: '' }, durationMs: 1000,
            sourceRef: { kind: 'online', providerId: 'probe-a', mediaId: 'recent-fixture' } }] });
    });
    await page.getByRole('button', { name: 'Track actions: Recent fixture', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'playSong').length)).toBe(1);
    await page.getByRole('button', { name: 'Playlist actions：Public Playlist', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Play all', exact: true }).click();
    await expect(page.getByTestId('mobile-collection')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'playAll').length)).toBe(1);
});

test('login stays above the persistent footer and hero play requests execute once', async ({ page }) => {
    await openMobileHome(page);
    await page.locator('.ml-source').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign in to music source' }).click();
    await expect(page.locator('.ml-account-layer')).not.toBeEmpty();
    expect(
        await page.evaluate(() =>
            document.querySelector('.ml-account-layer')!.contains(document.elementFromPoint(65, 803))
        )
    ).toBe(true);
    // A separate mount closes any login session and resets the fake provider log.
    await openMobileHome(page);
    await page.locator('.ml-home-playlist-copy').filter({ hasText: 'Public Playlist' }).click();
    await page.getByTestId('mobile-song-row').first().waitFor();
    await page.evaluate(async () => {
        const moduleUrl =
            performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .find((url) => url.includes('/src/stores/useMobileLibraryStore.ts')) ||
            '/src/stores/useMobileLibraryStore.ts';
        const { useMobileLibraryStore } = await import(moduleUrl);
        const identityUrl = '/src/library/core/model/collectionIdentity.ts';
        const { collectionKey } = await import(identityUrl);
        const navigationUrl =
            performance
                .getEntriesByType('resource')
                .map((entry) => entry.name)
                .find((url) => url.includes('/src/stores/useCollectionNavigationStore.ts')) ||
            '/src/stores/useCollectionNavigationStore.ts';
        const { useCollectionNavigationStore } = await import(navigationUrl);
        const collection = useCollectionNavigationStore.getState().snapshot.stack[0];
        useMobileLibraryStore.getState().requestCollectionPlay(collectionKey(collection));
    });
    await expect
        .poll(() => page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'playAll').length))
        .toBe(1);
    await page.waitForTimeout(100);
    expect(
        await page.evaluate(() => window.__homeProbe!.calls().filter((call) => call.kind === 'playAll').length)
    ).toBe(1);
});
