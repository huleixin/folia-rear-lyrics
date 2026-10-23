import { test, expect } from './fixtures';
import path from 'node:path';

// test/component/mobileShuffleMode.spec.ts
const audio = Buffer.alloc(44 + 8000 * 120 * 2);
audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
test.use({ viewport: { width: 390, height: 844 } });
test('four-mode switch drives real next/previous/ended actions without mutating the original playlist', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://audio.fixture/**', route => route.fulfill({ contentType: 'audio/wav', headers: { 'Access-Control-Allow-Origin': '*' }, body: audio }));
    await page.route('**/__mock_netease__/**', route => {
        const url = new URL(route.request().url()), endpoint = url.pathname.replace('/__mock_netease__', '');
        const id = Number(url.searchParams.get('id') || 1);
        const data = endpoint.startsWith('/song/url') ? { code: 200, data: [{ id, code: 200, url: `https://audio.fixture/${id}.wav`, type: 'wav', level: 'standard', size: audio.length }] }
            : endpoint.startsWith('/lyric') ? { code: 200, lrc: { lyric: '[00:00.00]Fixture lyrics' } } : { code: 200, data: {} };
        return route.fulfill({ json: data });
    });
    await page.addInitScript(() => { localStorage.setItem('library_suite', 'mobile'); localStorage.setItem('last_app_view', 'home'); });
    await page.goto('/');
    await expect(page.getByTestId('mobile-home')).toBeVisible({ timeout: 60000 });
    await page.addStyleTag({ content: '[data-testid="dev-library-renderer-switch"]{display:none!important}' });
    await page.evaluate(async () => {
        const playback = await import('/src/stores/usePlaybackStore.ts' as string);
        const queue = [1, 2, 3, 4, 5].map(id => ({ id, name: `Shuffle fixture ${id}`, artists: [{ id: 1, name: 'Fixture artist' }], album: { id: 1, name: 'Fixture' }, durationMs: 120000,
            sourceRef: { kind: 'online', providerId: 'netease', mediaId: id } }));
        playback.setPlayQueue(queue); playback.setCurrentSong(queue[0]); playback.setDuration(120); playback.setPlayerState('PAUSED');
    });
    await expect(page.locator('.ml-footer')).toBeVisible();
    for (const pill of [page.locator('.ml-mini'), page.locator('.ml-footer nav')]) {
        await expect(pill).toHaveAttribute('data-glass-engine', 'backdrop-refraction');
        await expect(pill).toHaveCSS('backdrop-filter', /url\(/);
    }
    // QA-only high-contrast content behind both pills makes a failed backdrop filter obvious.
    await page.locator('.ml-home').evaluate(node => {
        const backdrop = document.createElement('div'); backdrop.dataset.qaBackdrop = 'true';
        backdrop.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:160px;background:repeating-linear-gradient(50deg,#7033ad 0 14px,#194735 14px 28px);font-size:26px;font-weight:800;line-height:36px;color:#fff';
        backdrop.textContent = 'BACKGROUND TEXT · BACKGROUND TEXT · BACKGROUND TEXT · BACKGROUND TEXT';
        node.append(backdrop);
    });
    await page.screenshot({ path: path.resolve('../../outputs/Folia-mobile-r251-frosted-bars.png'), scale: 'css' });
    await page.locator('[data-qa-backdrop]').evaluate(node => node.remove());
    await page.getByRole('button', { name: 'Open original lyrics stage' }).click();
    const mode = page.getByRole('button', { name: 'Change repeat mode', exact: true });
    for (const label of ['Repeat all', 'Repeat one', 'Shuffle']) { await mode.click(); await expect(mode).toContainText(label); }
    await expect(page.locator('.mps-transport > button')).toHaveCount(2);
    const read = () => page.evaluate(async () => {
        const playback = await import('/src/stores/usePlaybackStore.ts' as string);
        return { id: playback.usePlaybackStore.getState().currentSong?.id, state: playback.usePlaybackStore.getState().playerState,
            queue: playback.usePlaybackStore.getState().playQueue.map((item: any) => item.id) };
    });
    const planned = await page.evaluate(async () => {
        const playback = await import('/src/stores/usePlaybackStore.ts' as string);
        const { shufflePlayback } = await import('/src/services/shufflePlayback.ts' as string);
        const state = playback.usePlaybackStore.getState(); return shufflePlayback.next(state.playQueue, state.currentSong)?.id;
    });
    await page.getByRole('button', { name: 'Next track', exact: true }).click();
    await expect.poll(async () => (await read()).id).toBe(planned);
    await expect.poll(async () => (await read()).state).toBe('PLAYING');
    await page.getByRole('button', { name: 'Previous track', exact: true }).click();
    await expect.poll(async () => (await read()).id).toBe(1);
    await expect.poll(async () => (await read()).state).toBe('PLAYING');
    await page.evaluate(() => document.querySelector('audio')!.dispatchEvent(new Event('ended', { bubbles: true })));
    await expect.poll(async () => (await read()).id).toBe(planned);
    await expect.poll(async () => (await read()).state).toBe('PLAYING');
    await expect(mode).toContainText('Shuffle');
    await page.screenshot({ path: path.resolve('../../outputs/Folia-mobile-r251-shuffle-mode.png'), scale: 'css' });
    await mode.click(); await expect(mode).toContainText('Repeat off');
    expect((await read()).queue).toEqual([1, 2, 3, 4, 5]);
    expect(errors).toEqual([]);
});
