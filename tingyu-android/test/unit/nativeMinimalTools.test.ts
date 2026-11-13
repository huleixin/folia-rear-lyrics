import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/nativeMinimalTools.test.ts
//
// 原生工具页（音质/效果器/歌词工具/洛雪音源）的动作路由与监听器守卫。
// 沿用第 10 轮的两个教训：注册只能有一条活着的监听器（代次守卫），
// 动作路由到的必须是既有处理器（这里全部 mock 掉业务面）。

type ActionEvent = { id: string; action: string; value: number };
const registered: Array<{ callback: (event: ActionEvent) => void; removed: boolean }> = [];
let resolveListeners: Array<(value: { remove: () => Promise<void> }) => void> = [];

const setStateMock = vi.fn();

vi.mock('../../src/services/nativeChrome', () => ({
    chromeNative: {
        addListener: (_name: string, callback: (event: ActionEvent) => void) => {
            const entry = { callback, removed: false };
            registered.push(entry);
            return new Promise(resolve => {
                resolveListeners.push(() => resolve({ remove: async () => { entry.removed = true; } }));
            });
        },
        minimalTools: () => Promise.resolve({ accepted: true }),
        openMinimalTools: () => Promise.resolve(),
    },
}));

vi.mock('../../src/stores/useAudioSettingsStore', () => ({
    useAudioSettingsStore: {
        getState: () => ({
            audioQuality: 'lossless',
            audioEqualizerSettings: {
                enabled: true, preset: 'flat',
                gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                effects: { highpass: 20, lowpass: 20000, drive: 0, crush: 0, wow: 0, noise: 0, width: 1, space: 0, punch: 0 },
                customSlots: [
                    { gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], effects: { highpass: 20, lowpass: 20000, drive: 0, crush: 0, wow: 0, noise: 0, width: 1, space: 0, punch: 0 } },
                    { gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], effects: { highpass: 20, lowpass: 20000, drive: 0, crush: 0, wow: 0, noise: 0, width: 1, space: 0, punch: 0 } },
                ],
            },
            handleSetAudioEqualizerSettings: setStateMock,
        }),
    },
}));

const { registerNativeTools, runNativeToolsAction } = await import('../../src/services/nativeMinimalTools');
const { useLxSourceStore } = await import('../../src/stores/useLxSourceStore');
const { omni } = await import('../../src/services/onlineMusic/omni');

const handlers = () => ({
    switchQuality: vi.fn(),
    lyrics: {
        currentSong: null,
        onlineLyricsState: null,
        lyricTimelineOffsetMs: 0,
        onChangeLyricsSource: vi.fn(),
        onChangeOnlineLyricsSource: vi.fn(),
        onMatchOnline: vi.fn(),
        onMatchOnlineLyrics: vi.fn(),
        onUpdateLocalLyrics: vi.fn(),
        onImportOnlineLyrics: vi.fn(),
        onClearOnlineLyricsState: vi.fn(),
        onLyricTimelineOffsetChange: vi.fn(),
    },
});

const flush = async () => {
    const pending = resolveListeners;
    resolveListeners = [];
    pending.forEach(resolve => resolve({ remove: async () => { /* 由 entry.removed 记录 */ } }));
    await Promise.resolve();
    await Promise.resolve();
};

