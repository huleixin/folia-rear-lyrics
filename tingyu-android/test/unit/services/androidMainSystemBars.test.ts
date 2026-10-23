import { beforeEach, expect, it, vi } from 'vitest';

// test/unit/services/androidMainSystemBars.test.ts
const mocks = vi.hoisted(() => ({ platform: vi.fn(() => 'android'), visible: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: mocks.platform } }));
vi.mock('@/platform/foliaNative', () => ({ getFoliaNative: () => ({ setMainSystemBarsVisible: mocks.visible }) }));
beforeEach(() => { vi.resetModules(); mocks.platform.mockReturnValue('android'); mocks.visible.mockReset().mockResolvedValue(undefined); });
it('deduplicates requested visibility and mirrors both idle hide and touch reveal', async () => {
    const { setAndroidMainSystemBarsVisible: show } = await import('@/services/androidMainSystemBars');
    show(true); show(true); show(false); show(false); show(true);
    expect(mocks.visible.mock.calls).toEqual([[{ visible: true }], [{ visible: false }], [{ visible: true }]]);
});
it('does not touch desktop system UI and retries a rejected native request', async () => {
    const { setAndroidMainSystemBarsVisible: show } = await import('@/services/androidMainSystemBars');
    mocks.platform.mockReturnValue('web'); show(false);
    expect(mocks.visible).not.toHaveBeenCalled();
    mocks.platform.mockReturnValue('android'); mocks.visible.mockRejectedValueOnce(new Error('disconnected'));
    show(false); await Promise.resolve(); show(false);
    expect(mocks.visible).toHaveBeenCalledTimes(2);
});
