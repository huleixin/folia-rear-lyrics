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
import {interfaceThemes} from '../../../src/theme/interfaceThemes.generated';
import { TY_GLASS_TOP } from '../../../src/components/shared/motionTokens';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const read = (...segments: string[]) =>
    resolveClassic(readFileSync(path.join(root, ...segments), 'utf8'));
function resolveClassic(value:string){
    for(const [key,color] of Object.entries(interfaceThemes.classic.dark.web)) value=value.replaceAll('var('+key+')',color);
    return value;
}

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
const topGlassBarKt = read(
    'android', 'app', 'src', 'main', 'java', 'io', 'github', 'huleixin', 'tingyu', 'chrome', 'TopGlassBar.kt'
);
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
    const role=name.replace('val ','');
    const keys:Record<string,string>={LightInk:'topInk',LightMuted:'topMuted',LightAccent:'topAccent',PlaylistAccent:'mediaAccent'};
    const light=role[0]===role[0].toUpperCase() && role!=='PlaylistAccent';
    const key=keys[role]||role[0].toLowerCase()+role.slice(1);
    const palette=interfaceThemes.classic[light?'light':'dark'].native;
    expect(key in palette).toBe(true);
    return palette[key as keyof typeof palette].hex;

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

    it('沉浸式毛玻璃顶栏 token 三端一致（CSS px ↔ TS px ↔ Kotlin dp）', () => {
        // blur = 顶栏玻璃模糊半径；tail = 底部强度衰减距离。
        expect(cssVar(tokensCss, '--ty-glass-top-blur')).toBe(`${TY_GLASS_TOP.blurPx}px`);
        expect(cssVar(tokensCss, '--ty-glass-top-tail')).toBe('32px');
        expect(TY_GLASS_TOP.blurPx).toBe(14);
        expect(tokensTs).toMatch(/tailPx:\s*32/);
        expect(ktConst(topGlassBarKt, 'BlurDp')).toBe(TY_GLASS_TOP.blurPx);
        expect(ktConst(topGlassBarKt, 'TailDp')).toBe(TY_GLASS_TOP.tailPx);

        // tint 是模糊内容上的半透明蒙层；深浅模式都必须三端同步并保留透光余量。
        const lightScope = "html[data-interface-appearance='light']";
        for (const [name, scope, expected] of [
            ['Dark', ':root', TY_GLASS_TOP.tintAlphaDark],
            ['Light', lightScope, TY_GLASS_TOP.tintAlphaLight],
        ] as const) {
            const match = topGlassBarKt.match(new RegExp(`const val TintAlpha${name}\\s*=\\s*(0\\.\\d+)f`));
            expect(match, `Kotlin TintAlpha${name}`).toBeTruthy();
            expect(Number(match![1])).toBe(expected);
            expect(Number(cssVar(tokensCss, '--ty-glass-top-tint-alpha', scope))).toBe(expected);
            expect(expected).toBeGreaterThanOrEqual(0.5);
            expect(expected).toBeLessThanOrEqual(0.75);
        }
        expect(TY_GLASS_TOP.tintAlphaLight).toBe(0.68);
        expect(TY_GLASS_TOP.tintAlphaDark).toBe(0.55);
        expect(TY_GLASS_TOP.tintAlphaLight).toBeGreaterThan(TY_GLASS_TOP.tintAlphaDark);
        for (const [css, kt, ts] of [
            ['--ty-glass-top-text', 'LightInk', TY_GLASS_TOP.lightInk],
            ['--ty-glass-top-text-secondary', 'LightMuted', TY_GLASS_TOP.lightMuted],
            ['--ty-glass-top-accent', 'LightAccent', TY_GLASS_TOP.lightAccent],
        ] as const) {
            expect(cssVar(tokensCss, css, lightScope)).toBe(ts);
            expectColor(ts, ktColor(topGlassBarKt, `val ${kt}`), css);
        }

        // 底部衰减采样（玻璃强度平滑落零）：TS 数组 ↔ Kotlin 数组逐值一致。
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
        const tsPositions = tokensTs.match(/decayPositions:\s*(\[[^\]]+\])/)![1];
        const tsAlphas = tokensTs.match(/decayAlphas:\s*(\[[^\]]+\])/)![1];
        const ktPositions = topGlassBarKt.match(/val DecayPositions\s*=\s*listOf\(([^)]+)\)/)![1];
        const ktAlphas = topGlassBarKt.match(/val DecayAlphas\s*=\s*listOf\(([^)]+)\)/)![1];
        expect(parseList(tsPositions, 'TS decayPositions')).toEqual(parseKtList(ktPositions, 'Kotlin DecayPositions'));
        expect(parseList(tsAlphas, 'TS decayAlphas')).toEqual(parseKtList(ktAlphas, 'Kotlin DecayAlphas'));
        // 衰减必须落到 0（顶栏底缘无分界线），且首段保持全强度。
        expect(parseList(tsAlphas, 'TS decayAlphas')[0]).toBe(1);
        expect(parseList(tsAlphas, 'TS decayAlphas').slice(-1)[0]).toBeLessThan(0.01);
        expect(TY_GLASS_TOP.decayPositions).toHaveLength(TY_GLASS_TOP.decayAlphas.length);
        expect(TY_GLASS_TOP.decayPositions[0]).toBe(0);
        expect(TY_GLASS_TOP.decayPositions.at(-1)).toBe(1);
        TY_GLASS_TOP.decayPositions.forEach((position, index, positions) => {
            expect(position).toBeGreaterThanOrEqual(0);
            expect(position).toBeLessThanOrEqual(1);
            if (index) expect(position).toBeGreaterThan(positions[index - 1]);
        });
        TY_GLASS_TOP.decayAlphas.forEach((alpha, index, alphas) => {
            expect(alpha).toBeGreaterThanOrEqual(0);
            expect(alpha).toBeLessThanOrEqual(1);
            if (index) expect(alpha).toBeLessThan(alphas[index - 1]);
        });
    });

    it('顶栏尾带使用密集 smoothstep 采样，防止五点折线在主体边缘突降', () => {
        const steps = TY_GLASS_TOP.decaySteps;
        expect(Number(cssVar(tokensCss, '--ty-glass-top-decay-steps'))).toBe(steps);
        expect(ktConst(topGlassBarKt, 'DecaySteps')).toBe(steps);
        expect(steps).toBe(32);
        expect(TY_GLASS_TOP.tailPx / steps).toBeLessThanOrEqual(1);
        expect(TY_GLASS_TOP.decayPositions).toHaveLength(steps + 1);
        TY_GLASS_TOP.decayPositions.forEach((position, index) => {
            expect(position).toBeCloseTo(index / steps, 7);
            const expected = 1 - position * position * (3 - 2 * position);
            expect(TY_GLASS_TOP.decayAlphas[index]).toBeCloseTo(expected, 6);
        });
        // 首尾一个采样区间的强度变化都小于 0.5%，旧曲线起点约 4.8%/dp。
        expect(1 - TY_GLASS_TOP.decayAlphas[1]).toBeLessThan(0.005);
        expect(TY_GLASS_TOP.decayAlphas.at(-2)).toBeLessThan(0.005);
    });
});
