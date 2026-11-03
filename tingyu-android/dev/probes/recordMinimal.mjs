// dev/probes/recordMinimal.mjs
// Records the transitions the phone cannot be filmed on: the page rising in, a drag that follows
// the finger, the lyric column crossing a line and seeking, and the page falling away. Runs the real component in Chromium at a phone viewport.
//
// This is harness footage, not a device recording: no Media3, no rear screen, no real frame pacing.
// It is here so the motion can be reviewed at all, and the audit document says exactly that.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:4399/minimal-stage-preview.html';
const OUT = process.env.OUT_DIR ?? 'C:/Users/DELL/WorkBuddy/2026-11-03-12-06-47/shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: path.join(OUT, 'video-raw'), size: { width: 393, height: 852 } },
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 1. Mount: the page rises from the bottom edge. The very first load is not reliably inside the
//    capture (the recording starts before the renderer paints), so the same mount is repeated with
//    a reload once the recorder is already running — that copy is what the clip shows.
await page.goto(`${BASE}?page=cover&theme=dark&stationary=1`, { waitUntil: 'load' });
await sleep(1400);
await page.reload({ waitUntil: 'load' });
await sleep(1400);

// 2. A drag on the cover page, held mid-gesture so the follow is visible, then released.
await touch('touchStart', 340, 420);
for (let step = 1; step <= 14; step += 1) {
    await touch('touchMove', 340 - step * 20, 420);
    await sleep(22);
}
await sleep(160);
await touch('touchEnd', 0, 0);
await sleep(900);

// 3. The lyric page running: the clock crosses a line boundary, so the follow tween and the
//    per-character highlight are both in the clip.
await page.evaluate(() => window.__minimalPreview.seek(24.4));
await sleep(3600);

// 4. Tapping a line: the list eases to it and the transport seeks.
const line = await page.evaluate(() => {
    const box = document.querySelectorAll('.min-line')[7].getBoundingClientRect();
    return { x: box.left + 60, y: box.top + box.height / 2 };
});
await touch('touchStart', line.x, line.y);
await sleep(60);
await touch('touchEnd', 0, 0);
await sleep(1600);

// 5. Back to the cover page, then collapse: the page falls away.
await touch('touchStart', 50, 420);
for (let step = 1; step <= 12; step += 1) {
    await touch('touchMove', 50 + step * 24, 420);
    await sleep(20);
}
await touch('touchEnd', 0, 0);
await sleep(900);
await page.click('[data-testid="minimal-collapse"]');
await sleep(700);

await context.close();
await browser.close();

const raw = path.join(OUT, 'video-raw');
const { readdirSync, renameSync } = await import('node:fs');
const file = readdirSync(raw).find(name => name.endsWith('.webm'));
if (file) {
    renameSync(path.join(raw, file), path.join(OUT, 'minimal-transition.webm'));
    console.log('wrote', path.join(OUT, 'minimal-transition.webm'));
} else {
    console.log('no video produced');
}
