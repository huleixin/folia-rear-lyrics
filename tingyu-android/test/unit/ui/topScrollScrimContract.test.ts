// test/unit/ui/topScrollScrimContract.test.ts
//
// TingYu Top Scroll Scrim 结构契约门禁（防退化）。
//
// 背景：顶部滚动渐隐是设计系统正式组成（docs/ui-system/TOP_SCROLL_SCRIM.md）。
// 本测试锁定三件事：
//  1. 所有「固定顶部栏 + 滚动容器」的 Compose 页面必须经公共组件接入，
//     不允许任何页面私自手写遮罩（防止以后每页一套渐隐逻辑）；
//  2. 公共组件的硬契约：只画不接事件（无点击穿透）、静止不绘制（顶部干净）、
//     Tier2 模糊走能力门控；
//  3. 按实际布局豁免的页面保持豁免，防止机械添加遮罩。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const read = (...segments: string[]) =>
    readFileSync(path.join(root, ...segments), 'utf8');

const chrome = (...names: string[]) => read('android', 'app', 'src', 'main', 'java', 'io', 'github', 'huleixin', 'tingyu', 'chrome', ...names);

const scrimKt = chrome('TopScrollScrim.kt');
const pages: Array<[file: string, fusion: 'Gradient' | 'Ambient']> = [
    ['NativeHomePage.kt', 'Gradient'],
    ['NativeDirectoryPage.kt', 'Gradient'],
    ['NativeSearchPage.kt', 'Gradient'],
    ['MediaDetail.kt', 'Ambient'],
    ['NativeSettingsPage.kt', 'Gradient'],
    ['NativeRearControlPage.kt', 'Gradient'],
];

describe('Top Scroll Scrim 结构契约', () => {
    it('公共组件存在且经 TopScrollScrimViewport 暴露（不逐页手写遮罩）', () => {
        expect(scrimKt).toContain('internal fun TopScrollScrimViewport(');
        expect(scrimKt).toContain('internal object TyScrollScrim');
    });

    it.each(pages)('%s 经公共组件接入且融合策略正确', (file, fusion) => {
        const source = chrome(file);
        expect(source, `${file} 必须经 TopScrollScrimViewport 接入`).toContain('TopScrollScrimViewport(');
        expect(source, `${file} 融合策略应为 ${fusion}`).toContain(`TopScrimFusion.${fusion}(`);
        // 页面不得私自绘制渐隐/模糊遮罩（模糊只能来自公共组件的 Tier2）。
        expect(source, `${file} 不得私自 Modifier.blur`).not.toMatch(/Modifier\.blur|\.blur\(/);
    });

    it('公共组件只画不接事件：无 pointerInput / clickable / 滚动范围改动', () => {
        expect(scrimKt, '遮罩层不得拦截触摸').not.toContain('pointerInput');
        expect(scrimKt, '遮罩层不得有可点击区域').not.toContain('clickable');
        expect(scrimKt, '遮罩层不得写滚动状态').not.toContain('scrollToItem');
    });

    it('静止时遮罩完全不绘制（顶部干净通透，无长期雾层）', () => {
        expect(scrimKt, '渐隐盖片必须有 activation<=0 的早退守卫').toContain('activation <= 0f');
        expect(scrimKt, '氛围层蒙版必须有 activation<=0 的早退守卫').toContain('activation <= 0f');
        // 激活是派生一次性布尔：滚动全程零重组（draw 阶段跟随）。
        expect(scrimKt).toContain('derivedStateOf');
    });

    it('Tier2 局部模糊走能力门控，可经环境变量关闭', () => {
        expect(scrimKt).toContain('BuildConfig.TOP_SCRIM_BLUR');
        expect(scrimKt).toContain('Build.VERSION.SDK_INT >= 31');
        const buildGradle = read('android', 'app', 'build.gradle');
        expect(buildGradle).toContain("buildConfigField 'boolean', 'TOP_SCRIM_BLUR'");
        expect(buildGradle).toContain('TINGYU_TOP_SCRIM_BLUR');
    });

    it('遮罩颜色来自页面背景色板单一来源（跟随深浅色与页面类型）', () => {
        expect(chrome('NativePageView.kt')).toContain('internal fun NativePage.surfaceColors()');
        expect(scrimKt).toContain('surfaceColors');
    });

    it('按实际布局豁免的页面保持豁免（不机械添加遮罩）', () => {
        // 设置文档页：区域级独立滚动窗口、无固定顶栏（DOM 是排版真值源）。
        expect(chrome('NativeSettingsDocumentView.kt')).not.toContain('TopScrollScrim');
        // MobileSheet 的 header 在滚动容器内部（随内容滚动）→ 无固定顶部，豁免。
        expect(read('src', 'library', 'suites', 'mobile', 'MobileSheet.tsx')).not.toContain('ty-top-scrim');
        // 底部 Liquid Glass（ChromeMaterial）不被顶部渐隐触碰。
        expect(chrome('ChromeMaterial.kt')).not.toContain('TopScrollScrim');
    });

    it('WebView 侧公共能力就绪且为条件启用（无消费方零开销）', () => {
        const shared = read('src', 'components', 'shared', 'topScrollScrim.ts');
        expect(shared).toContain('export function topScrimProgress(');
        expect(shared).toContain('TY_SCRIM.rampPx');
        const frame = read('src', 'library', 'suites', 'mobile', 'MobileScrollFrame.tsx');
        expect(frame).toContain("':scope > .ty-top-scrim'");
        expect(frame).toContain('--ty-scrim-progress');
    });
});
