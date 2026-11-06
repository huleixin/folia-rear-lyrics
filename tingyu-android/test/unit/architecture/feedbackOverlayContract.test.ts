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
// 反馈面板的遮罩原来是个 `<button className="absolute inset-0">` —— 全屏、无 area。
// 它被还原成一个全屏热区盖住分类、输入框、开关，任何一次点击都命中它 → onClose →
// 面板关掉，看起来就是「点什么都回上一页」。DOM 侧（浏览器 / Playwright）完全正常，
// 所以这个问题只在真机上出现。
//
// 契约：
//   1. 全屏遮罩必须是普通 div，不能是 button / role=button（否则会被采成控件）；
//   2. 装饰层显式标 data-native-decoration，采集端必须跳过它；
//   3. 面板自己的可点元素（分类、开关、预览、导出）不受影响。

const root = resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

const panel = read('src/components/modal/feedback/FeedbackPanel.tsx');
const capture = read('src/services/nativeSettingsDocument.ts');

describe('反馈面板遮罩契约（DOM 与原生镜像同一套点击语义）', () => {
    it('遮罩不是全屏 button：那会变成盖住整个面板的原生热区', () => {
        // 全屏 button 的判定：同一开标签里既有 <button 又有 absolute inset-0。
        expect(panel).not.toMatch(/<button[^>]*absolute inset-0[^>]*>/);
        expect(panel).not.toMatch(/<button[\s\S]{0,240}?className="absolute inset-0"/);
    });

    it('遮罩是装饰层，并显式声明 data-native-decoration', () => {
        expect(panel).toMatch(
            /<div\s+aria-hidden="true"\s+data-native-decoration="true"\s+onClick=\{onClose\}\s+className="absolute inset-0"/,
        );
        // 仍然要能点空白关闭（DOM 侧）。
        expect(panel).toContain('onClick={onClose}');
    });

    it('采集端跳过装饰层，不把它注册成控件', () => {
        expect(capture).toContain("element.closest('[data-native-decoration]')");
        expect(capture).toMatch(/const clickable=!decoration&&/);
        expect(capture).toMatch(/const input=!decoration&&/);
    });
});
