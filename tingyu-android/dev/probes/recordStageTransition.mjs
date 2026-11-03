// dev/probes/recordStageTransition.mjs
// Records the paired fade both ways, plus stills of the two surfaces. Dev-only.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:4399/player-transition-preview.html';
const OUT = process.env.OUT_DIR ?? '../../../shots/stage-transition';
mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: `${OUT}/raw`, size: { width: 393, height: 852 } },
});
const page = await context.newPage();
await page.goto(`${BASE}?page=lyrics`, { waitUntil: 'networkidle' });
await sleep(1200);
await page.screenshot({ path: `${OUT}/minimal-lyrics.png` });

// in
await page.evaluate(() => window.__stagePreview.openStage());
await sleep(140);
await page.screenshot({ path: `${OUT}/fade-to-stage-mid.png` });
await sleep(500);
await page.screenshot({ path: `${OUT}/stage.png` });

// out
await page.evaluate(() => window.__stagePreview.closeStage());
await sleep(140);
await page.screenshot({ path: `${OUT}/fade-to-minimal-mid.png` });
await sleep(500);
await page.screenshot({ path: `${OUT}/minimal-lyrics-returned.png` });

// a second, slower pass for the recording
await page.evaluate(() => window.__stagePreview.openStage());
await sleep(900);
await page.evaluate(() => window.__stagePreview.closeStage());
await sleep(900);
await page.evaluate(() => window.__stagePreview.openStage());
await sleep(900);
await page.evaluate(() => window.__stagePreview.closeStage());
await sleep(900);

await context.close();
const closed = await new Promise(resolve => setTimeout(resolve, 400)).then(() => null);
void closed;
console.log(`saved stills to ${OUT}; the raw video is in ${OUT}/raw`);
await browser.close();
process.exit(0);
