// test/unit/ui/topGlassBarContract.test.ts
//
// 沉浸式毛玻璃顶栏结构契约门禁（防退化）。
//
// 背景：第一轮 Top Scroll Scrim（内容侧盖片 + 分段模糊）在真机上产生两条横向模糊带
// 与水平分界线，已彻底删除。本轮玻璃是固定顶栏自身的材质，本测试锁定：
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

    it('玻璃是单一连续表面：仅一个 drawBackdrop 调用点，经 DstIn 蒙版平滑衰减', () => {
        // 结构性防退化：多段模糊（上一轮两条横带的根因）不允许回来。
        const callSites = glassKt.match(/\.drawBackdrop\(/g) ?? [];
        expect(callSites.length, '玻璃表面必须只有一个 drawBackdrop 调用点').toBe(1);
        expect(glassKt, '强度衰减必须经 saveLayer + DstIn 渐变蒙版').toContain('BlendMode.DstIn');
        expect(glassKt).toContain('saveLayer');
        expect(glassKt, '蒙版主体必须平台全强度').toContain('topGlassMaskStops');
        expect(glassKt, '不得存在分段模糊循环').not.toContain('BlurSegment');
    });

    it('玻璃只画不接事件：无 pointerInput / clickable / 滚动状态写入', () => {
        expect(glassKt, '玻璃层不得拦截触摸').not.toContain('pointerInput');
        expect(glassKt, '玻璃层不得有可点击区域').not.toContain('clickable');
        expect(glassKt, '玻璃层不得写滚动状态').not.toContain('scrollToItem');
    });

    it('内容全幅滚动：列表 contentPadding 由测量的玻璃范围驱动（非固定列内裁切）', () => {
        for (const file of pages) {
            const source = chrome(file);
            expect(source, `${file} 列表必须消费 glass.headerBottomDp`).toContain('glass.headerBottomDp.dp');
        }
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

    it('模糊能力门控可关闭，降级为同形状半透明底色（非横带）', () => {
        expect(glassKt).toContain('BuildConfig.TOP_GLASS_BLUR');
        expect(glassKt).toContain('Build.VERSION.SDK_INT >= 31');
        const buildGradle = read('android', 'app', 'build.gradle');
        expect(buildGradle).toContain("buildConfigField 'boolean', 'TOP_GLASS_BLUR'");
        expect(buildGradle).toContain('TINGYU_TOP_GLASS_BLUR');
    });

    it('集合详情的封面氛围层由内容层绘制（能力具备时页面级原件移除，避免重复采样）', () => {
        const media = chrome('MediaDetail.kt');
        expect(media).toContain('ambientImage=cover.image');
        expect(media).toContain('if(!TyTopGlass.glassCapable)NativePlaylistBackdrop');
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
