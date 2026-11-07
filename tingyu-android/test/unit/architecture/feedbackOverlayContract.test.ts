import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// test/unit/architecture/feedbackOverlayContract.test.ts
// 反馈面板（68743）：真机上「点哪都返回上一页」。
//
// 安卓的设置页不是直接显示 DOM，而是被 captureSettingsDocument 拍成一份 display list
// （paints / controls / areas），由 Compose 重画并把控件还原成点击热区。这里有一条隐含规则：
// **没有滚动区（area=null）的控件，会在所有 area 之后与 Controls(null) 一起合成**，
// 因此它们永远盖在滚动区里的内容控件之上。
//
// 反馈面板的遮罩原来是个 `<button className="absolute inset-0" onClick={onClose}>` ——
// 全屏、无 area。它被还原成一个全屏热区盖住分类、输入框、开关，任何一次点击都命中它
// → onClose → 面板关掉，看起来就是「点什么都回上一页」。DOM 侧（浏览器）完全正常，
// 所以这个问题只在真机上出现。
//
// 第二轮加固（不再只靠「遮罩不是 button」这一条约定）：
//   1. 遮罩是纯装饰 div：aria-hidden + pointer-events-none，**没有 onClick**；
//   2. 关闭逻辑收敛到外层 dialog 容器，且严格判定 event.target === event.currentTarget；
//   3. 面板容器 stopPropagation，React Portal 的合成事件不会冒泡到宿主关闭逻辑；
//   4. 采集端同时跳过 [data-native-decoration] 子树与元素自身的 aria-hidden。
//
// 契约测试锁住这四条，防止有人「顺手」把 onClick 加回遮罩上而让真机复发。

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

const panel = read('src/components/modal/feedback/FeedbackPanel.tsx');
const capture = read('src/services/nativeSettingsDocument.ts');

describe('反馈面板遮罩契约（DOM 与原生镜像同一套点击语义）', () => {
    it('遮罩不是全屏 button：那会变成盖住整个面板的原生热区', () => {
        expect(panel).not.toMatch(/<button[^>]*absolute inset-0[^>]*>/);
        expect(panel).not.toMatch(/<button[\s\S]{0,240}?className="absolute inset-0"/);
    });

    it('遮罩是纯装饰层：aria-hidden + decoration + pointer-events-none，且不带 onClick', () => {
        const scrim = panel.match(/<div\s+aria-hidden="true"[\s\S]{0,320}?\/>/);
        expect(scrim).not.toBeNull();
        const markup = scrim![0];
        expect(markup).toContain('data-native-decoration="true"');
        expect(markup).toContain('pointer-events-none absolute inset-0');
        expect(markup).not.toContain('onClick');
        // 背景色 / 模糊保留，视觉不变。
        expect(markup).toContain('backgroundColor: palette.scrim');
    });

    it('关闭只发生在「点外层容器自身」：严格 target === currentTarget', () => {
        expect(panel).toMatch(/event\.target === event\.currentTarget\)\s*onClose\(\)/);
        expect(panel).toMatch(/onClick=\{handleScrimClick\}/);
        // 面板容器阻断冒泡：Portal 合成事件沿 React 树走，不能冒到宿主。
        expect(panel).toMatch(/data-testid="feedback-panel"[\s\S]{0,120}?onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
    });

    it('X 保留显式关闭；遮罩不再有独立的关闭处理', () => {
        expect(panel).toMatch(/data-testid="feedback-close"[\s\S]{0,160}?onClick=\{onClose\}/);
        // 整个组件里 onClose 只被 handleScrimClick 与 X 使用。
        expect(panel.match(/onClick=\{onClose\}/g) ?? []).toHaveLength(1);
    });

    it('采集端跳过装饰层与 aria-hidden，不把它们注册成控件', () => {
        expect(capture).toContain("element.closest('[data-native-decoration]')");
        expect(capture).toContain("element.getAttribute('aria-hidden')==='true'");
        expect(capture).toMatch(/const clickable=!decoration&&/);
        expect(capture).toMatch(/const input=!decoration&&/);
    });
});
