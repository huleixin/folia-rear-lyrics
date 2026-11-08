// test/unit/ui/topGlassBarContract.test.ts
//
// 沉浸式毛玻璃顶栏结构契约门禁（防退化）。
//
// 背景：第一轮 Top Scroll Scrim（内容侧盖片 + 分段模糊）在真机产生两条横向模糊带与水平
// 分界线；第二轮自研 backdrop 管线仍属重复造轮子。当前渲染内核 = 开源库 Haze（Apache-2.0，
// dev.chrisbanes.haze:haze:1.6.10），本测试锁定：
//  1. 所有「固定顶部栏 + 滚动内容」的 Compose 页面必须经公共组件接入；
//  2. 玻璃是**单一连续表面**（一个 drawBackdrop 调用 + saveLayer/DstIn 蒙版），
//     结构上不可能出现分段模糊带；
//  3. 玻璃只画不接事件；头部内容独立成层（始终清晰）；
//  4. 内容全幅滚动（列表真正进入顶栏后方），页面里不得再保留旧的视口裁切结构；
//  5. 上一轮的错误实现不得复活。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const read = (...segments: string[]) =>
    readFileSync(path.join(root, ...segments), 'utf8');

const chrome = (...names: string[]) => read('android', 'app', 'src', 'main', 'java', 'io', 'github', 'huleixin', 'tingyu', 'chrome', ...names);

const glassKt = chrome('TopGlassBar.kt');
const pages = [
    'NativeHomePage.kt',
    'NativeDirectoryPage.kt',
    'NativeSearchPage.kt',
    'MediaDetail.kt',
    'NativeSettingsPage.kt',
    'NativeRearControlPage.kt',
];

