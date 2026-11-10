import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// test/unit/architecture/launchSurfaceContract.test.ts
// 启动底板契约：窗口底色 → WebView 首帧 → DOM 遮罩，三层必须是同一个颜色。
//
// 录屏 68723 / 68736 / 68737 里那块「黑卡闪一下」其实是三层同色问题，一层一层拆掉的：
//   1. 启动主题 / styles.xml 的 windowBackground —— 收敛到 interfaceLaunchBackground；
//   2. MainSystemBars.apply() 把 decor 设成透明 —— 由 BootSurfaceTint 在首帧前补色；
//   3. index.html 里 html/body 与 #app-splash 写死 #09090b —— WebView 一画出 HTML，
//      就在已经上色的窗口上再盖一块纯黑，直到 React 首次提交才淡出。
//      68737 录屏逐帧均值：0.50~0.80s 恒为 #09080B、std≈1.3（纯色板），紧接着 320ms
//      淡出到首页 #0C2520 —— 就是这一层。
//
// 这条测试钉第 3 层：DOM 侧不得再写死深色，必须吃 --ty-launch-bg，且两个取值要和
// chrome/LaunchSurface.kt 的常量逐字一致（改色 = 改契约，两边一起改）。

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

const indexHtml = read('index.html');
const launchSurface = read('android/app/src/main/java/io/github/huleixin/tingyu/chrome/LaunchSurface.kt');
const indexCss = read('src/index.css');

describe('启动底板契约（窗口 / WebView 首帧 / DOM 遮罩同色）', () => {
    it('原生常量仍是深 #102D25 / 浅 #F4F5EE', () => {
        expect(launchSurface).toContain('InterfacePalette(false).launch');
        expect(read('src/theme/interfaceThemeSpec.json')).toContain('FF102D25');
        expect(launchSurface).toContain('InterfacePalette(true).launch');
        expect(read('src/theme/interfaceThemeSpec.json')).toContain('FFF4F5EE');
    });

    it('index.html 的启动底色与原生常量逐字一致', () => {
        expect(indexHtml).toContain('--ty-launch-bg: #102d25');
        expect(indexHtml).toContain('--ty-launch-bg: #f4f5ee');
    });

    it('html/body 与 #app-splash 都走 --ty-launch-bg，不再写死深色', () => {
        expect(indexHtml).toMatch(/html,\s*\n\s*body\s*\{[^}]*background-color:\s*var\(--ty-launch-bg\)/);
        expect(indexHtml).toMatch(/#app-splash\s*\{[^}]*background-color:\s*var\(--ty-launch-bg\)/);
        // 遮罩与 body 上都不能再出现字面量 #09090b 之类的深色底。
        expect(indexHtml).not.toMatch(/background-color:\s*#09090b/i);
    });

    it('首帧之前就按偏好定色（键与原生 SharedPreferences 同名同值）', () => {
        expect(indexHtml).toContain("localStorage.getItem('tingyu_interface_appearance_v1')");
        expect(indexHtml).toContain('data-launch-light');
        expect(indexHtml).toContain("matchMedia('(prefers-color-scheme: light)')");
        // 脚本必须在 <body> 之前，否则会先画一帧错色。
        expect(indexHtml.indexOf('data-launch-light')).toBeLessThan(indexHtml.indexOf('<body'));
    });

    it('全局 body 底色跟随启动底板，未定义变量的入口仍回落原色', () => {
        expect(indexCss).toMatch(/body\s*\{[^}]*background-color:\s*var\(--ty-launch-bg,\s*#09090b\)/);
    });
});
