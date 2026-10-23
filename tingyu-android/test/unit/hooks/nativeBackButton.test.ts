import { describe, expect, it, vi } from 'vitest';
import { applyNativeBackPress } from '@/hooks/useNativeBackButton';

// test/unit/hooks/nativeBackButton.test.ts
// 现场反馈「退出应用就自动暂停播放」：返回键在没人消费时原来直接 exitApp()，结束 Activity 会
// 连带收掉 WebView 与前台播放服务。这里锁住「无层可关时退到后台」的策略。

const buildPlugin = (overrides: { withBackground?: boolean } = {}) => {
    const exitApp = vi.fn(async () => undefined);
    const moveTaskToBack = vi.fn(async () => undefined);
    const recordRuntimeDiagnostic = vi.fn(async () => undefined);
    return {
        exitApp,
        moveTaskToBack: overrides.withBackground === false ? undefined : moveTaskToBack,
        recordRuntimeDiagnostic,
    };
};

describe('applyNativeBackPress', () => {
    it('does nothing when a layer consumed the back press', () => {
        const plugin = buildPlugin();
        expect(applyNativeBackPress(plugin, true)).toBe('handled');
        expect(plugin.moveTaskToBack).not.toHaveBeenCalled();
        expect(plugin.exitApp).not.toHaveBeenCalled();
        expect(plugin.recordRuntimeDiagnostic).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'back-handled' }),
        );
    });

    it('moves the task to the background instead of exiting', () => {
        const plugin = buildPlugin();
        expect(applyNativeBackPress(plugin, false)).toBe('background');
        expect(plugin.moveTaskToBack).toHaveBeenCalledTimes(1);
        expect(plugin.exitApp).not.toHaveBeenCalled();
        expect(plugin.recordRuntimeDiagnostic).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'back-to-background' }),
        );
    });

    // 老桥没有 moveTaskToBack：退回原来的退出行为，至少按键有反应。
    it('falls back to exit when the bridge has no background method', () => {
        const plugin = buildPlugin({ withBackground: false });
        expect(applyNativeBackPress(plugin, false)).toBe('exit');
        expect(plugin.exitApp).toHaveBeenCalledTimes(1);
    });

    it('ignores bridge failures', () => {
        const plugin = buildPlugin();
        plugin.moveTaskToBack?.mockRejectedValueOnce(new Error('bridge gone'));
        expect(() => applyNativeBackPress(plugin, false)).not.toThrow();
    });
});
