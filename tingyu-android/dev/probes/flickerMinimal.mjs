// dev/probes/flickerMinimal.mjs
// Frame-level flicker detector for the minimal stage. Dev-only.
//
// A "flash" is a pair of frames the eye reads as a blink: one frame that is much brighter or much
// darker than both of its neighbours, or one that is nearly a flat colour (the page lost its
// content for a frame). Neither survives a screenshot test — a screenshot of the settled state is
// always correct — so this captures the *stream* instead, through CDP's screencast, and decodes
// every frame with sharp.
//
// Usage:
//   node dev/probes/flickerMinimal.mjs                 # all scenarios
//   node dev/probes/flickerMinimal.mjs swipe enter     # a subset
//   node dev/probes/flickerMinimal.mjs --verbose       # print every frame
import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:4399/minimal-stage-preview.html';
const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const only = argv.filter(arg => !arg.startsWith('--'));
/** Emulation.setCPUThrottlingRate; 6 is roughly a mid-range phone against this desktop. */
const CPU = Number((argv.find(arg => arg.startsWith('--cpu=')) ?? '').split('=')[1] ?? 0) || 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Downscale a frame to something cheap to compare, and describe it in one pass. */
const describe = async buffer => {
    const { data, info } = await sharp(buffer)
        .resize(72, 156, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const pixels = info.width * info.height;
    let sum = 0;
    let sumSq = 0;
    const luma = new Float32Array(pixels);
    for (let index = 0; index < pixels; index += 1) {
        const r = data[index * info.channels];
        const g = data[index * info.channels + 1];
        const b = data[index * info.channels + 2];
        const value = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        luma[index] = value;
        sum += value;
        sumSq += value * value;
    }
    const mean = sum / pixels;
    return { mean, std: Math.sqrt(Math.max(0, sumSq / pixels - mean * mean)), luma, pixels };
};

const diff = (a, b) => {
    let total = 0;
    for (let index = 0; index < a.pixels; index += 1) {
        total += Math.abs(a.luma[index] - b.luma[index]);
    }
    return total / a.pixels;
};

const browser = await chromium.launch();

const session = async ({ query = '', warm = false, cpu = 0 } = {}) => {
    const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (!warm) {
        await page.goto(`${BASE}?${query}`, { waitUntil: 'networkidle' });
        await sleep(900);
    }
    const cdp = await context.newCDPSession(page);
    // A desktop CPU hides every raster underrun. Throttling to something phone-shaped is what makes
    // a compositor that cannot keep up actually show it, instead of just enjoying the headroom.
    if (cpu > 1) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    }
    const frames = [];
    cdp.on('Page.screencastFrame', event => {
        frames.push({ data: event.data, at: event.metadata.timestamp });
        cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    });
    const start = async () => {
        await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    };
    const stop = async () => {
        await cdp.send('Page.stopScreencast').catch(() => {});
    };
    const touch = async (type, x, y) => {
        await cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        });
    };
    return { page, context, cdp, frames, start, stop, touch, errors };
};

/**
 * Read the frame stream the way the eye does: a frame that deviates from *both* neighbours. A
 * one-frame deviation is a blink; a sustained change (a page sliding) is deviating from one side
 * only, and is ignored.
 */
const report = (name, frames, stats) => {
    console.log(`\n=== ${name} === ${frames.length} frames over ${Math.round((frames.at(-1)?.at - frames[0]?.at) * 1000)}ms`);
    const rows = [];
    for (let index = 1; index < stats.length - 1; index += 1) {
        const previous = stats[index - 1];
        const current = stats[index];
        const next = stats[index + 1];
        const inFromPrev = diff(previous, current);
        const outToNext = diff(current, next);
        const neighbourGap = Math.abs(previous.mean - next.mean);
        const spike = Math.abs(current.mean - (previous.mean + next.mean) / 2) - neighbourGap;
        const blank = current.std < 2.2 && (previous.std > 4 || next.std > 4);
        const dt = stats[index].at - stats[index - 1].at;
        if (spike > 14 || blank || inFromPrev > 42) {
            rows.push({ index, at: Math.round((current.at - stats[0].at) * 1000), mean: current.mean.toFixed(1), std: current.std.toFixed(1), spike: spike.toFixed(1), inFromPrev: inFromPrev.toFixed(1), dt: (dt * 1000).toFixed(0) });
        }
    }
    if (VERBOSE) {
        stats.forEach((stat, index) => {
            const previous = stats[index - 1];
            console.log(`  #${String(index).padStart(3)} +${Math.round((stat.at - stats[0].at) * 1000)}ms  luma ${stat.mean.toFixed(1)}  std ${stat.std.toFixed(1)}${previous ? `  Δ ${diff(previous, stat).toFixed(1)}` : ''}`);
        });
    }
    if (!rows.length) {
        console.log('  没有检测到闪烁帧（没有单帧亮度突变，也没有单帧白屏/黑屏）');
        return { name, count: 0 };
    }
    console.log('  可疑帧：');
    for (const row of rows) {
        console.log(`  #${String(row.index).padStart(3)} +${String(row.at).padStart(4)}ms luma ${row.mean} std ${row.std} 单帧偏差 ${row.spike} 与上帧差 ${row.inFromPrev} 间隔 ${row.dt}ms`);
    }
    return { name, count: rows.length };
};

