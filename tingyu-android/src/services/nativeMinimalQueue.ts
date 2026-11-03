import type { SongResult } from '../types';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { chromeNative } from './nativeChrome';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { getSongArtistLabel } from './onlineMusic/songMetadata';

// src/services/nativeMinimalQueue.ts
//
// 原生队列抽屉的**唯一**数据入口。
//
// 不重新实现队列：这里只是把 `usePlayerPanelModel().panelProps.queue` 注册进来，
// 原生发来的行内动作原样转交给它 —— 和 WebView 队列点下去走的是同一批函数。
// 快照也只读 `playQueue` 与本曲 key，不复制、不过滤、不排序。

export type NativeQueueAction = 'play' | 'remove' | 'next' | 'end';

export type NativeQueueHandlers = {
    playQueue: SongResult[];
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
    onRemoveSong: (index: number) => void;
    onMoveSongToNext: (index: number) => void;
    onMoveSongToEnd: (index: number) => void;
};

/** 一条曲目。`k` 是身份（切歌/高亮都靠它），标题与歌手只用于显示。 */
export type NativeQueueItem = { k: string; t: string; a: string };

export type NativeQueueSnapshot = {
    /** 队列版本：内容或顺序一变就 +1，原生据此判断"要不要重画"。 */
    v: number;
    /** 当前曲在队列里的下标，-1 表示这首歌不在队列里。 */
    i: number;
    n: number;
    items: NativeQueueItem[];
};

let handlers: NativeQueueHandlers | null = null;
let version = 0;
let lastQueue: SongResult[] | null = null;

/**
 * **总是**从 store 读当前队列。
 *
 * 之前这里读的是 `handlers.playQueue` —— 也就是注册那一刻的数组引用。
 * 播放队列是换新数组的（immutable），所以 `App` 一加载完队列，注册表里握着的还是最早那个空数组，
 * 原生于是永远收到 0 首。处理器本身是稳定的，队列不是：处理器注册一次，队列每次现读。
 */
const liveQueue = (): SongResult[] => usePlaybackStore.getState().playQueue ?? [];

export function registerNativeQueue(next: NativeQueueHandlers | null): void {
    handlers = next;
    if (!next) {
        lastQueue = null;
    }
}

export function hasNativeQueue(): boolean {
    return handlers !== null;
}

/**
 * 只读快照。队列没变就返回同一个 `v`，调用方据此跳过推送 —— 396 条不该每秒过桥。
 */
/** 当前曲的身份。队列高亮与"从哪一首开始"都靠它。 */
export function currentQueueKey(): string {
    const song = usePlaybackStore.getState().currentSong;
    return song ? getPlaybackSongKey(song) : '';
}

/**
 * 打开原生队列抽屉。**所有页面的唯一入口。**
 *
 * 先推快照再开门：门开了但数据还在路上，用户看到的是"加载中"而不是"队列为空"。
 * 返回 false 才让调用方退回 WebView 面板（非 Android 环境）。
 */
export async function openNativeQueueSheet(): Promise<boolean> {
    if (!handlers) return false;
    const snapshot = readNativeQueue(currentQueueKey());
    if (!snapshot) return false;
    // 诊断锚点：logcat 里应能看到配对的 TingyuQueue "snapshot v=… n=…"。
    console.info('[minimal-queue] open v=' + snapshot.v + ' n=' + snapshot.n + ' i=' + snapshot.i);
    try {
        const ack = await chromeNative.minimalQueue(snapshot);
        await chromeNative.openMinimalQueue();
        return ack?.accepted !== false;
    } catch (error) {
        console.warn('[minimal-queue] open failed', error);
        return false;
    }
}

export function readNativeQueue(currentKey: string): NativeQueueSnapshot | null {
    if (!handlers) return null;
    const queue = liveQueue();
    if (queue !== lastQueue) {
        lastQueue = queue;
        version += 1;
    }
    const items = queue.map(song => ({
        k: getPlaybackSongKey(song),
        t: song.name ?? '',
        a: getSongArtistLabel(song),
    }));
    const index = items.findIndex(item => item.k === currentKey);
    return { v: version, i: index, n: items.length, items };
}

/** 原生发来的行内动作。索引越界一律丢弃：队列可能比原生手里的快照新。 */
export function runNativeQueueAction(action: string, index: number): boolean {
    if (!handlers) return false;
    const queue = liveQueue();
    if (!Number.isInteger(index) || index < 0 || index >= queue.length) return false;
    switch (action) {
        case 'play':
            handlers.onPlaySong(queue[index], queue);
            return true;
        case 'remove':
            handlers.onRemoveSong(index);
            return true;
        case 'next':
            handlers.onMoveSongToNext(index);
            return true;
        case 'end':
            handlers.onMoveSongToEnd(index);
            return true;
        default:
            return false;
    }
}
