import type { SongResult } from '../types';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { chromeNative } from './nativeChrome';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';
import { getSongArtistLabel } from './onlineMusic/songMetadata';
import { resolvePlaybackMode } from '../utils/playbackMode';
import { useAudioSettingsStore } from '../stores/useAudioSettingsStore';
import { minimalSourceBadgeEnabled, setMinimalSourceBadge } from './minimalSourceDiagnostics';

// src/services/nativeMinimalQueue.ts
//
// 原生队列抽屉的**唯一**数据入口。
//
// 不重新实现队列：这里只是把 `usePlayerPanelModel().panelProps.queue` 注册进来，
// 原生发来的行内动作原样转交给它 —— 和 WebView 队列点下去走的是同一批函数。
//
// 推送分两条通道（第 9 轮）：
//   · 整包快照 `minimalQueue`      —— 队列内容/顺序变了才推（396 条不该反复过桥）。
//   · 轻量当前包 `minimalQueueCurrent` —— 只是切歌或换播放模式，几十字节。
// 每秒一次的对账在 `syncNativeQueue` 里做，什么都没变就一个字节都不发。

export type NativeQueueAction = 'play' | 'remove' | 'next' | 'end' | 'reorder' | 'playbackMode';

export type NativeQueueHandlers = {
    playQueue: SongResult[];
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
    onRemoveSong: (index: number) => void;
    onMoveSongToNext: (index: number) => void;
    onMoveSongToEnd: (index: number) => void;
    /** 任意位置排序（拖拽）。权威实现：复用 moveQueueSong，不删不加、不动播放。缺省时排序动作被丢弃。 */
    onMoveSong?: (from: number, to: number) => void;
};

/** 一条曲目。`u` 是条目身份（含出现序号，队列有重复歌曲也各自唯一），`k` 是歌曲身份。 */
export type NativeQueueItem = { u: string; k: string; t: string; a: string };

export type NativeQueueSnapshot = {
    /** 队列版本：内容或顺序一变就 +1，原生据此判断"要不要重画"。 */
    v: number;
    /** 当前曲在队列里的下标，-1 表示这首歌不在队列里。 */
    i: number;
    /** 当前曲身份（高亮用它，不支持下标）。 */
    ck: string;
    /** 播放模式（off | all | one | shuffle），随包带上，抽屉顶栏按钮直接用。 */
    mode: string;
    n: number;
    items: NativeQueueItem[];
};

let handlers: NativeQueueHandlers | null = null;
let version = 0;
let lastQueue: SongResult[] | null = null;
let lastSentVersion = -1;
let lastSentKey = '';
let lastSentMode = '';
let queueDirty = false;
let syncTimer: number | undefined;

/** 请求下一次对账立刻推整包（动作后、抽屉重开前）。 */
export function markQueueDirty(): void {
    queueDirty = true;
}

/**
 * **总是**从 store 读当前队列。
 *
 * 之前这里读的是 `handlers.playQueue` —— 也就是注册那一刻的数组引用。
 * 播放队列是换新数组的（immutable），所以 `App` 一加载完队列，注册表里握着的还是最早那个空数组，
 * 原生于是永远收到 0 首。处理器本身是稳定的，队列不是：处理器注册一次，队列每次现读。
 */
const liveQueue = (): SongResult[] => usePlaybackStore.getState().playQueue ?? [];

/** 当前曲的身份。队列高亮与"从哪一首开始"都靠它。 */
export function currentQueueKey(): string {
    const song = usePlaybackStore.getState().currentSong;
    return song ? getPlaybackSongKey(song) : '';
}

/** 当前播放模式，读权威 store（`off` 是 `order` 在原生词汇里的名字）。 */
function currentQueueMode(): string {
    const state = useAudioSettingsStore.getState();
    const mode = resolvePlaybackMode(state.shuffleEnabled, state.loopMode);
    return mode === 'order' ? 'off' : mode;
}

/** 条目身份：`songKey#这是这个 key 的第几次出现`。同一首歌出现多次也各自唯一。 */
const uidFor = (queue: SongResult[], index: number, songKey: string): string => {
    let occurrence = 0;
    for (let i = 0; i < index; i += 1) {
        if (getPlaybackSongKey(queue[i]) === songKey) occurrence += 1;
    }
    return `${songKey}#${occurrence}`;
};

export function registerNativeQueue(next: NativeQueueHandlers | null): void {
    handlers = next;
    if (!next) {
        lastQueue = null;
        queueDirty = false;
        if (syncTimer !== undefined && typeof window !== 'undefined') {
            window.clearInterval(syncTimer);
            syncTimer = undefined;
        }
        void detachQueueActionListener();
        return;
    }
    // 注册即开始对账：抽屉在任何页面都可能开着，对账不属于极简页的钩子。
    // 什么都没变时对账是纯内存比较，一个字节都不过桥。
        if (syncTimer === undefined && typeof window !== 'undefined') {
            syncTimer = window.setInterval(() => { syncNativeQueue(); }, 1000);
        }
    void attachQueueActionListener();
}

/**
 * 队列动作的**模块级**监听者。
 *
 * 抽屉是宿主级的：首页迷你条、舞台打开它时，极简页的钩子根本没挂载，
 * 动作只能由这里接。动作集与极简页传输监听者**互不重叠**（那边只管 transport / 菜单），
 * 同一个动作永远不会被两处各执行一次。
 */