describe('沉浸式毛玻璃顶栏结构契约', () => {
    it('公共组件存在且暴露 ContentLayer/Surface 两段式 API', () => {
        expect(glassKt).toContain('internal fun BoxScope.TyTopGlassContentLayer(');
        expect(glassKt).toContain('internal fun BoxScope.TyTopGlassSurface(');
        expect(glassKt).toContain('internal object TyTopGlass');
    });

    it.each(pages)('%s 经公共组件接入（内容层 + 玻璃面 + 清晰头部三层）', (file) => {
        const source = chrome(file);
        expect(source, `${file} 必须经 TyTopGlassContentLayer 接入`).toContain('TyTopGlassContentLayer(');
        expect(source, `${file} 必须绘制 TyTopGlassSurface`).toContain('TyTopGlassSurface(');
        expect(source, `${file} 头部内容必须测量回填玻璃范围`).toContain('glass.reportHeader(');
        // 上一轮的错误实现不得复活。
        expect(source, `${file} 不得再使用旧 Scrim API`).not.toContain('TopScrollScrim');
        expect(source, `${file} 不得私自 Modifier.blur`).not.toMatch(/Modifier\.blur|\.blur\(/);
    });

    it('渲染内核 = Haze 单一管线：source + effect 成对出现，自研捕获/绘制不得复活', () => {
        // 上一轮（自制 backdrop 捕获 + DstIn 蒙版）与第一轮（分段模糊）的痕迹必须清零。
        expect(glassKt, '必须使用 Haze 的采样源').toContain('hazeSource(');
        expect(glassKt, '必须使用 Haze 的玻璃效果').toContain('hazeEffect(');
        expect(glassKt, '必须使用 Haze 的 rememberHazeState').toContain('rememberHazeState(');
        // 结构性防退化：只允许一个 Haze effect 节点（多段模糊 = 上一轮两条横带的根因）。
        const callSites = glassKt.match(/\.hazeEffect\(/g) ?? [];
        expect(callSites.length, '玻璃表面必须只有一个 hazeEffect 调用点').toBe(1);
        expect(glassKt, '不得再自建捕获管线（kyant0 layerBackdrop）').not.toContain('layerBackdrop');
        expect(glassKt, '不得再自建 backdrop 绘制').not.toContain('drawBackdrop');
        expect(glassKt, '不得存在分段模糊循环').not.toContain('BlurSegment');
        // 底部过渡：单面蒙版（主体全强度 + tail 内平滑衰减）。
        expect(glassKt).toContain('topGlassMaskBrush');
        expect(glassKt).toContain('topGlassMaskStops');
    });

    it('玻璃只画不接事件：无 pointerInput / clickable / 滚动状态写入', () => {
        expect(glassKt, '玻璃层不得拦截触摸').not.toContain('pointerInput');
        expect(glassKt, '玻璃层不得有可点击区域').not.toContain('clickable');
        expect(glassKt, '玻璃层不得写滚动状态').not.toContain('scrollToItem');
    });

    it('内容全幅滚动：列表 contentPadding 由测量的玻璃范围驱动（非固定列内裁切）', () => {
        for (const file of pages) {
            const source = chrome(file);
            expect(source, `${file} 列表必须消费 glass.contentTop`).toContain('glass.contentTop');
        }
    });

    it('静止无模糊：内容起点在玻璃衰减带之外（首个内容不被顶栏玻璃覆盖）', () => {
        // contentTop = headerBottom + TailDp —— 打开页面时首个内容（猜你喜欢卡片、
        // 资料库首行等）必须完全落在玻璃之外，只有滚动时才进入衰减带。
        expect(glassKt).toContain('val contentTop: Dp get() = (headerBottomDp + TyTopGlass.TailDp).dp');
    });

    it('回归防护（1.3.185）：头部测量层不得被 fillMaxSize 撑成整页', () => {
        // 头部层若用 fillMaxSize，reportHeader 会把整页高度当顶栏底边 →
        // 列表被推出屏幕、玻璃撑成整页（真机两条症状）。头部层必须宽度撑满、高度包裹。
        for (const file of pages) {
            const source = chrome(file);
            expect(source, `${file} 头部层不得使用 fillMaxSize().padding(top=...)`).not.toContain('fillMaxSize().padding(top=');
        }
        // 玻璃面尺寸完全由组件内部决定（签名不允许调用方传 modifier 撑成整页）。
        expect(glassKt).not.toContain('internal fun BoxScope.TyTopGlassSurface(\n    state: TyTopGlassState,\n    colors: List<Color>,\n    modifier: Modifier = Modifier,');
        // 测量状态自带页面高度上限保护（兜底防御）。
        expect(glassKt).toContain('pageHeightPx');
        expect(glassKt).toContain('* 0.6f');
    });

    it('玻璃底色来自页面背景色板单一来源（跟随深浅色与页面类型）', () => {
        expect(chrome('NativePageView.kt')).toContain('internal fun NativePage.surfaceColors()');
        expect(glassKt).toContain('colors.first()');
    });

    it('Haze 依赖精确锁定 1.6.10（不升级 Compose/Kotlin/AGP 的选版依据）', () => {
        const buildGradle = read('android', 'app', 'build.gradle');
        expect(buildGradle).toContain("implementation 'dev.chrisbanes.haze:haze:1.6.10'");
        // 性能回滚开关：模糊半径归零 → 同形状半透明底色玻璃（非横带）。
        expect(glassKt).toContain('BuildConfig.TOP_GLASS_BLUR');
        expect(buildGradle).toContain("buildConfigField 'boolean', 'TOP_GLASS_BLUR'");
        expect(buildGradle).toContain('TINGYU_TOP_GLASS_BLUR');
        // 底部 Liquid Glass 内核（kyant0 backdrop）必须仍然存在，不被误删。
        expect(buildGradle).toContain("implementation 'io.github.kyant0:backdrop:1.0.6'");
    });

    it('集合详情的封面氛围层由内容层统一绘制（页面级原件已移除，避免双绘）', () => {
        const media = chrome('MediaDetail.kt');
        expect(media).toContain('ambientImage=cover.image');
        expect(media, 'MediaDetail 不得再绘制页面级氛围原件').not.toContain('NativePlaylistBackdrop(');
        // 氛围副本在公共内容层里绘制（模糊采样必须含封面氛围色）。
        expect(glassKt).toContain('NativePlaylistBackdrop(ambientImage, ambientViewportHeight)');
    });

    it('上一轮内容侧渐隐的 WebView 能力已彻底移除', () => {
        const frame = read('src', 'library', 'suites', 'mobile', 'MobileScrollFrame.tsx');
        expect(frame).not.toContain('ty-scrim');
        expect(frame).not.toContain('topScrimProgress');
        expect(() => read('src', 'styles', 'topScrollScrim.css')).toThrow();
        expect(() => read('src', 'components', 'shared', 'topScrollScrim.ts')).toThrow();
    });

    it('底部 Liquid Glass（ChromeMaterial）不被顶栏玻璃触碰', () => {
        expect(chrome('ChromeMaterial.kt')).not.toContain('TyTopGlass');
    });

    it('按实际布局豁免的页面保持豁免（不机械添加玻璃）', () => {
        // 设置文档页：区域级独立滚动窗口、无固定顶栏（DOM 是排版真值源）。
        expect(chrome('NativeSettingsDocumentView.kt')).not.toContain('TyTopGlass');
        // MobileSheet 的 header 在滚动容器内部（随内容滚动）→ 无固定顶部，豁免。
        expect(read('src', 'library', 'suites', 'mobile', 'MobileSheet.tsx')).not.toContain('TyTopGlass');
    });
});
