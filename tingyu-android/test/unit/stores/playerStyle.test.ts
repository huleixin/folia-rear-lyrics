import { beforeEach, describe, expect, it, vi } from 'vitest';

// Native events outrank late bridge responses; importing appearance never opens the introduction.
const bridge = vi.hoisted(() => ({ native: true, listener: undefined as undefined | ((v: { style: string }) => void),
    addListener: vi.fn(), playerStyle: vi.fn() }));
vi.mock('@/services/nativeChrome', () => ({ chromeNative: bridge }));
vi.mock('@/utils/platform', () => ({ isAndroidNativeRuntime: () => bridge.native }));
beforeEach(() => {
    vi.resetModules(); bridge.native = true; bridge.listener = undefined;
    bridge.addListener.mockReset().mockImplementation(async (_name, callback) => {
        bridge.listener = callback; return { remove: async () => {} };
    });
    bridge.playerStyle.mockReset().mockResolvedValue({ style: 'classic' });
});
describe('shared native player style', () => {
    it('uses one listener across all style entry opens', async () => {
        const store = await import('@/stores/usePlayerStyleStore');
        await store.openPlayerStyles(); await store.openPlayerStyles();
        expect(bridge.addListener).toHaveBeenCalledTimes(1);
        expect(bridge.playerStyle.mock.calls.filter(([v]) => v.open)).toHaveLength(2);
    });
    it('keeps a newer event when a stale initial snapshot arrives', async () => {
        let finish!: (v: { style: string }) => void;
        bridge.playerStyle.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const store = await import('@/stores/usePlayerStyleStore');
        const pending = store.snapshotPlayerStyle();
        await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
        bridge.listener!({ style: 'immersive' }); finish({ style: 'classic' });
        expect(await pending).toBe('immersive');
    });
    it('restores appearance without opening or acknowledging the introduction', async () => {
        const store = await import('@/stores/usePlayerStyleStore');
        await store.snapshotPlayerStyle();
        bridge.playerStyle.mockResolvedValueOnce({ style: 'immersive' });
        await store.restorePlayerStyle('immersive');
        expect(bridge.playerStyle).toHaveBeenLastCalledWith({ style: 'immersive' });
        expect(store.usePlayerStyleStore.getState().style).toBe('immersive');
        await store.restorePlayerStyle('unknown');
        expect(bridge.playerStyle).toHaveBeenCalledTimes(2);
    });
    it('keeps a newer event when appearance restore responds late', async () => {
        const store = await import('@/stores/usePlayerStyleStore');
        await store.snapshotPlayerStyle();
        let finish!: (v: { style: string }) => void;
        bridge.playerStyle.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = store.restorePlayerStyle('immersive');
        bridge.listener!({ style: 'classic' }); finish({ style: 'immersive' });
        await pending; expect(store.usePlayerStyleStore.getState().style).toBe('classic');
    });
    it('retries failed listener registration and rejects invalid native values', async () => {
        const store = await import('@/stores/usePlayerStyleStore');
        bridge.addListener.mockRejectedValueOnce(new Error('bridge unavailable'));
        await expect(store.snapshotPlayerStyle()).rejects.toThrow('bridge unavailable');
        bridge.playerStyle.mockResolvedValueOnce({ style: 'unknown' });
        await expect(store.snapshotPlayerStyle()).rejects.toThrow('Unknown native player style');
        expect(bridge.addListener).toHaveBeenCalledTimes(2);
    });
    it('does not call the Android bridge outside Android', async () => {
        bridge.native = false; const store = await import('@/stores/usePlayerStyleStore');
        expect(await store.snapshotPlayerStyle()).toBe('classic');
        expect(await store.openPlayerStyles()).toBe(false);
        await store.restorePlayerStyle('immersive'); expect(bridge.playerStyle).not.toHaveBeenCalled();
    });
});
