import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"

# ============ 1. 队列：读实时 store，而不是注册时抓到的数组 ============
p = root + r"\src\services\nativeMinimalQueue.ts"
s = io.open(p, encoding="utf-8").read()

s = s.replace("""import type { SongResult } from '../types';""",
"""import type { SongResult } from '../types';
import { usePlaybackStore } from '../stores/usePlaybackStore';""")

s = s.replace("""let handlers: NativeQueueHandlers | null = null;
let version = 0;
let lastQueue: SongResult[] | null = null;""",
"""let handlers: NativeQueueHandlers | null = null;
let version = 0;
let lastQueue: SongResult[] | null = null;

/**
 * **总是**从 store 读当前队列。
 *
 * 之前这里读的是 `handlers.playQueue` —— 也就是注册那一刻的数组引用。
 * 播放队列是换新数组的（immutable），所以 `App` 一加载完队列，注册表里握着的还是最早那个空数组，
 * 原生于是永远收到 0 首。处理器本身是稳定的，队列不是：处理器注册一次，队列每次现读。
 */
const liveQueue = (): SongResult[] => usePlaybackStore.getState().playQueue ?? [];""")

s = s.replace("""export function readNativeQueue(currentKey: string): NativeQueueSnapshot | null {
    if (!handlers) return null;
    const queue = handlers.playQueue ?? [];""",
"""export function readNativeQueue(currentKey: string): NativeQueueSnapshot | null {
    if (!handlers) return null;
    const queue = liveQueue();""")

s = s.replace("""export function runNativeQueueAction(action: string, index: number): boolean {
    if (!handlers) return false;
    const queue = handlers.playQueue ?? [];""",
"""export function runNativeQueueAction(action: string, index: number): boolean {
    if (!handlers) return false;
    const queue = liveQueue();""")
io.open(p, "w", encoding="utf-8").write(s)

# ============ 2. hook：打开时立刻推、每秒重试一次、overlay 出现时让位 ============
p = root + r"\src\hooks\useNativeMinimalPlayer.ts"
s = io.open(p, encoding="utf-8").read()

s = s.replace("""            detour: usePlayerViewModeStore.getState().detour,""",
"""            detour: usePlayerViewModeStore.getState().detour || webOverlayOpen(),""")

s = s.replace("""/** `order` is the player's name for "no mode at all"; native calls the same state `off`. */""",
"""/**
 * 有没有一块 WebView 弹层正占着屏幕。
 *
 * 音质音效 / 音效 / 歌词 / 播放设置这些面板仍然由 WebView 画，而极简页是整窗原生图层：
 * 不让位的话，JS 状态已经打开、页面却被原生盖住，看起来就是"点了没反应"。
 * 判据和外壳路由用的是同一条（`data-folia-keyboard-window`），再加上面板 store。
 */
const webOverlayOpen = (): boolean => {
    if (typeof document === 'undefined') return false;
    if (useAppViewStore.getState().isPanelOpen) return true;
    if (document.querySelector('[data-folia-keyboard-window="true"]')) return true;
    return false;
};

/** `order` is the player's name for "no mode at all"; native calls the same state `off`. */""")

# 打开抽屉 / 变化时立刻推一次；再挂一个 1s 的兜底重推，防止第一次动作丢失
s = s.replace("""    /** The session this mount owns; a republish must never mint a new one. */""",
"""    // 抽屉开着的时候，每秒把快照对一次版本号：第一次动作丢了也能自愈，且不产生多余流量。
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (queueOpen.current) pushQueue();
        }, PUBLISH_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [pushQueue]);

    /** The session this mount owns; a republish must never mint a new one. */""")
io.open(p, "w", encoding="utf-8").write(s)
print("queue data + overlay yield patched")