let queueActionListener: { remove: () => Promise<void> } | null = null;
async function attachQueueActionListener(): Promise<void> {
    if (queueActionListener) return;
    try {
        queueActionListener = await chromeNative.addListener('action', event => {
            if (event.id !== 'minimal') return;
            const value = typeof event.value === 'number' ? event.value : 0;
            switch (event.action) {
                case 'queuePlay': runNativeQueueAction('play', value); break;
                case 'queueRemove': runNativeQueueAction('remove', value); break;
                case 'queueNext': runNativeQueueAction('next', value); break;
                case 'queueEnd': runNativeQueueAction('end', value); break;
                case 'queueReorder': runNativeQueueAction('reorder', value); break;
                case 'playbackMode': runNativeQueueAction('playbackMode', value); break;
                case 'diagBadge': {
                    const next = !minimalSourceBadgeEnabled();
                    setMinimalSourceBadge(next);
                    break;
                }
                case 'queueOpen': markQueueDirty(); syncNativeQueue(); break;
                default: break; // transport 与菜单动作归极简页钩子，这里不碰。
            }
        });
    } catch {
        queueActionListener = null; // 桥不在（非 Android 环境）就没有动作可接。
    }
}
async function detachQueueActionListener(): Promise<void> {
    const listener = queueActionListener;
    queueActionListener = null;
    try { await listener?.remove(); } catch { /* 已断开就算了。 */ }
}

export function hasNativeQueue(): boolean {
    return handlers !== null;
}

/** 只读快照（供打开抽屉与整包推送）。 */
export function readNativeQueue(currentKey: string): NativeQueueSnapshot | null {
    if (!handlers) return null;
    const queue = liveQueue();
    if (queue !== lastQueue) {
        lastQueue = queue;
        version += 1;
    }
    const items = queue.map((song, index) => {
        const k = getPlaybackSongKey(song);
        return { u: uidFor(queue, index, k), k, t: song.name ?? '', a: getSongArtistLabel(song) };
    });
    const index = items.findIndex(item => item.k === currentKey);
    return { v: version, i: index, ck: currentKey, mode: currentQueueMode(), n: items.length, items };
}

/**
 * 对账：把"原生手里的队列/当前曲/模式"和 store 对一遍，只推差量。
 * 整包只在版本变化（或被标记 dirty）时发；当前曲/模式变化走轻量包。
 */
export function syncNativeQueue(): void {
    if (!handlers) return;
    const key = currentQueueKey();
    const mode = currentQueueMode();
    const queue = liveQueue();
    if (queueDirty || queue !== lastQueue) {
        if (queue !== lastQueue) {
            lastQueue = queue;
            version += 1;
        }
        const snapshot = readNativeQueue(key);
        if (!snapshot) return;
        queueDirty = false;
        lastSentVersion = snapshot.v;
        lastSentKey = key;
        lastSentMode = mode;
        try {
            void chromeNative.minimalQueue(snapshot).catch(() => { queueDirty = true; });
        } catch {
            queueDirty = true; // 非原生环境：不推，也不丢状态。
        }
        return;
    }
    if (lastSentVersion < 0) return; // 还没推过整包，先等打开动作推一次。
    if (key !== lastSentKey || mode !== lastSentMode) {
        const index = queue.findIndex(song => getPlaybackSongKey(song) === key);
        lastSentKey = key;
        lastSentMode = mode;
        try {
            void chromeNative.minimalQueueCurrent({
                v: version, i: index, k: key, mode,
            }).catch(() => { /* 下一秒对账会再推。 */ });
        } catch {
            /* 下一秒对账会再推。 */
        }
    }
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
        lastSentVersion = snapshot.v;
        lastSentKey = snapshot.ck;
        lastSentMode = snapshot.mode;
        return ack?.accepted !== false;
    } catch (error) {
        console.warn('[minimal-queue] open failed', error);
        return false;
    }
}

/** 原生发来的行内动作。索引越界一律丢弃：队列可能比原生手里的快照新。 */
export function runNativeQueueAction(action: string, value: number): boolean {
    if (!handlers) return false;
    const queue = liveQueue();
    // 版本号在数组变化时立刻物化（而不是等下一次读快照）：拖拽校验比较的就是它。
    if (queue !== lastQueue) {
        lastQueue = queue;
        version += 1;
    }
    const inRange = (index: number): boolean => Number.isInteger(index) && index >= 0 && index < queue.length;
    switch (action) {
        case 'play': {
            if (!inRange(value)) return false;
            handlers.onPlaySong(queue[value], queue);
            markQueueDirty();
            syncNativeQueue();
            return true;
        }
        case 'remove': {
            if (!inRange(value)) return false;
            handlers.onRemoveSong(value);
            markQueueDirty();
            syncNativeQueue();
            return true;
        }
        case 'next': {
            if (!inRange(value)) return false;
            handlers.onMoveSongToNext(value);
            markQueueDirty();
            syncNativeQueue();
            return true;
        }
        case 'end': {
            if (!inRange(value)) return false;
            handlers.onMoveSongToEnd(value);
            markQueueDirty();
            syncNativeQueue();
            return true;
        }
        case 'reorder': {
            // value 编码：version*1e8 + from*1e4 + to。版本对不上（拖拽期间队列变了）直接拒绝，
            // 并立刻把真身推回去 —— 抽屉的本地预览在下一包就弹回正确顺序。
            const draggedVersion = Math.floor(value / 1e8);
            const rest = value - draggedVersion * 1e8;
            const from = Math.floor(rest / 1e4);
            const to = Math.round(rest - from * 1e4);
            if (draggedVersion !== version || !inRange(from) || !inRange(to) || !handlers.onMoveSong) {
                markQueueDirty();
                syncNativeQueue();
                return false;
            }
            handlers.onMoveSong(from, to);
            markQueueDirty();
            syncNativeQueue();
            return true;
        }
        case 'playbackMode': {
            useAudioSettingsStore.getState().handleTogglePlaybackMode();
            // 模式变了要让抽屉按钮（和其它页面）马上看到：立刻对账一次。
            syncNativeQueue();
            return true;
        }
        default:
            return false;
    }
}
