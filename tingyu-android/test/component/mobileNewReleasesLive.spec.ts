import { test, expect } from './fixtures';

// test/component/mobileNewReleasesLive.spec.ts
// Explicit opt-in only: anonymous official upstream reads through the actual Android bridge.
test.skip(process.env.FOLIA_LIVE_CHARTS !== '1', 'Live upstream validation is opt-in, never part of the offline suite.');
test.use({ viewport: { width: 393, height: 852 } });
test('QQ live chart can enter the existing player and advance its actual audio clock', async ({ page }) => {
    test.setTimeout(180000);
    const storage: Record<string, unknown> = {};
    (globalThis as any).chrome = { storage: {local: {get:async()=>storage, set:async(next:object)=>Object.assign(storage,next)}}, cookies:{getAll:async()=>[]} };
    const { handleFoliaApiRequest } = await import('../../src/nativeBridge/api/folia.js');
    await page.addInitScript(() => {
        localStorage.setItem('library_suite','mobile'); localStorage.setItem('last_app_view','home');
        localStorage.setItem('active_online_provider_id','qq'); localStorage.setItem('static_mode','true');
    });
    await page.route('**/__mock_qq__/**', async route => {
        const url = new URL(route.request().url());
        const params = Object.fromEntries(url.searchParams);
        const path = url.pathname.replace('/__mock_qq__','');
        let operation: string;
        if (path === '/getTopLists') operation='toplist_list';
        else if (path === '/getRanks') operation='toplist_detail';
        else if (path.startsWith('/getMusicPlay/')) { operation='music_play'; params.songmid=decodeURIComponent(path.split('/').pop()!); }
        else if (path.startsWith('/getSongInfo/')) { operation='song_info'; params.songmid=decodeURIComponent(path.split('/')[2]); }
        else return route.fulfill({json:{code:200,data:null,profile:null,songs:[],playlist:[],response:{code:0}}});
        try {
            const data = await handleFoliaApiRequest({provider:'qq',operation,params,path});
            return route.fulfill({json:data});
        } catch { return route.fulfill({status:502,json:{code:502,message:'Live upstream request failed'}}); }
    });
    await page.goto('/');
    await expect(page.getByTestId('mobile-home')).toBeVisible({timeout:60000});
    await page.locator('.ml-feature-dots button').nth(2).click();
    const card = page.locator('.ml-feature-card-new');
    await expect(card.locator('.ml-hero-play')).toBeVisible({timeout:45000});
    await card.locator('.ml-new-chart-open').click();
    await expect(page.locator('.ml-song-copy strong').nth(1)).toBeVisible({timeout:45000});
    // Real ranking data, not hard-coded metadata. Select another item if the first is rights-restricted.
    await page.locator('.ml-song-row').nth(1).locator('.ml-song-copy').click();
    await expect.poll(() => page.locator('audio').first().evaluate((el: HTMLAudioElement) =>
        ({time:el.currentTime, paused:el.paused, error:el.error?.code ?? null})), {timeout:45000})
        .toMatchObject({paused:false, error:null});
    await expect.poll(() => page.locator('audio').first().evaluate((el: HTMLAudioElement) => el.currentTime), {timeout:45000}).toBeGreaterThan(0.5);
    console.log('Live QQ playback verified: official chart -> original adapter -> original player -> audio clock > 0.5s; anonymous session.');
    await page.screenshot({path:`${process.env.FOLIA_SCROLL_QA_OUTPUT}/Folia-new-chart-live-qq.png`,animations:'disabled'});
});
