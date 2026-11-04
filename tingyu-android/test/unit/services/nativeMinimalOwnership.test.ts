// @vitest-environment jsdom
import { expect, it, describe } from 'vitest';
import {
    composeMinimalOwnsSurface,
    resolveMinimalRejection,
    setComposeMinimalOwnership,
} from '@/services/nativeMinimalPlayer';

// test/unit/services/nativeMinimalOwnership.test.ts
// 第 12 轮：设置往返期间显示权的归属规则。
//
// 真机上两个症状都指向同一组规则：
//  · 从极简页进播放设置再返回，会先闪一帧旧 WebView 极简页（还常是上次停留的歌词页）——
//    根因是设置弹窗带着 data-folia-keyboard-window，把帧拒成"弹层让位"，WebView 极简页重新挂载；
//  · 从歌词舞台进设置再返回卡在设置页 —— 根因是路由发布的 surface-ready 门只认 WebView 属性。
// 这组用例钉住处置规则本身；路由门在 nativeStageCommit.test.ts。

describe('resolveMinimalRejection', () => {
    it('keeps ownership while the stage detour is active', () => {
        expect(resolveMinimalRejection(true, false, false)).toBe('hold');
        // 顺访期间即使有弹层标记也不交回：舞台是 WebView 自己画的。
        expect(resolveMinimalRejection(true, true, true)).toBe('hold');
    });

    it('keeps ownership while the native settings document is open', () => {
        expect(resolveMinimalRejection(false, true, false)).toBe('hold');
        // 设置弹窗自身就是一块 keyboard-window，但它由原生文档绘制，不需要 WebView 极简页垫底。
        expect(resolveMinimalRejection(false, true, true)).toBe('hold');
    });

    it('hands the surface back for ordinary WebView overlays', () => {
        expect(resolveMinimalRejection(false, false, true)).toBe('handback');
    });

    it('counts a bare rejection as a fallback failure', () => {
        expect(resolveMinimalRejection(false, false, false)).toBe('fail');
    });
});

describe('compose ownership mirror', () => {
    it('mirrors the latest ownership fact for the routing layer', () => {
        setComposeMinimalOwnership(false);
        expect(composeMinimalOwnsSurface()).toBe(false);
        setComposeMinimalOwnership(true);
        expect(composeMinimalOwnsSurface()).toBe(true);
        setComposeMinimalOwnership(false);
        expect(composeMinimalOwnsSurface()).toBe(false);
    });
});
