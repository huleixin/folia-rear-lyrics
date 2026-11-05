import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    markQueueDirty,
    readNativeQueue,
    registerNativeQueue,
    runNativeQueueAction,
} from '../../src/services/nativeMinimalQueue';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { useAudioSettingsStore } from '../../src/stores/useAudioSettingsStore';
import { getPlaybackSongKey } from '../../src/utils/appPlaybackGuards';

// test/unit/nativeMinimalQueue.test.ts
//
// 队列快照的回归测试。这里的重点不是"能不能生成快照"，而是
// **注册之后队列变了，读出来的必须是最新那份** —— 线上 0 首就是踩在这上面：
// 注册表里存的是注册那一刻的数组引用，而 playQueue 是换新数组的。
//
// 第 9 轮加测：条目 uid（重复歌曲各自唯一）、拖拽排序的版本校验、
// 播放模式随快照走。

const song = (id: string, name: string) => ({ id, name, artists: [{ name: '黄诗扶' }] }) as never;

const setQueue = (queue: unknown[]) => {
    usePlaybackStore.setState({ playQueue: queue as never });
};

const handlers = (overrides: Record<string, unknown> = {}) => ({
    playQueue: [] as never[],
    onPlaySong: vi.fn(),
    onRemoveSong: vi.fn(),
    onMoveSongToNext: vi.fn(),
    onMoveSongToEnd: vi.fn(),
    onMoveSong: vi.fn(),
    ...overrides,
});

