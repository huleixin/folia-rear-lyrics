// dev/probes/verifyMinimal.mjs
// Browser-level behaviour checks for the minimal stage. Dev-only.
//
// These run against the real component in Chromium at a phone viewport with touch enabled, so a
// swipe is a trusted CDP touch sequence rather than a synthetic event — a page that only "works"
// with dispatched events would pass the latter and fail on a phone.
//
// What this can prove: layout against the insets the page actually consumes, follow-the-finger
// paging, spring-back, the vertical lyric scroll staying vertical, tap-to-seek, the tweened lyric
// follow, the stage detour, and the enter/exit phases.
// What it cannot: Media3 playback, the rear screen, Compose layering, real frame pacing. Those are
// listed as unverified in the audit document — this file must not be read as device evidence.
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:4399/minimal-stage-preview.html';
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await chromium.launch();

const open = async ({ query = '', still = false } = {}) => {
    const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
    });
    if (still) {
        // The app's own switch, not the OS one: this is what the settings screen writes.
        await context.addInitScript(() => localStorage.setItem('reduce_motion_monetBackground', 'true'));
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${BASE}?${query}`, { waitUntil: 'networkidle' });
    await sleep(700);
    const cdp = await context.newCDPSession(page);
    const state = () => page.evaluate(() => window.__minimalPreview.state());
    const touch = async (type, x, y) => {
        await cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        });
    };
    return { page, context, cdp, state, touch, errors };
};

const dragTo = async (session, fromX, toX, y, { steps = 10, hold = 14 } = {}) => {
    await session.touch('touchStart', fromX, y);
    for (let step = 1; step <= steps; step += 1) {
        await session.touch('touchMove', fromX + (toX - fromX) * (step / steps), y);
        await sleep(hold);
    }
};

// ---------------------------------------------------------------- layout
{
    const session = await open({ query: 'page=cover&theme=dark&stationary=1' });
    const s = await session.state();
    const topBottom = s.boxes.top.y + s.boxes.top.h;
    check('页面顶部避开状态栏', topBottom >= s.insetTop - 0.5,
        `顶栏底 ${topBottom.toFixed(1)} / 安全区 ${s.insetTop}`);
    const dotsBottom = s.boxes.dots.y + s.boxes.dots.h;
    check('分页圆点避开手势导航区', dotsBottom <= s.viewport.h - s.insetBottom + 0.5,
        `圆点底 ${dotsBottom.toFixed(1)} / 可用底 ${s.viewport.h - s.insetBottom}`);
    check('控制栏在圆点上方且不重叠', s.boxes.transport.y + s.boxes.transport.h <= s.boxes.dots.y + 0.5,
        `transport底 ${(s.boxes.transport.y + s.boxes.transport.h).toFixed(1)} dots顶 ${s.boxes.dots.y.toFixed(1)}`);
    if (s.boxes.cover) {
        const ratio = s.boxes.cover.w / s.boxes.cover.h;
        check('封面保持 1:1', Math.abs(ratio - 1) < 0.01, `${s.boxes.cover.w.toFixed(1)}×${s.boxes.cover.h.toFixed(1)}`);
        check('封面不越界', s.boxes.cover.y >= topBottom && s.boxes.cover.y + s.boxes.cover.h <= s.boxes.transport.y,
            `封面 ${s.boxes.cover.y.toFixed(0)}..${(s.boxes.cover.y + s.boxes.cover.h).toFixed(0)}`);
    }
    check('封面页无脚本错误', session.errors.length === 0, session.errors.join(' | '));
    await session.context.close();
}

// Both pages must put the transport in the same place.
{
    const cover = await open({ query: 'page=cover&theme=dark&stationary=1' });
    const lyrics = await open({ query: 'page=lyrics&theme=dark&stationary=1' });
    const a = await cover.state();
    const b = await lyrics.state();
    check('两页控制栏位置一致', Math.abs(a.boxes.transport.y - b.boxes.transport.y) < 1,
        `${a.boxes.transport.y.toFixed(1)} vs ${b.boxes.transport.y.toFixed(1)}`);
    check('两页圆点位置一致', Math.abs(a.boxes.dots.y - b.boxes.dots.y) < 1,
        `${a.boxes.dots.y.toFixed(1)} vs ${b.boxes.dots.y.toFixed(1)}`);
    await cover.context.close();
    await lyrics.context.close();
}

// ---------------------------------------------------------------- paging
{
    const session = await open({ query: 'page=cover&theme=dark&stationary=1' });
    await dragTo(session, 330, 60, 400);
    const mid = await session.state();
    check('拖动过程页面跟随手指', mid.pos > 0.5 && mid.pos < 1.05, `pos=${mid.pos.toFixed(2)}`);
    // Both secondary animations are driven by the same --min-pos the strip uses, so they can be read
    // mid-gesture while the finger is still down.
    const during = await session.page.evaluate(() => {
        const stage = document.querySelector('.min-cover__stage');
        const matrix = /matrix\(([^)]+)\)/.exec(getComputedStyle(stage).transform);
        return {
            parallaxX: matrix ? Number(matrix[1].split(',')[4]) : 0,
            dots: [...document.querySelectorAll('.min-dot')].map(dot => Number(getComputedStyle(dot).opacity)),
        };
    });
    check('滑动时封面产生轻微视差', during.parallaxX > 4 && during.parallaxX < 60, `translateX=${during.parallaxX.toFixed(1)}px`);
    check('页码圆点跟随滑动进度', during.dots.every(value => value > 0.4 && value < 0.95),
        `opacity=${JSON.stringify(during.dots.map(value => Number(value.toFixed(2))))}`);
    await session.touch('touchEnd', 0, 0);
    await sleep(520);
    const done = await session.state();
    check('松手后完成翻页', done.page === 'lyrics' && Math.abs(done.pos - 1) < 0.03, `page=${done.page} pos=${done.pos.toFixed(2)}`);

    await dragTo(session, 60, 330, 400);
    await session.touch('touchEnd', 0, 0);
    await sleep(520);
    const back = await session.state();
    check('左滑回到封面页', back.page === 'cover' && Math.abs(back.pos) < 0.03, `page=${back.page}`);

    // Short, slow drag: must spring back rather than commit.
    await dragTo(session, 330, 250, 400, { steps: 8, hold: 26 });
    await session.touch('touchEnd', 0, 0);
    await sleep(460);
    const spring = await session.state();
    check('距离不足时回弹', spring.page === 'cover' && Math.abs(spring.pos) < 0.03, `pos=${spring.pos.toFixed(2)}`);
    await session.context.close();
}

// ---------------------------------------------------------------- lyric tap + scroll
{
    const session = await open({ query: 'page=lyrics&theme=dark&stationary=1' });
    // Tap first, on a list that is not moving: a flick still carrying momentum swallows the next
    // touch as "stop scrolling", which would make this check measure the wrong thing.
    const target = await session.page.evaluate(() => {
        const scroller = document.querySelector('.min-lyrics__scroll').getBoundingClientRect();
        const line = [...document.querySelectorAll('.min-line')].find(node => {
            const box = node.getBoundingClientRect();
            return box.top > scroller.top + 60 && box.bottom < scroller.bottom - 60;
        });
        const box = line.getBoundingClientRect();
        const x = box.left + 40;
        const y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
            x,
            y,
            text: line.textContent.slice(0, 6),
            hit: hit ? `${hit.tagName}.${hit.className}` : 'none',
            isButton: !!hit?.closest('.min-line__text'),
        };
    });
    await session.touch('touchStart', target.x, target.y);
    await sleep(40);
    await session.touch('touchEnd', 0, 0);
    await sleep(260);
    const tapped = await session.state();
    check('点击歌词执行 Seek', tapped.seeks.length > 0 && target.isButton,
        `line="${target.text}" hit=${target.hit} seeks=${JSON.stringify(tapped.seeks)}`);
    // Now the vertical gesture, on the same page: it must scroll the list and leave the page alone.
    const before = await session.state();
    await session.touch('touchStart', 200, 520);
    for (let step = 1; step <= 10; step += 1) {
        await session.touch('touchMove', 200, 520 - step * 20);
        await sleep(12);
    }
    await session.touch('touchEnd', 0, 0);
    await sleep(900);
    const after = await session.state();
    check('竖直滑动只滚歌词，不翻页', after.page === 'lyrics' && after.boxes.scrollTop > before.boxes.scrollTop,
        `page=${after.page} scrollTop ${before.boxes.scrollTop.toFixed(0)}→${after.boxes.scrollTop.toFixed(0)}`);
    await session.context.close();
}

// ---------------------------------------------------------------- lyric follow tween
{
    const session = await open({ query: 'page=lyrics&theme=dark&stationary=1' });
    const start = await session.state();
    await session.page.evaluate(() => window.__minimalPreview.seek(9 * 5 + 1));
    await sleep(70);
    const early = await session.state();
    await sleep(700);
    const settled = await session.state();
    const moved = settled.boxes.scrollTop - start.boxes.scrollTop;
    check('换句时平滑滚动而非瞬跳',
        moved > 40 && early.boxes.scrollTop > start.boxes.scrollTop && early.boxes.scrollTop < settled.boxes.scrollTop,
        `scrollTop ${start.boxes.scrollTop.toFixed(0)} → ${early.boxes.scrollTop.toFixed(0)} → ${settled.boxes.scrollTop.toFixed(0)}`);
    await session.context.close();
}

// ---------------------------------------------------------------- stage detour
{
    const session = await open({ query: 'page=lyrics&theme=dark&stationary=1' });
    await session.page.click('[data-testid="minimal-open-stage"]');
    await sleep(200);
    const detour = await session.state();
    check('进入原歌词舞台是顺访', detour.detour === true, `detour=${detour.detour}`);
    await session.page.evaluate(() => window.__minimalPreview.closeStage());
    await sleep(200);
    const returned = await session.state();
    check('退出舞台回到原极简页', returned.detour === false && returned.page === 'lyrics', `page=${returned.page}`);
    await session.context.close();
}

// ---------------------------------------------------------------- ambience gating
{
    const paused = await open({ query: 'page=cover&theme=dark&stationary=1&paused=1' });
    const playState = await paused.page.evaluate(() =>
        getComputedStyle(document.querySelector('.min-amb__blob--a')).animationPlayState);
    check('暂停时背景动画停止', playState === 'paused', `animation-play-state=${playState}`);
    const meterPaused = await paused.page.evaluate(() =>
        getComputedStyle(document.querySelector('.min-wave i')).animationName);
    check('暂停时播律动指示停止', meterPaused === 'none', `animation-name=${meterPaused}`);
    await paused.context.close();

    const playing = await open({ query: 'page=cover&theme=dark&stationary=1' });
    const running = await playing.page.evaluate(() =>
        getComputedStyle(document.querySelector('.min-amb__blob--a')).animationPlayState);
    check('播放时背景动画运行', running === 'running', `animation-play-state=${running}`);
    const meterRunning = await playing.page.evaluate(() =>
        getComputedStyle(document.querySelector('.min-wave i')).animationName);
    check('播放时律动指示运行', meterRunning !== 'none', `animation-name=${meterRunning}`);
    await playing.context.close();
}

// ---------------------------------------------------------------- enter / exit
{
    const session = await open({ query: 'page=cover&theme=dark&stationary=1' });
    const declared = await session.page.evaluate(() => {
        const rules = [...document.styleSheets].flatMap(list => {
            try {
                return [...list.cssRules];
            } catch {
                return [];
            }
        });
        return rules.some(rule => rule.cssText && rule.cssText.includes('min-rise'));
    });
    check('进入播放页声明了上滑展开动画', declared, `keyframes=${declared}`);

    await session.page.click('[data-testid="minimal-collapse"]');
    await sleep(90);
    const closing = await session.state();
    check('收起时先播放退场动画', closing.phase === 'exit' && closing.backs.length === 0,
        `phase=${closing.phase} backs=${closing.backs.length}`);
    await sleep(320);
    const closed = await session.state();
    check('退场结束后才真正返回', closed.backs.length === 1, `backs=${closed.backs.length}`);

    // Two more taps while the page is already gone must not queue navigations.
    await session.page.click('[data-testid="minimal-collapse"]', { force: true }).catch(() => { });
    await sleep(120);
    await session.page.click('[data-testid="minimal-collapse"]', { force: true }).catch(() => { });
    const repeat = await session.state();
    check('收起后返回只发生一次', repeat.backs.length === 1, `backs=${repeat.backs.length}`);
    await session.context.close();
}

// ---------------------------------------------------------------- reduced motion
{
    const session = await open({ query: 'page=cover&theme=dark&stationary=1', still: true });
    const s = await session.state();
    check('减少动态效果时不做展开动画', s.phase === 'idle', `phase=${s.phase}`);
    await session.page.click('[data-testid="minimal-collapse"]');
    await sleep(80);
    const closed = await session.state();
    check('减少动态效果时立即收起', closed.backs.length === 1, `backs=${closed.backs.length}`);
    await session.context.close();
}

await browser.close();

const failed = results.filter(entry => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
    console.log('failed:');
    failed.forEach(entry => console.log(`  · ${entry.name}`));
    process.exitCode = 1;
}
