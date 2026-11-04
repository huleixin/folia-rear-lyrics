import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/nativeQueueListenerRace.test.ts
//
// **线上「播放模式只能在顺序播放和单曲循环之间切换」的回归测试。**
//
// 根因链：App 的注册 effect 依赖频繁重建的 playerPanelModel → register(null)→register(next)
// 高频往复 → 模块里的动作监听器 async attach，await 回来之前 queueActionListener 还是 null，
// 卸载读不到它、旧监听器永远拆不掉 → 泄漏的每一条让原生动作**多执行一次**：
// 播放模式一点走两步（order→all→one 显示成 one），四态看起来就在两态之间跳。
//
// 这里用假的 chromeNative 把竞态精确复现出来，并守住修复后的不变量：
// **无论注册往复多少次、await 以什么顺序兑现，同时活着的监听器只有一条。**

type ActionEvent = { id: string; action: string; value: number };

const registered: Array<{ callback: (event: ActionEvent) => void; removed: boolean }> = [];
let resolveListeners: Array<(value: { remove: () => Promise<void> }) => void> = [];

vi.mock('../../src/services/nativeChrome', () => ({
    chromeNative: {
        addListener: (_name: string, callback: (event: ActionEvent) => void) => {
            const entry = { callback, removed: false };
            registered.push(entry);
            return new Promise(resolve => {
                resolveListeners.push(() => resolve({
                    remove: async () => { entry.removed = true; },
                }));
            });
        },
        minimalQueue: () => Promise.resolve({ accepted: true }),
        minimalQueueCurrent: () => Promise.resolve(),
    },
}));

const { registerNativeQueue, runNativeQueueAction } = await import('../../src/services/nativeMinimalQueue');
const { useAudioSettingsStore } = await import('../../src/stores/useAudioSettingsStore');
const { resolvePlaybackMode } = await import('../../src/utils/playbackMode');

const handlers = () => ({
    playQueue: [] as never[],
    onPlaySong: vi.fn(),
    onRemoveSong: vi.fn(),
    onMoveSongToNext: vi.fn(),
    onMoveSongToEnd: vi.fn(),
    onMoveSong: vi.fn(),
});

/** 兑现所有挂在桥上的 addListener promise（按序或乱序由调用方控制）。 */
const flushAttaches = async () => {
    const pending = resolveListeners;
    resolveListeners = [];
    pending.forEach(resolve => resolve({ remove: async () => { /* 由 entry.removed 记录 */ } }));
    await Promise.resolve();
    await Promise.resolve();
};

/** 只给**还活着**的监听器发事件（模拟原生 notifyListeners 的真实行为）。 */
const dispatchToLiveListeners = (event: ActionEvent) => {
    registered.filter(entry => !entry.removed).forEach(entry => entry.callback(event));
};

const currentMode = () => {
    const state = useAudioSettingsStore.getState();
    return resolvePlaybackMode(state.shuffleEnabled, state.loopMode);
};

describe('native queue action listener race', () => {
    beforeEach(() => {
        registered.length = 0;
        resolveListeners = [];
        registerNativeQueue(null);
        useAudioSettingsStore.setState({ loopMode: 'off', shuffleEnabled: false });
    });

    it('a re-registration while an attach is in flight leaves exactly one live listener', async () => {
        // 第 1 次注册：attach 挂起（promise 未兑现）。
        registerNativeQueue(handlers());
        // 模型重建 → 卸载再注册：此刻第一条 attach 还在飞。
        registerNativeQueue(null);
        registerNativeQueue(handlers());
        // 两条 addListener 都已发出，还没兑现。
        expect(registered).toHaveLength(2);
        expect(registered.every(entry => !entry.removed)).toBe(true);

        await flushAttaches();

        // 修复的不变量：过期的那条自拆，活着的只有一条。
        const removedCount = registered.filter(entry => entry.removed).length;
        expect(removedCount).toBe(1);
    });

    it('out-of-order resolution still leaves exactly one live listener', async () => {
        registerNativeQueue(handlers()); // attach #1（慢）
        registerNativeQueue(null);
        registerNativeQueue(handlers()); // attach #2（快）
        // 乱序兑现：#2 先回，#1 后回。
        const second = resolveListeners[1];
        resolveListeners = [resolveListeners[0]];
        second({ remove: async () => { registered[1].removed = true; } });
        await Promise.resolve();
        const first = resolveListeners[0];
        resolveListeners = [];
        first({ remove: async () => { registered[0].removed = true; } });
        await Promise.resolve();
        await Promise.resolve();

        // 后兑现的 #1 是过期的：必须自拆，不能盖掉 #2。
        expect(registered[0].removed).toBe(true);
        expect(registered[1].removed).toBe(false);
    });

    it('one playbackMode event advances the mode exactly one step (no double execution)', async () => {
        registerNativeQueue(handlers());
        registerNativeQueue(null);
        registerNativeQueue(handlers());
        await flushAttaches();

        dispatchToLiveListeners({ id: 'minimal', action: 'playbackMode', value: 0 });
        expect(currentMode()).toBe('all');
        dispatchToLiveListeners({ id: 'minimal', action: 'playbackMode', value: 0 });
        expect(currentMode()).toBe('one');
        dispatchToLiveListeners({ id: 'minimal', action: 'playbackMode', value: 0 });
        expect(currentMode()).toBe('shuffle');
        dispatchToLiveListeners({ id: 'minimal', action: 'playbackMode', value: 0 });
        expect(currentMode()).toBe('order');
    });

    it('a leaked listener (pre-fix behaviour) would skip modes — guards the invariant by contrast', async () => {
        // 对照组：假如两条监听都活着（旧 bug），一次事件走两步。这条测试钉住
        // "一次事件 = 一步"，防止将来把代次守卫又改回去。
        registerNativeQueue(handlers());
        registerNativeQueue(null);
        registerNativeQueue(handlers());
        await flushAttaches();
        expect(registered.filter(entry => !entry.removed)).toHaveLength(1);
    });

    it('runNativeQueueAction keeps the four-state cycle intact through the module path', () => {
        registerNativeQueue(handlers());
        runNativeQueueAction('playbackMode', 0);
        expect(currentMode()).toBe('all');
        runNativeQueueAction('playbackMode', 0);
        expect(currentMode()).toBe('one');
        runNativeQueueAction('playbackMode', 0);
        expect(currentMode()).toBe('shuffle');
        runNativeQueueAction('playbackMode', 0);
        expect(currentMode()).toBe('order');
    });
});
