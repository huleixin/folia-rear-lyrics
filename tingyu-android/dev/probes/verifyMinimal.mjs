// dev/probes/verifyMinimal.mjs
// Browser-level behaviour checks for the minimal stage. Dev-only.
//
// These run against the real component in Chromium at a phone viewport with touch enabled, so the
// swipe is a trusted CDP touch sequence rather than a synthetic event — a page that only "works"
// with dispatched events would pass the latter and fail on a phone.
//
// They are NOT a device test: no Media3, no rear screen, no real insets.
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:4399/minimal-stage-preview.html';
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(`${BASE}?page=cover&theme=dark&stationary=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const state = () => page.evaluate(() => window.__minimalPreview.state());

// 1. The cover page is what a fresh visit shows.
let current = await state();
check('cover page is restored on a fresh visit', current.page === 'cover' && current.scrollLeft === 0, `page=${current.page}`);

// 2. A trusted horizontal swipe moves the strip to the lyric page.
const client = await context.newCDPSession(page);
const swipe = async (fromX, toX, y) => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
    const steps = 12;
    for (let step = 1; step <= steps; step += 1) {
        await client.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: fromX + ((toX - fromX) * step) / steps, y }],
        });
        await page.waitForTimeout(12);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(700);
};
await swipe(340, 40, 420);
current = await state();
check('swiping right on the cover page opens the lyric page', current.page === 'lyrics', `page=${current.page} left=${Math.round(current.scrollLeft)}`);

// 3. Tapping a lyric line seeks the playback the app already owns. Done while the lyric page is
//    the visible one: the off-screen page is inert, so a tap there is correctly ignored.
const lineBox = await page.evaluate(() => {
    const scroller = document.querySelector('.min-lyrics__scroll').getBoundingClientRect();
    const lines = [...document.querySelectorAll('.min-line')];
    const target = lines.find(node => {
        const box = node.getBoundingClientRect();
        return box.top > scroller.top + 40 && box.bottom < scroller.bottom - 40;
    }) ?? lines[lines.length - 1];
    const box = target.getBoundingClientRect();
    return { x: box.left + 40, y: box.top + box.height / 2, text: target.textContent.slice(0, 4) };
});
await page.touchscreen.tap(lineBox.x, lineBox.y);
await page.waitForTimeout(300);
current = await state();
check('tapping a lyric line seeks to its start time', current.seeks.length > 0 && Number.isFinite(current.seeks.at(-1)), `line="${lineBox.text}" seeks=${JSON.stringify(current.seeks)}`);

// 4. The lyric page keeps the vertical list scrollable without flipping the page.
const lyricsScrollBefore = await page.evaluate(() => document.querySelector('.min-lyrics__scroll').scrollTop);
await (async () => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 480 }] });
    for (let step = 1; step <= 10; step += 1) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 480 - step * 22 }] });
        await page.waitForTimeout(12);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(700);
})();
const afterVertical = await state();
const lyricsScrollAfter = await page.evaluate(() => document.querySelector('.min-lyrics__scroll').scrollTop);
check('a vertical lyric scroll does not switch pages', afterVertical.page === 'lyrics', `page=${afterVertical.page}`);
check('a vertical lyric scroll moves the lyric list', lyricsScrollAfter > lyricsScrollBefore, `${lyricsScrollBefore} -> ${lyricsScrollAfter}`);

// 5. Swiping left returns to the cover page, also when the gesture starts on a lyric line.
await swipe(50, 350, 420);
current = await state();
check('swiping left on the lyric page returns to the cover page', current.page === 'cover', `page=${current.page} left=${Math.round(current.scrollLeft)}`);

// 6. The stage entry is a visit, not a preference change. It only exists on the lyric page, so
//    get back there with the gesture the listener would use.
await page.locator('.min-dot').nth(1).click();
await page.waitForTimeout(900);
await swipe(340, 40, 420);
await page.click('[data-testid="minimal-open-stage"]');
await page.waitForTimeout(200);
current = await state();
check('the stage entry opens the classic stage as a visit', current.detour === true && current.mode === 'minimal', `detour=${current.detour} mode=${current.mode}`);

// 7. Leaving the visit returns to the minimal page and leaves the preference alone.
await page.evaluate(() => window.__minimalPreview.closeStage());
await page.waitForTimeout(200);
current = await state();
check('leaving the stage returns to the minimal page', current.detour === false && current.page === 'lyrics' && current.mode === 'minimal', JSON.stringify({ detour: current.detour, page: current.page }));

// 8. The pause state stops the ambient animation.
await page.goto(`${BASE}?page=cover&theme=dark&paused=1&stationary=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const paused = await page.evaluate(() => {
    const amb = document.querySelector('.min-amb');
    const field = document.querySelector('.min-amb__field--a');
    const style = getComputedStyle(field);
    return { flag: amb?.hasAttribute('data-paused') ?? false, playState: style.animationPlayState, name: style.animationName };
});
check('paused playback pauses the ambient drift', paused.flag && paused.playState === 'paused', JSON.stringify(paused));

const playing = await (async () => {
    await page.goto(`${BASE}?page=cover&theme=dark&stationary=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    return page.evaluate(() => {
        const field = document.querySelector('.min-amb__field--a');
        const style = getComputedStyle(field);
        return { playState: style.animationPlayState, name: style.animationName, duration: style.animationDuration };
    });
})();
check('playing playback runs the drift on a long, low-frequency loop', playing.playState === 'running' && playing.name === 'min-drift-a', JSON.stringify(playing));

// 9. The layout survives a narrow phone and a light theme.
const narrowErrors = [];
for (const [width, height, theme] of [[360, 780, 'dark'], [393, 852, 'light']]) {
    const view = await context.newPage();
    view.on('pageerror', error => narrowErrors.push(`${width}/${theme}: ${error.message}`));
    await view.setViewportSize({ width, height });
    await view.goto(`${BASE}?page=cover&theme=${theme}&stationary=1`, { waitUntil: 'networkidle' });
    await view.waitForTimeout(700);
    const overflow = await view.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        coverRatio: (() => {
            const art = document.querySelector('.min-art')?.getBoundingClientRect();
            return art ? art.width / art.height : 0;
        })(),
    }));
    check(`${width}px / ${theme}: no horizontal overflow, artwork stays 1:1`, overflow.horizontal <= 0 && Math.abs(overflow.coverRatio - 1) < 0.01, JSON.stringify(overflow));
    await view.close();
}

check('no uncaught page errors', errors.length === 0 && narrowErrors.length === 0, [...errors, ...narrowErrors].join(' | '));

await browser.close();
const failed = results.filter(item => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