const analyse = async frames => {
    const stats = [];
    for (const frame of frames) {
        const description = await describe(Buffer.from(frame.data, 'base64'));
        stats.push({ ...description, at: frame.at });
    }
    return stats;
};

const dragTo = async (s, fromX, toX, y, { steps = 12, hold = 12 } = {}) => {
    await s.touch('touchStart', fromX, y);
    for (let step = 1; step <= steps; step += 1) {
        await s.touch('touchMove', fromX + (toX - fromX) * (step / steps), y);
        await sleep(hold);
    }
};

const results = [];
const want = name => !only.length || only.includes(name);

// ---------------------------------------------------------------- 1. idle baseline
if (want('idle')) {
    const s = await session({ query: 'page=cover&theme=dark&stationary=1&paused=1' });
    await s.start();
    await sleep(1200);
    await s.stop();
    results.push(report('静置 1.2s（对照：环境层呼吸/漂移）', s.frames, await analyse(s.frames)));
    await s.context.close();
}

// ---------------------------------------------------------------- 2. horizontal swipe
if (want('swipe')) {
    const s = await session({ query: 'page=cover&theme=dark&stationary=1&paused=1' });
    await s.start();
    await sleep(250);
    await dragTo(s, 320, 70, 420);
    await s.touch('touchEnd', 70, 420);
    await sleep(700);
    await s.stop();
    results.push(report('封面 → 歌词 手势滑动', s.frames, await analyse(s.frames)));

    const back = await session({ query: 'page=lyrics&theme=dark&stationary=1&paused=1' });
    await back.start();
    await sleep(250);
    await dragTo(back, 70, 320, 420);
    await back.touch('touchEnd', 320, 420);
    await sleep(700);
    await back.stop();
    results.push(report('歌词 → 封面 手势滑动', back.frames, await analyse(back.frames)));
    await back.context.close();
    await s.context.close();
}

// ---------------------------------------------------------------- 3. heavy lyric set, throttled CPU
if (want('heavy')) {
    const s = await session({ query: 'page=lyrics&theme=dark&stationary=1&paused=1&lines=120', cpu: CPU || 6 });
    await s.start();
    await sleep(300);
    await dragTo(s, 330, 60, 420, { steps: 14, hold: 16 });
    await s.touch('touchEnd', 60, 420);
    await sleep(800);
    await s.stop();
    results.push(report(`长歌词(120 行) + CPU×${CPU || 6} 滑动`, s.frames, await analyse(s.frames)));
    await s.context.close();
}

// ---------------------------------------------------------------- 4. dot tap (programmatic commit)
if (want('dot')) {
    const s = await session({ query: 'page=cover&theme=dark&stationary=1&paused=1' });
    await s.start();
    await sleep(250);
    const dot = await s.page.evaluate(() => {
        const element = document.querySelectorAll('.min-dot')[1];
        const rect = element.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await s.touch('touchStart', dot.x, dot.y);
    await s.touch('touchEnd', dot.x, dot.y);
    await sleep(800);
    await s.stop();
    results.push(report('点圆点切页（自动补齐动画）', s.frames, await analyse(s.frames)));
    await s.context.close();
}

// ---------------------------------------------------------------- 4. cold open (the enter phase)
if (want('enter')) {
    // A fresh document, recorded from its first commit: this is the frame the page mounts on, which
    // is what "打开音乐卡片" looks like. Starting the screencast before the navigation captures the
    // empty document instead — the recorder is attached to the document it began on.
    const s = await session({ query: 'page=cover&theme=dark&stationary=1&paused=1', warm: true });
    await s.page.goto(`${BASE}?page=cover&theme=dark&stationary=1&paused=1`, { waitUntil: 'commit' });
    await s.start();
    await sleep(1400);
    await s.stop();
    results.push(report('冷启动进入（页面首帧 + 入场动画）', s.frames, await analyse(s.frames)));
    await s.context.close();
}

await browser.close();

const bad = results.filter(result => result.count > 0);
console.log(`\n${bad.length === 0 ? 'PASS' : 'FAIL'}  ${results.length - bad.length}/${results.length} 个场景没有闪烁帧`);
if (bad.length) {
    console.log(`  可疑：${bad.map(result => `${result.name} (${result.count})`).join('、')}`);
}
process.exit(0);
