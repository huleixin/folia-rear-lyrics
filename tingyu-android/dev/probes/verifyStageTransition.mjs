// dev/probes/verifyStageTransition.mjs
// The paired fade between the minimal page and the classic stage. Dev-only.
//
// What each check pins down:
//   · the direction. A rise is a translate on `.min`; a dissolve is a scale with no translation.
//     Reading the computed matrix mid-transition is the difference between "it felt right" and proof.
//   · the pair. While the fade runs, both surfaces must be mounted — the outgoing one so the incoming
//     one dissolves over something, the incoming one so it is painted before the outgoing lifts.
//   · the return target. A stage opened as a detour returns to the minimal page; a stage that is the
//     listener's default player collapses to the browsing page. The harness sees the branch taken.
//   · double taps. Two mounts of either surface is the failure this must not have.
//   · the safe area of the stage header, and that the collapse control is its own 44dp target.
//
// Cannot be proven here: the native Compose control bar (no bridge in a browser), Media3, real frame
// pacing. Those are listed as unverified in the audit.
import { chromium } from 'playwright';

const BASE = process.env.PREVIEW_BASE ?? 'http://127.0.0.1:4399/player-transition-preview.html';
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await chromium.launch();

const session = async (query = 'page=lyrics') => {
    const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${BASE}?${query}`, { waitUntil: 'networkidle' });
    await sleep(800);
    const state = () => page.evaluate(() => window.__stagePreview.state());
    const layers = () => page.evaluate(() => {
        const shell = document.querySelector('.min');
        const stage = document.querySelector('[data-testid=player-visual-surface]');
        const style = stage ? getComputedStyle(stage) : null;
        const matrix = /matrix\(([^)]+)\)/.exec(style?.transform ?? '');
        const values = matrix ? matrix[1].split(',').map(Number) : null;
        return {
            counts: {
                minimal: document.querySelectorAll('.min').length,
                stage: document.querySelectorAll('[data-testid="mobile-stage-chrome"]').length,
                stageSurface: document.querySelectorAll('[data-testid="stage-surface"]').length,
            },
            opacity: style ? Number(style.opacity) : null,
            covered: !!shell?.hasAttribute('data-covered'),
            // e and f are the translate components; a dissolve is a scale only.
            translateX: values ? values[4] : null,
            translateY: values ? values[5] : null,
            scaleX: values ? values[0] : null,
        };
    });
    return { page, context, state, layers, errors };
};

// ---------------------------------------------------------------- into the stage
{
    const s = await session();
    const before = await s.state();
    check('初始在极简歌词页', before.page === 'lyrics' && before.pos === 1 && before.counts.stage === 0,
        `page=${before.page} pos=${before.pos}`);

    await s.page.evaluate(() => window.__stagePreview.openStage());
    // The page waits two frames for the stage underneath to have painted before it starts to lift,
    // so sample once the fade is properly under way rather than on its first frame.
    await sleep(120);
    const mid = await s.layers();
    check('进入时两层同时挂载', mid.counts.minimal === 1 && mid.counts.stage === 1,
        `minimal=${mid.counts.minimal} stage=${mid.counts.stage}`);
    check('舞台从下方上移进入', (mid.translateY ?? 0) > 0 && Math.abs(mid.translateX ?? 0) < 2,
        `translate ${mid.translateX?.toFixed(1)},${mid.translateY?.toFixed(1)}`);
    check('移动时舞台保持不透明', mid.opacity === 1, `opacity=${mid.opacity?.toFixed(3)}`);

    await sleep(420);
    const after = await s.layers();
    const settled = await s.state();
    check('进入完成保留被遮挡的极简页', after.counts.minimal === 1 && after.counts.stage === 1 && after.covered,
        `minimal=${after.counts.minimal} stage=${after.counts.stage}`);
    check('进入完成无脚本错误', s.errors.length === 0, s.errors.join(' | '));

    // ---------------------------------------------------------------- back to the minimal page
    await s.page.evaluate(() => window.__stagePreview.closeStage());
    await sleep(60);
    const backMid = await s.layers();
    check('返回时两层同时挂载', backMid.counts.minimal === 1 && backMid.counts.stage === 1,
        `minimal=${backMid.counts.minimal} stage=${backMid.counts.stage}`);
    check('返回时舞台向下收回', (backMid.translateY ?? 0) > 0,
        `translateY=${backMid.translateY?.toFixed(1)}`);
    check('向下收回时不透明', backMid.opacity === 1, `opacity=${backMid.opacity?.toFixed(3)}`);
    const backPhase = await s.state();
    check('返回使用淡化相位而不是上滑展开', backPhase.phase === 'idle', `phase=${backPhase.phase}`);

    await sleep(420);
    const backAfter = await s.layers();
    const backState = await s.state();
    check('返回完成后只剩极简页', backAfter.counts.minimal === 1 && backAfter.counts.stage === 0,
        `minimal=${backAfter.counts.minimal} stage=${backAfter.counts.stage}`);
    check('回到进入前的歌词页', backState.page === 'lyrics' && Math.abs(backState.pos - 1) < 0.02,
        `page=${backState.page} pos=${backState.pos}`);
    check('返回完成无脚本错误', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();
}

// ---------------------------------------------------------------- double taps
{
    const s = await session();
    await s.page.evaluate(() => {
        window.__stagePreview.openStage();
        window.__stagePreview.openStage();
    });
    await sleep(60);
    const inMid = await s.layers();
    await s.page.evaluate(() => {
        window.__stagePreview.closeStage();
        window.__stagePreview.closeStage();
    });
    await sleep(60);
    const outMid = await s.layers();
    check('快速连点不会挂载两层', inMid.counts.minimal <= 1 && inMid.counts.stage <= 1
        && outMid.counts.minimal <= 1 && outMid.counts.stage <= 1,
        `in ${inMid.counts.minimal}/${inMid.counts.stage}, out ${outMid.counts.minimal}/${outMid.counts.stage}`);
    await sleep(420);
    const end = await s.state();
    check('连点后停在正确页面', end.page === 'lyrics' && end.counts.stage === 0 && end.stageTransition === 'idle',
        `page=${end.page} transition=${end.stageTransition}`);
    check('连点无脚本错误', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();
}

// ---------------------------------------------------------------- the two back targets
{
    const s = await session();
    await s.page.evaluate(() => window.__stagePreview.openStage());
    await sleep(420);
    await s.page.evaluate(() => window.__stagePreview.back());
    await sleep(80);
    const detourMid = await s.state();
    await sleep(420);
    const detour = await s.state();
    check('顺访舞台的返回走的是回极简页分支', detourMid.backs[0] === 'detour', `back=${detourMid.backs[0]}`);
    check('顺访舞台的返回回到极简歌词页', detour.page === 'lyrics' && detour.counts.stage === 0 && detour.counts.minimal === 1,
        `page=${detour.page} stage=${detour.counts.stage}`);

    await sleep(420);
    await s.page.evaluate(() => window.__stagePreview.setMode('stage'));
    await sleep(420);
    const defaultStage = await s.state();
    check('默认舞台模式下舞台在屏', defaultStage.mode === 'stage' && defaultStage.counts.stage === 1,
        `mode=${defaultStage.mode}`);
    await s.page.evaluate(() => window.__stagePreview.back());
    await sleep(80);
    const left = await s.state();
    check('默认舞台的返回是收起播放器', left.backs[1] === 'leave', `back=${left.backs[1]}`);
    await s.context.close();
}

// ---------------------------------------------------------------- the queue entry
{
    const s = await session();
    // The transport's fifth slot is the queue, wired to the same panel the stage's queue button
    // opens — not a second queue UI.
    await s.page.evaluate(() => document.querySelector('[data-testid="minimal-queue"]').click());
    await sleep(200);
    const panel = await s.state();
    check('队列入口打开既有队列面板', panel.panel.open === true && panel.panel.tab === 'queue',
        `open=${panel.panel.open} tab=${panel.panel.tab}`);
    check('队列入口无脚本错误', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();
}

// ---------------------------------------------------------------- stage header
{
    const s = await session();
    await s.page.evaluate(() => window.__stagePreview.openStage());
    await sleep(460);
    const header = await s.page.evaluate(() => {
        const collapse = document.querySelector('[data-testid="stage-collapse"]');
        const art = document.querySelector('.mps-art');
        const headerNode = document.querySelector('.mps-header');
        const song = document.querySelector('.mps-song');
        if (!collapse || !art || !headerNode) return null;
        const box = collapse.getBoundingClientRect();
        const artBox = art.getBoundingClientRect();
        const headBox = headerNode.getBoundingClientRect();
        return {
            width: box.width, height: box.height,
            left: box.left, top: box.top,
            overlapsArt: !(box.right <= artBox.left || box.left >= artBox.right),
            headerTop: headBox.top,
            insetTop: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--folia-main-inset-top')) || 0,
            hasTitles: !!song && (song.textContent || '').length > 0,
            artIsButton: art.closest('button') !== null,
        };
    });
    check('舞台收起箭头独立存在', !!header, header ? '' : '未找到');
    if (header) {
        check('箭头触摸区约 44dp', header.width >= 42 && header.height >= 42, `${header.width.toFixed(0)}×${header.height.toFixed(0)}`);
        check('箭头不压在封面上', !header.overlapsArt);
        check('封面不再是返回按钮', !header.artIsButton);
        check('标题与歌手仍在', header.hasTitles);
        check('顶栏避开状态栏', header.headerTop >= header.insetTop - 0.5,
            `top=${header.headerTop.toFixed(0)} / 安全区=${header.insetTop}`);
    }
    check('舞台页无脚本错误', s.errors.length === 0, s.errors.join(' | '));
    await s.context.close();
}

await browser.close();
const bad = results.filter(result => !result.ok);
console.log(`\n${bad.length === 0 ? 'PASS' : 'FAIL'}  ${results.length - bad.length}/${results.length}`);
process.exit(bad.length ? 1 : 0);
