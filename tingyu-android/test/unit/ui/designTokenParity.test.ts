// test/unit/ui/designTokenParity.test.ts
//
// 双端 Design Token 一致性门禁（UI 统一工程阶段 C）。
//
// 背景：WebView(CSS/TS) 与 Compose(Kotlin) 各有一份 Token 事实源
// （src/styles/tingyuTokens.css、src/components/shared/motionTokens.ts 与
// chrome/InterfacePalette.kt、chrome/TingYuMotion.kt）。1.3.182 审计发现同一语义色
// 曾出现三个近似值（muted：#a1b7ae / #a2afaa / #a2b6ac），只能靠人工记忆同步。
// 本测试直接读取三端源文件，解析字面量并断言成对一致——改任何一端而不同步另一端
// 都会在 `npm test` 红灯。新增跨端共享 Token 时必须在此登记成对断言。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const read = (...segments: string[]) =>
    readFileSync(path.join(root, ...segments), 'utf8');

const tokensCss = read('src', 'styles', 'tingyuTokens.css');
const tokensTs = read('src', 'components', 'shared', 'motionTokens.ts');
const overlayMotionTs = read('src', 'components', 'shared', 'overlayEntranceMotion.ts');
const interfacePaletteKt = read(
    'android', 'app', 'src', 'main', 'java', 'io', 'github', 'huleixin', 'tingyu', 'chrome', 'InterfacePalette.kt'
);
const tingyuMotionKt = read(
    'android', 'app', 'src', 'main', 'java', 'io', 'github', 'huleixin', 'tingyu', 'chrome', 'TingYuMotion.kt'
);
const playlistAffordancesKt = read(
    'android', 'app', 'src', 'main', 'java', 'io', 'github', 'huleixin', 'tingyu', 'chrome', 'PlaylistAffordances.kt'
);
const topScrollScrimKt = read(
    'android', 'app', 'src', 'main', 'java', 'io', 'github', 'huleixin', 'tingyu', 'chrome', 'TopScrollScrim.kt'
);
const topScrollScrimCss = read('src', 'styles', 'topScrollScrim.css');
const scrollFrameTs = read('src', 'library', 'suites', 'mobile', 'MobileScrollFrame.tsx');
const playlistDetailCss = read('src', 'library', 'suites', 'mobile', 'mobilePlaylistDetail.css');

/** 提取 CSS 某选择器块内自定义属性的值。
 *  选择器文本可能同时出现在文件头注释里，因此只认「紧跟 {」的那次出现。 */
function cssVar(source: string, name: string, scope = ':root'): string {
    const escaped = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockMatch = source.match(new RegExp(`${escaped}\\s*\\{`));
    expect(blockMatch, `CSS scope ${scope} 存在`).toBeTruthy();
    const nextBrace = blockMatch!.index! + blockMatch![0].length;
    const end = source.indexOf('\n}', nextBrace);
    const block = source.slice(nextBrace, end);
    const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    expect(match, `${scope} 内存在 ${name}`).toBeTruthy();
    return match![1].trim();
}

/** 提取 Kotlin 文件中的 Color(0xAARRGGBB) 字面量（按 val 名）。
 *  兼容两种形态：`val Ink=Color(0x…)`（LightInterfaceColors）与
 *  `val muted get()=color(Color(0x…),…)`（InterfacePalette 深色 getter）。 */
function ktColor(source: string, name: string): string {
    const match = source.match(
        new RegExp(`${name}\\s*(?:get\\(\\)\\s*=\\s*color\\()?\\s*=?\\s*Color\\(0x([0-9A-Fa-f]{8})\\)`)
    );
    expect(match, `Kotlin 存在 ${name}`).toBeTruthy();
    return match![1].toUpperCase();
}

/** 提取 Kotlin object 中的 const val 整数。 */
function ktConst(source: string, name: string): number {
    const match = source.match(new RegExp(`const val ${name}\\s*=\\s*(\\d+)`));
    expect(match, `Kotlin 存在 const val ${name}`).toBeTruthy();
    return Number(match![1]);
}

/** #RRGGBB → 0xFFRRGGBB 归一化比较。 */
function expectColor(cssValue: string, ktValue: string, label: string) {
    const hex = cssValue.trim().replace('#', '').toUpperCase();
    expect(hex, `${label} CSS 侧应为 6 位 hex`).toMatch(/^[0-9A-F]{6}$/);
    expect(`FF${hex}`, label).toBe(ktValue.toUpperCase());
}