describe('nativeMinimalTools', () => {
    beforeEach(() => {
        registered.length = 0;
        resolveListeners = [];
        registerNativeTools(null);
        setStateMock.mockClear();
        vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    });

    it('a re-registration while an attach is in flight leaves exactly one live listener', async () => {
        registerNativeTools(handlers());
        registerNativeTools(null);
        registerNativeTools(handlers());
        expect(registered).toHaveLength(2);
        await flush();
        expect(registered.filter(entry => entry.removed)).toHaveLength(1);
    });

    it('routes quality picks to the switch chain', () => {
        const h = handlers();
        registerNativeTools(h);
        expect(runNativeToolsAction('qualityPick', 2)).toBe(true);
        expect(h.switchQuality).toHaveBeenCalledWith('lossless');
        expect(runNativeToolsAction('qualityPick', 9)).toBe(false);
    });

    it('encodes band gains as band*100 + gainDb + 12', () => {
        const h = handlers();
        registerNativeTools(h);
        // band 3, -1 dB → 3*100 + (-1+12) = 311
        expect(runNativeToolsAction('effectsBand', 311)).toBe(true);
        expect(setStateMock).toHaveBeenCalledWith(expect.objectContaining({
            gains: [0, 0, 0, -1, 0, 0, 0, 0, 0, 0],
            preset: 'custom1', // 编辑内置预设时自动落到自定义槽
        }));
        // band 3, 0 dB：mock 里 gains[3] 仍是 0，无变化 → 不写 store，但动作本身被接受。
        setStateMock.mockClear();
        expect(runNativeToolsAction('effectsBand', 312)).toBe(true);
        expect(setStateMock).not.toHaveBeenCalled();
    });

    it('encodes effect params as index*10000 + norm(0..1000), log for cutoffs', () => {
        const h = handlers();
        registerNativeTools(h);
        // index 0（低频截止），norm 0.1 → 20 * (2000/20)^0.1 ≈ 32 Hz
        expect(runNativeToolsAction('effectsParam', 100)).toBe(true);
        const call = setStateMock.mock.calls[0][0];
        expect(call.effects.highpass).toBe(Math.round(20 * Math.pow(100, 0.1)));
        // index 1（高频截止），value = 1*10000 + 100（norm 0.1）→ 500 * 40^0.1
        expect(runNativeToolsAction('effectsParam', 10100)).toBe(true);
        expect(setStateMock.mock.calls[1][0].effects.lowpass).toBe(Math.round(500 * Math.pow(40, 0.1)));
    });

    it('routes lyrics offsets and clamps them', () => {
        const h = handlers();
        registerNativeTools(h);
        expect(runNativeToolsAction('lyricsOffset', 300)).toBe(true);
        expect(h.lyrics.onLyricTimelineOffsetChange).toHaveBeenCalledWith(300);
        runNativeToolsAction('lyricsOffset', 999999);
        expect(h.lyrics.onLyricTimelineOffsetChange).toHaveBeenLastCalledWith(60000);
        runNativeToolsAction('lyricsOffset', -999999);
        expect(h.lyrics.onLyricTimelineOffsetChange).toHaveBeenLastCalledWith(-60000);
    });

    it('activating an lx script goes through omni, removing an active one restores first', () => {
        useLxSourceStore.setState({
            scripts: [{ id: 'a', name: 'A', code: 'x' } as never],
            activeId: 'a',
        });
        const activate = vi.spyOn(omni, 'activateLxSource').mockImplementation(() => undefined);
        registerNativeTools(handlers());
        expect(runNativeToolsAction('lxRemove', 0)).toBe(true);
        expect(activate).toHaveBeenCalledWith(null); // 删除使用中的音源先恢复原音源
        expect(useLxSourceStore.getState().scripts).toHaveLength(0);
        activate.mockRestore();
    });
    it('routes native source selection and policy switches through the existing LX store', () => {
        useLxSourceStore.setState({
            scripts: [{ id: 'a', name: 'A', code: 'x' } as never, { id: 'b', name: 'B', code: 'y' } as never],
            activeId: 'a', policy: { autoDowngrade: true, autoSwitch: true, retries: 0, priority: ['kw', 'tx'], preferredSource: null },
        });
        registerNativeTools(handlers());
        expect(runNativeToolsAction('lxSelect', 1)).toBe(true);
        expect(runNativeToolsAction('lxToggleDowngrade', 0)).toBe(true);
        expect(useLxSourceStore.getState().policy.autoDowngrade).toBe(false);
        expect(runNativeToolsAction('lxToggleSwitch', 0)).toBe(true);
        expect(useLxSourceStore.getState().policy.autoSwitch).toBe(false);
    });
});
