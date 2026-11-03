import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    readNativeQueue,
    registerNativeQueue,
    runNativeQueueAction,
} from '../../src/services/nativeMinimalQueue';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../src/utils/appPlaybackGuards';

// test/unit/nativeMinimalQueue.test.ts
//
// 队列快照的回归测试。这里的重点不是"能不能生成快照"，而是
// **注册之后队列变了，读出来的必须是最新那份** —— 线上 0 首就是踩在这上面：
// 注册表里存的是注册那一刻的数组引用，而 playQueue 是换新数组的。

const song = (id: string, name: string) => ({ id, name, artists: [{ name: '黄诗扶' }] }) as never;

const setQueue = (queue: unknown[]) => {
    usePlaybackStore.setState({ playQueue: queue as never });
};

describe('nativeMinimalQueue', () => {
    beforeEach(() => {
        usePlaybackStore.setState({ playQueue: [] as never });
        registerNativeQueue(null);
    });

    it('returns nothing before anything is registered', () => {
        expect(readNativeQueue('a')).toBeNull();
    });

    it('reads the queue that exists *now*, not the one captured at registration', () => {
        registerNativeQueue({
            playQueue: [],
            onPlaySong: vi.fn(),
            onRemoveSong: vi.fn(),
            onMoveSongToNext: vi.fn(),
            onMoveSongToEnd: vi.fn(),
        });
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

    it('bumps the version only when the queue array changes', () => {
        registerNativeQueue({
            playQueue: [],
            onPlaySong: vi.fn(),
            onRemoveSong: vi.fn(),
            onMoveSongToNext: vi.fn(),
            onMoveSongToEnd: vi.fn(),
        });
        setQueue([song('a', 'one')]);
        const first = readNativeQueue('a')!;
        const second = readNativeQueue('a')!;
        expect(second.v).toBe(first.v);

        setQueue([song('a', 'one'), song('b', 'two')]);
        expect(readNativeQueue('a')!.v).toBeGreaterThan(first.v);
    });

    it('routes row actions to the registered handlers, with the live index', () => {
        const onPlaySong = vi.fn();
        const onRemoveSong = vi.fn();
        const onMoveSongToNext = vi.fn();
        const onMoveSongToEnd = vi.fn();
        registerNativeQueue({ playQueue: [], onPlaySong, onRemoveSong, onMoveSongToNext, onMoveSongToEnd });
        const queue = [song('a', 'one'), song('b', 'two')];
        setQueue(queue);

        expect(runNativeQueueAction('play', 1)).toBe(true);
        expect(onPlaySong).toHaveBeenCalledWith(queue[1], queue);
        expect(runNativeQueueAction('remove', 0)).toBe(true);
        expect(onRemoveSong).toHaveBeenCalledWith(0);
        expect(runNativeQueueAction('next', 1)).toBe(true);
        expect(onMoveSongToNext).toHaveBeenCalledWith(1);
        expect(runNativeQueueAction('end', 0)).toBe(true);
        expect(onMoveSongToEnd).toHaveBeenCalledWith(0);
    });

    it('drops out-of-range and unknown actions instead of throwing', () => {
        registerNativeQueue({
            playQueue: [],
            onPlaySong: vi.fn(),
            onRemoveSong: vi.fn(),
            onMoveSongToNext: vi.fn(),
            onMoveSongToEnd: vi.fn(),
        });
        setQueue([song('a', 'one')]);
        expect(runNativeQueueAction('play', 9)).toBe(false);
        expect(runNativeQueueAction('play', -1)).toBe(false);
        expect(runNativeQueueAction('explode', 0)).toBe(false);
    });
});
