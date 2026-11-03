// dev/probes/shootMinimal.mjs
// Screenshots the minimal stage at real phone viewports. Dev-only.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:4399/minimal-stage-preview.html';
const OUT = process.env.OUT_DIR ?? '../shots';
mkdirSync(OUT, { recursive: true });

const CASES = [
    { name: 'cover-dark', q: 'page=cover&theme=dark', w: 393, h: 852 },
    { name: 'lyrics-dark', q: 'page=lyrics&theme=dark', w: 393, h: 852 },
    { name: 'cover-light', q: 'page=cover&theme=light', w: 393, h: 852 },
    { name: 'lyrics-light', q: 'page=lyrics&theme=light', w: 393, h: 852 },
    { name: 'cover-narrow', q: 'page=cover&theme=dark', w: 360, h: 780 },
    { name: 'lyrics-long-title', q: 'page=lyrics&theme=dark&song=long&stationary=1', w: 393, h: 852 },
    { name: 'cover-long-title', q: 'page=cover&theme=dark&song=long&stationary=1', w: 393, h: 852 },
    { name: 'lyrics-empty', q: 'page=lyrics&theme=dark&song=nolyrics&stationary=1', w: 393, h: 852 },
    { name: 'cover-no-cover', q: 'page=cover&theme=dark&song=nocover&stationary=1', w: 393, h: 852 },
    { name: 'cover-paused', q: 'page=cover&theme=dark&paused=1', w: 393, h: 852 },
];

const browser = await chromium.launch();
for (const item of CASES) {
    const context = await browser.newContext({
        viewport: { width: item.w, height: item.h },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        colorScheme: 'dark',
    });
    const page = await context.newPage();
    page.on('pageerror', error => console.log(`[${item.name}] pageerror:`, error.message));
    page.on('console', message => {
        if (message.type() === 'error') console.log(`[${item.name}] console:`, message.text());
    });
    await page.goto(`${BASE}?${item.q}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/${item.name}.png` });
    await context.close();
    console.log('shot', item.name);
}
await browser.close();
