// dev/probes/swipeCost.mjs
// What one horizontal swipe actually costs on the main thread. Dev-only.
//
// The pager publishes its position as a CSS custom property on the shell (`--min-pos`), and five
// rules read it back: the strip transform, the sleeve parallax, two opacity derives and the two
// page dots. That is convenient, but an unregistered custom property is an opaque token stream: any
// change to it invalidates style for every element that inherits it — here, the whole page,
// including several thousand lyric character spans. This probe measures that, with Chromium's own
// counters rather than an estimate.
//
// Usage: node dev/probes/swipeCost.mjs
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:4399/minimal-stage-preview.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await chromium.launch();

const measure = async (query, drag) => {
    const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}?${query}`, { waitUntil: 'networkidle' });
    await sleep(900);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => {
        const { metrics } = await cdp.send('Performance.getMetrics');
        return Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));
    };
    const touch = async (type, x, y) => {
        await cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        });
    };
    const before = await read();
    if (drag) {
        await touch('touchStart', 320, 420);
        for (let step = 1; step <= 12; step += 1) {
            await touch('touchMove', 320 - (250 * step) / 12, 420);
            await sleep(14);
        }
        await touch('touchEnd', 70, 420);
        await sleep(500);
    } else {
        await sleep(260);
    }
    const after = await read();
    await context.close();
    const delta = key => +(after[key] - before[key]).toFixed(3);
    return {
        styleRecalc: delta('RecalcStyleCount'),
        styleMs: +(delta('RecalcStyleDuration') * 1000).toFixed(1),
        layout: delta('LayoutCount'),
        layoutMs: +(delta('LayoutDuration') * 1000).toFixed(1),
        taskMs: +(delta('TaskDuration') * 1000).toFixed(1),
        paint: delta('LayoutObjects'),
    };
};

const rows = [];
for (const [name, query] of [
    ['封面页（短 DOM）', 'page=cover&theme=dark&stationary=1&paused=1'],
    ['歌词页（长 DOM）', 'page=lyrics&theme=dark&stationary=1&paused=1'],
]) {
    const idle = await measure(query, false);
    const drag = await measure(query, true);
    rows.push({ name, idle, drag });
    console.log(`\n=== ${name} ===`);
    console.log(`  静置 260ms     样式重算 ${idle.styleRecalc} 次 / ${idle.styleMs}ms，布局 ${idle.layout} 次 / ${idle.layoutMs}ms，主线程 ${idle.taskMs}ms`);
    console.log(`  一次 12 步滑动  样式重算 ${drag.styleRecalc} 次 / ${drag.styleMs}ms，布局 ${drag.layout} 次 / ${drag.layoutMs}ms，主线程 ${drag.taskMs}ms`);
    const spans = await (async () => 0)();
    console.log(`  净增（滑动 - 静置）：样式重算 ${(drag.styleRecalc - idle.styleRecalc)} 次，${(drag.styleMs - idle.styleMs).toFixed(1)}ms；布局 ${(drag.layout - idle.layout)} 次，${(drag.layoutMs - idle.layoutMs).toFixed(1)}ms`);
}

// ---------------------------------------------------------------- palette fade
// Opening the page (and every track change) crossfades the five palette variables over 700ms. Where
// that transition lives decides what it costs: on the shell the variables are inherited by the whole
// page, so each animated frame re-resolved every element in it; on the ambience it re-resolves eight.
// The shell version is reconstructed here by injecting the transition the old stylesheet had, so the
// two numbers come from the same build and the same DOM size.
const paletteCost = async (target, label) => {
    const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}?page=lyrics&theme=dark&stationary=1&paused=1&lines=120`, { waitUntil: 'networkidle' });
    await sleep(1200);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => {
        const { metrics } = await cdp.send('Performance.getMetrics');
        return Object.fromEntries(metrics.map(metric => [metric.name, metric.value]));
    };
    if (target === 'shell') {
        // The transition the shell used to declare.
        await page.addStyleTag({
            content: `.min { transition: --min-base 700ms ease, --min-field-1 700ms ease, --min-field-2 700ms ease, --min-bloom 700ms ease, --min-accent 700ms ease !important; }`,
        });
        await sleep(100);
    }
    const before = await read();
    await page.evaluate(where => {
        const element = document.querySelector(where);
        const palette = {
            '--min-base': '#20304a',
            '--min-field-1': '#2b3d5c',
            '--min-field-2': '#1d2b44',
            '--min-bloom': '#c07a3a',
            '--min-accent': '#8fd8ff',
        };
        for (const [name, value] of Object.entries(palette)) {
            element.style.setProperty(name, value);
        }
    }, target === 'shell' ? '.min' : '.min-amb');
    await sleep(820);
    const after = await read();
    await context.close();
    const style = +((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000).toFixed(1);
    const task = +((after.TaskDuration - before.TaskDuration) * 1000).toFixed(1);
    console.log(`  换一次调色板（700ms）× ${label}：样式重算 ${after.RecalcStyleCount - before.RecalcStyleCount} 次 / ${style}ms，主线程 ${task}ms`);
    return { style, task };
};

console.log('\n=== 换色（换歌 / 打开页面时封面取色落定）===');
const shellPalette = await paletteCost('shell', '变量放在外壳（旧）');
const ambPalette = await paletteCost('amb', '变量放在环境层（新）');
console.log(`  降低：样式重算 ${shellPalette.style}ms → ${ambPalette.style}ms（${(shellPalette.style / Math.max(0.1, ambPalette.style)).toFixed(1)}×），主线程 ${shellPalette.task}ms → ${ambPalette.task}ms`);

const count = await (async () => {    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.goto(`${BASE}?page=lyrics&theme=dark&stationary=1&paused=1`, { waitUntil: 'networkidle' });
    const value = await page.evaluate(() => ({
        spans: document.querySelectorAll('.min-line [data-ch]').length,
        nodes: document.querySelectorAll('.min *').length,
    }));
    await context.close();
    return value;
})();
console.log(`\n歌词页 DOM：${count.nodes} 个元素，其中 ${count.spans} 个逐字 span（每一次 --min-pos 变化都要为它们重算样式）`);

await browser.close();
process.exit(0);