describe('Design Token 双端一致性（WebView CSS ↔ Compose Kotlin）', () => {
    it('深色语义色与 InterfacePalette dark 一致', () => {
        expectColor(cssVar(tokensCss, '--ty-color-text'), ktColor(interfacePaletteKt, 'val ink'), 'dark text/ink');
        expectColor(cssVar(tokensCss, '--ty-color-text-secondary'), ktColor(interfacePaletteKt, 'val muted'), 'dark text-secondary/muted');
        expectColor(cssVar(tokensCss, '--ty-color-accent'), ktColor(interfacePaletteKt, 'val accent'), 'dark accent');
    });

    it('浅色语义色与 LightInterfaceColors 一致', () => {
        const lightScope = "html[data-interface-appearance='light']";
        expectColor(cssVar(tokensCss, '--ty-color-text', lightScope), ktColor(interfacePaletteKt, 'val Ink'), 'light text/Ink');
        expectColor(cssVar(tokensCss, '--ty-color-text-secondary', lightScope), ktColor(interfacePaletteKt, 'val Muted'), 'light text-secondary/Muted');
        expectColor(cssVar(tokensCss, '--ty-color-accent', lightScope), ktColor(interfacePaletteKt, 'val Accent'), 'light accent/Accent');
        expectColor(cssVar(tokensCss, '--ty-color-bg-raised', lightScope), ktColor(interfacePaletteKt, 'val Surface'), 'light bg-raised/Surface');
    });

    it('歌单详情页的 --ml-* 变量与 Token/Compose 对齐（回归 1.3.182 三值 muted 缺陷）', () => {
        const muted = playlistDetailCss.match(/--ml-muted:\s*(#[0-9a-fA-F]{6})/);
        expect(muted, '歌单详情定义 --ml-muted').toBeTruthy();
        expectColor(muted![1], ktColor(interfacePaletteKt, 'val muted'), 'playlist --ml-muted/dark muted');
        const jade = playlistDetailCss.match(/--ml-jade:\s*(#[0-9a-fA-F]{6})/);
        expect(jade, '歌单详情定义 --ml-jade').toBeTruthy();
        expectColor(jade![1], ktColor(playlistAffordancesKt, 'PlaylistAccent'), 'playlist --ml-jade/PlaylistAccent');
    });

    it('动效时长三端一致（TS 秒 ↔ CSS ms ↔ Kotlin ms）', () => {
        const slow = cssVar(tokensCss, '--ty-duration-slow');
        expect(slow).toBe('280ms');
        expect(tokensTs).toMatch(/slow:\s*0\.28/);
        expect(overlayMotionTs).toMatch(/duration:\s*TY_DURATION\.slow/);
        expect(ktConst(tingyuMotionKt, 'PushMs')).toBe(240);
        expect(ktConst(tingyuMotionKt, 'TabInMs')).toBe(200);
        expect(ktConst(tingyuMotionKt, 'TabOutMs')).toBe(180);

        const stage = cssVar(tokensCss, '--ty-duration-stage');
        expect(stage).toBe('360ms');
        expect(tokensTs).toMatch(/stage:\s*0\.36/);
        expect(ktConst(tingyuMotionKt, 'MinimalEnterMs')).toBe(360);
    });

    it('进入/退出曲线三端一致', () => {
        // enter: cubic-bezier(0.22, 1, 0.36, 1)
        expect(cssVar(tokensCss, '--ty-ease-enter')).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
        expect(tokensTs).toMatch(/enter:\s*\[0\.22,\s*1,\s*0\.36,\s*1\]/);
        // exit: cubic-bezier(0.42, 0, 0.74, 0.3) ↔ TingYuMotion.StageExit
        expect(cssVar(tokensCss, '--ty-ease-exit')).toBe('cubic-bezier(0.42, 0, 0.74, 0.3)');
        const stageExit = tingyuMotionKt.match(/val StageExit\s*=\s*CubicBezierEasing\(([\d.f,\s]+)\)/);
        expect(stageExit, 'TingYuMotion.StageExit 存在').toBeTruthy();
        const parsed = stageExit![1].split(',').map((piece) => Number(piece.trim().replace(/f$/, '')));
        expect(parsed).toEqual([0.42, 0, 0.74, 0.3]);
    });

    it('玻璃材质 token 存在且移动端底栏 CSS 消费它们（防回退为魔数）', () => {
        expect(cssVar(tokensCss, '--ty-glass-blur')).toBe('10px');
        expect(cssVar(tokensCss, '--ty-glass-tint')).toContain('11 20 19 / 46%');
        const mobileGlass = read('src', 'styles', 'mobileGlass.css');
        expect(mobileGlass).toContain('var(--ty-glass-tint)');
        expect(mobileGlass).toContain('var(--ty-glass-blur)');
        expect(mobileGlass).not.toMatch(/backdrop-filter:\s*blur\(10px\)\s*saturate\(1\.25\)/);
    });

    it('顶部滚动渐隐 token 三端一致（CSS px ↔ TS px ↔ Kotlin dp）', () => {
        // 基础尺寸：band（过渡带高度）/ ramp（激活行程）/ blur（Tier2 最大模糊半径）。
        expect(cssVar(tokensCss, '--ty-scrim-band')).toBe('44px');
        expect(cssVar(tokensCss, '--ty-scrim-ramp')).toBe('32px');
        expect(cssVar(tokensCss, '--ty-scrim-blur')).toBe('10px');
        expect(tokensTs).toMatch(/bandPx:\s*44/);
        expect(tokensTs).toMatch(/rampPx:\s*32/);
        expect(tokensTs).toMatch(/blurPx:\s*10/);
        expect(ktConst(topScrollScrimKt, 'BandDp')).toBe(44);
        expect(ktConst(topScrollScrimKt, 'RampDp')).toBe(32);
        expect(ktConst(topScrollScrimKt, 'BlurSegments')).toBe(3);

        // 缓落采样（band 内 alpha 分布）：TS 数组 ↔ Kotlin 数组逐值一致。
        const parseList = (text: string, label: string): number[] => {
            const match = text.match(/\[([\d.,\s]+)\]/);
            expect(match, label).toBeTruthy();
            return match![1].split(',').map((piece) => Number(piece.trim()));
        };
        // Kotlin 侧传入的是 listOf(...) 内部段（外层正则已截取），直接按逗号拆数。
        const parseKtList = (segment: string, label: string): number[] => {
            expect(segment.trim().length > 0, label).toBeTruthy();
            return segment.split(',').map((piece) => Number(piece.trim().replace(/f$/, '')));
        };
        const tsStops = tokensTs.match(/stopPositions:\s*(\[[^\]]+\])/)![1];
        const tsAlphas = tokensTs.match(/stopAlphas:\s*(\[[^\]]+\])/)![1];
        const ktPositions = topScrollScrimKt.match(/val StopPositions\s*=\s*listOf\(([^)]+)\)/)![1];
        const ktAlphas = topScrollScrimKt.match(/val StopAlphas\s*=\s*listOf\(([^)]+)\)/)![1];
        expect(parseList(tsStops, 'TS stopPositions')).toEqual(parseKtList(ktPositions, 'Kotlin StopPositions'));
        expect(parseList(tsAlphas, 'TS stopAlphas')).toEqual(parseKtList(ktAlphas, 'Kotlin StopAlphas'));

        // Tier2 分段模糊半径（顶部最强、向下递减）。
        const tsRadii = parseList(tokensTs.match(/blurSegmentRadii:\s*(\[[^\]]+\])/)![1], 'TS blurSegmentRadii');
        const ktRadii = parseKtList(topScrollScrimKt.match(/val BlurSegmentRadiiDp\s*=\s*listOf\(([^)]+)\)/)![1], 'Kotlin BlurSegmentRadiiDp');
        expect(tsRadii).toEqual(ktRadii);
        expect(tsRadii[0]).toBeGreaterThan(tsRadii[tsRadii.length - 1]);
    });

    it('顶部渐隐 WebView 公共能力消费 scrim token（防回退为魔数）', () => {
        expect(topScrollScrimCss).toContain('var(--ty-scrim-band)');
        expect(topScrollScrimCss).toContain('var(--ty-color-bg)');
        expect(topScrollScrimCss).toContain('pointer-events: none');
        // 进度由 MobileScrollFrame 写入（条件化：无消费方零开销）。
        expect(scrollFrameTs).toContain('topScrimProgress(');
        expect(scrollFrameTs).toContain('--ty-scrim-progress');
        // 不允许把普通渐变伪装成 backdrop-filter 玻璃模糊（注释提及不算，只查真实用法）。
        expect(topScrollScrimCss).not.toMatch(/backdrop-filter\s*:/);
    });
});