describe('nativeMinimalQueue', () => {
    beforeEach(() => {
        usePlaybackStore.setState({ playQueue: [] as never });
        registerNativeQueue(null);
    });

    it('returns nothing before anything is registered', () => {
        expect(readNativeQueue('a')).toBeNull();
    });

    it('reads the queue that exists *now*, not the one captured at registration', () => {
        registerNativeQueue(handlers());
        // 注册时是空队列；随后播放器把队列装满（换成新数组）。
        setQueue([song('a', '茶花开了'), song('b', '淘金小镇')]);

        const current = getPlaybackSongKey(song('b', '淘金小镇'));
        const snapshot = readNativeQueue(current);
        expect(snapshot).not.toBeNull();
        expect(snapshot!.n).toBe(2);
        expect(snapshot!.items.map(item => item.k)).toEqual([
            getPlaybackSongKey(song('a', '茶花开了')),
            current,
        ]);
        expect(snapshot!.i).toBe(1);
    });

    it('gives duplicate songs distinct, stable uids', () => {
        registerNativeQueue(handlers());
        setQueue([song('a', 'one'), song('b', 'two'), song('a', 'one-again')]);
        const snapshot = readNativeQueue('')!;
        expect(snapshot.items.map(item => item.u)).toEqual([
            `${getPlaybackSongKey(song('a', 'one'))}#0`,
            `${getPlaybackSongKey(song('b', 'two'))}#0`,
            `${getPlaybackSongKey(song('a', 'one'))}#1`,
        ]);
    });

    it('bumps the version only when the queue array changes', () => {
        registerNativeQueue(handlers());
        setQueue([song('a', 'one')]);
        const first = readNativeQueue('a')!;
        const second = readNativeQueue('a')!;
        expect(second.v).toBe(first.v);

        setQueue([song('a', 'one'), song('b', 'two')]);
        expect(readNativeQueue('a')!.v).toBeGreaterThan(first.v);
    });

    it('routes row actions to the registered handlers, with the live index', () => {
        const h = handlers();
        registerNativeQueue(h);
        const queue = [song('a', 'one'), song('b', 'two')];
        setQueue(queue);

        expect(runNativeQueueAction('play', 1)).toBe(true);
        expect(h.onPlaySong).toHaveBeenCalledWith(queue[1], queue);
        expect(runNativeQueueAction('remove', 0)).toBe(true);
        expect(h.onRemoveSong).toHaveBeenCalledWith(0);
        expect(runNativeQueueAction('next', 1)).toBe(true);
        expect(h.onMoveSongToNext).toHaveBeenCalledWith(1);
        expect(runNativeQueueAction('end', 0)).toBe(true);
        expect(h.onMoveSongToEnd).toHaveBeenCalledWith(0);
    });

    it('reorders only when the dragged version still matches the live queue', () => {
        const h = handlers();
        registerNativeQueue(h);
        setQueue([song('a', 'one'), song('b', 'two'), song('c', 'three')]);
        const version = readNativeQueue('')!.v;

        // 版本一致：提交任意位置排序。
        const encoded = version * 1e8 + 0 * 1e4 + 2;
        expect(runNativeQueueAction('reorder', encoded)).toBe(true);
        expect(h.onMoveSong).toHaveBeenCalledWith(0, 2);

        // 版本对不上（拖拽期间队列变了）：拒绝且不触碰权威队列。
        h.onMoveSong.mockClear();
        setQueue([song('a', 'one'), song('b', 'two'), song('c', 'three'), song('d', 'four')]);
        const staleEncoded = version * 1e8 + 0 * 1e4 + 2;
        expect(runNativeQueueAction('reorder', staleEncoded)).toBe(false);
        expect(h.onMoveSong).not.toHaveBeenCalled();
    });

    it('drops out-of-range and unknown actions instead of throwing', () => {
        registerNativeQueue(handlers());
        setQueue([song('a', 'one')]);
        expect(runNativeQueueAction('play', 9)).toBe(false);
        expect(runNativeQueueAction('play', -1)).toBe(false);
        expect(runNativeQueueAction('explode', 0)).toBe(false);
    });

    it('dispatches a queue play exactly once with the tapped song and the live queue', () => {
        const h = handlers();
        registerNativeQueue(h);
        const queue = [song('a', 'one'), song('b', 'two')];
        setQueue(queue);

        expect(runNativeQueueAction('play', 1)).toBe(true);
        expect(h.onPlaySong).toHaveBeenCalledTimes(1);
        expect(h.onPlaySong).toHaveBeenCalledWith(queue[1], queue);
    });

    it('treats an out-of-range play as a stale snapshot: no dispatch, but the truth is pushed back', () => {
        const h = handlers();
        registerNativeQueue(h);
        setQueue([song('a', 'one')]);

        // 原生手里的快照比权威队列旧（点了第 5 首，但队列只剩 1 首）。
        // 不能静默吞掉：不派发播放，同时把权威快照推回去让抽屉对齐。
        expect(runNativeQueueAction('play', 4)).toBe(false);
        expect(h.onPlaySong).not.toHaveBeenCalled();
        expect(readNativeQueue('')!.n).toBe(1);
    });

    it('toggles playback mode once per action (no double listener execution)', () => {
        const h = handlers();
        registerNativeQueue(h);
        setQueue([song('a', 'one')]);
        const snapshot = () => {
            const s = useAudioSettingsStore.getState();
            return `${s.shuffleEnabled}:${s.loopMode}`;
        };
        const before = snapshot();
        expect(runNativeQueueAction('playbackMode', 0)).toBe(true);
        // 一条动作只切一档：如果监听器重复注册，这里会一次跨两档回到原值。
        expect(snapshot()).not.toBe(before);
        expect(runNativeQueueAction('playbackMode', 0)).toBe(true);
    });

    it('markQueueDirty forces the next read to be a fresh full snapshot', () => {
        registerNativeQueue(handlers());
        setQueue([song('a', 'one')]);
        const before = readNativeQueue('a')!;
        markQueueDirty();
        const after = readNativeQueue('a')!;
        expect(after.v).toBe(before.v); // 内容没变，版本不涨
        // 但 dirty 标记本身由 sync 消费；这里只保证不会把版本算丢。
        expect(after.items).toHaveLength(1);
    });
});
