import { test, expect } from './fixtures';

// test/component/mobileNewReleases.spec.ts
test.use({ viewport: { width: 393, height: 852 } });
test('new chart opens the original collection and only explicit play creates its queue', async ({ page }) => {
    let lists = 0;
    let fail = true;
    await page.addInitScript(() => {
        localStorage.setItem('library_suite', 'mobile');
        localStorage.setItem('last_app_view', 'home');
        localStorage.setItem('active_online_provider_id', 'qq');
        performance.setResourceTimingBufferSize(10000);
    });
    await page.route('**/__mock_qq__/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.includes('/getMusicPlay/')) {
            const mid = path.split('/').pop()!;
            return route.fulfill({ json: { code: 200, data: { playUrl: { [mid]: { url: 'http://127.0.0.1:4175/__chart_audio__.wav' } } } } });
        }
        if (path.endsWith('/getTopLists')) {
            lists++;
            return route.fulfill({ json: fail ? { response: { code: 500 } } : { response: { code: 0, data: { topList: [
                { id: 901, topTitle: '新歌榜' },
            ] } } } });
        }
        if (path.endsWith('/getRanks')) return route.fulfill({ json: { response: { code: 0, req_1: { code: 0, data: {
            data: { topId: 901, title: '新歌榜', totalNum: 2, song: [{ songId: 2 }, { songId: 1 }] },
            songInfoList: [1, 2].map(id => ({ id, mid: `chart-mid-${id}`, name: `Chart song ${id}`,
                singer: [{ mid: 'chart-artist', name: 'Chart artist' }], album: {mid: 'chart-album', name: 'Chart album'}, interval: 200 })),
        } } } } });
        // Controlled anonymous state; fixture requests never reach a user's account or real music service.
        return route.fulfill({ json: { code: 200, data: null, songs: [], playlist: [], albums: [], response: { code: 0 } } });
    });
    const wave = Buffer.alloc(44 + 16000 * 20 * 2);
    wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
    wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
    wave.writeUInt32LE(16000, 24); wave.writeUInt32LE(32000, 28); wave.writeUInt16LE(2, 32);
    wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
    await page.route('**/__chart_audio__.wav', route => route.fulfill({ body: wave, contentType: 'audio/wav' }));
    await page.goto('/');
    await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 60000 });
    await page.locator('.ml-feature-dots button').nth(2).click();
    const card = page.locator('.ml-feature-card-new');
    await expect(card.getByRole('button', {name:'Retry', exact:true})).toBeVisible();
    fail = false;
    await card.getByRole('button', {name:'Retry', exact:true}).click();
    await expect(card.locator('.ml-hero-play')).toBeVisible();
    const queue = () => page.evaluate(async () => {
        const url = performance.getEntriesByType('resource').map(entry => entry.name).find(url => url.includes('/src/stores/usePlaybackStore.ts'))!;
        return (await import(url)).usePlaybackStore.getState().playQueue.map((song: any) => [song.name, song.sourceRef?.providerId]);
    });
    expect(await queue()).toEqual([]);
    await card.getByRole('button', {name:'New releases', exact:true}).click();
    await expect(page.getByTestId('mobile-collection')).toBeVisible();
    await expect(page.locator('.ml-song-copy strong')).toHaveText(['Chart song 2', 'Chart song 1']);
    expect(await queue()).toEqual([]);
    await page.locator('.ml-footer nav button').first().click();
    await page.locator('.ml-feature-dots button').nth(2).click();
    await card.locator('.ml-hero-play').click();
    await expect.poll(queue).toEqual([['Chart song 2', 'qq'], ['Chart song 1', 'qq']]);
    expect(lists, 'the retry should succeed and subsequent home visits reuse fresh metadata').toBe(2);
});
