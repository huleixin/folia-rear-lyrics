import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"
ok, miss = [], []


def patch(path, pairs):
    p = root + path
    s = io.open(p, encoding="utf-8").read()
    for old, new in pairs:
        if old not in s:
            miss.append((path, old[:50].replace("\n", "⏎")))
            continue
        s = s.replace(old, new, 1)
        ok.append(path)
    io.open(p, "w", encoding="utf-8").write(s)


# ---------- 1. 插件接口 ----------
patch(r"\src\services\nativeChrome.ts", [
    ("""    /** 队列抽屉要的数据。只在打开时或版本变化时推，不是每帧。 */
    minimalQueue(snapshot: import('./nativeMinimalQueue').NativeQueueSnapshot): Promise<void>;""",
     """    /** 队列抽屉要的数据。只在打开时或版本变化时推，不是每帧。 */
    minimalQueue(snapshot: import('./nativeMinimalQueue').NativeQueueSnapshot): Promise<{ accepted: boolean }>;
    /**
     * 让原生打开它自己的队列抽屉。任何页面（首页、舞台、极简页）都走这一个入口，
     * Android 上不再有第二个队列界面。
     */
    openMinimalQueue(): Promise<void>;"""),
])

# ---------- 2. 队列模块：一个"打开原生抽屉"的入口 ----------
patch(r"\src\services\nativeMinimalQueue.ts", [
    ("""import { usePlaybackStore } from '../stores/usePlaybackStore';""",
     """import { usePlaybackStore } from '../stores/usePlaybackStore';
import { chromeNative } from './nativeChrome';"""),

    ("""export function readNativeQueue(currentKey: string): NativeQueueSnapshot | null {""",
     """/** 当前曲的身份。队列高亮与"从哪一首开始"都靠它。 */
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
    try {
        const ack = await chromeNative.minimalQueue(snapshot);
        await chromeNative.openMinimalQueue();
        return ack?.accepted !== false;
    } catch (error) {
        console.warn('[minimal-queue] open failed', error);
        return false;
    }
}

export function readNativeQueue(currentKey: string): NativeQueueSnapshot | null {"""),
])

# ---------- 3. 四个 WebView 入口 ----------
patch(r"\src\components\app\overlays\mobile-stage\MobileStageChrome.tsx", [
    ("""    const openQueue = () => {
        const state = useAppViewStore.getState();
        state.setPanelTab('queue');
        state.setIsPanelOpen(true);
    };""",
     """    const openQueue = () => {
        // Android 上队列只有 Compose 这一份；打不开（非原生环境）才退回旧面板。
        void openNativeQueueSheet().then(handled => {
            if (handled) return;
            const state = useAppViewStore.getState();
            state.setPanelTab('queue');
            state.setIsPanelOpen(true);
        });
    };"""),
    ("""import { useAppViewStore } from""",
     """import { openNativeQueueSheet } from '../../../../services/nativeMinimalQueue';
import { useAppViewStore } from"""),
])

patch(r"\src\components\app\overlays\mobile-stage\MobileStageMenu.tsx", [
    ("""onClick={() => run(() => { const state=useAppViewStore.getState();state.setPanelTab('queue');state.setIsPanelOpen(true); })}""",
     """onClick={() => run(() => { void openNativeQueueSheet().then(handled => { if (handled) return; const state=useAppViewStore.getState();state.setPanelTab('queue');state.setIsPanelOpen(true); }); })}"""),
    ("""import { useAppViewStore } from '../../../../stores/useAppViewStore';""",
     """import { useAppViewStore } from '../../../../stores/useAppViewStore';
import { openNativeQueueSheet } from '../../../../services/nativeMinimalQueue';"""),
])

patch(r"\library\suites\mobile\MobileMiniPlayer.tsx", [
    ("""        const view = useAppViewStore.getState(); view.setPanelTab('queue'); view.setIsPanelOpen(true);""",
     """        void openNativeQueueSheet().then(handled => {
            if (handled) return;
            const view = useAppViewStore.getState(); view.setPanelTab('queue'); view.setIsPanelOpen(true);
        });"""),
])

patch(r"\src\components\app\overlays\minimal-stage\MinimalTransport.tsx", [
    ("""        state.setPanelTab('queue');""",
     """        void openNativeQueueSheet().then(handled => { if (!handled) { state.setPanelTab('queue'); state.setIsPanelOpen(true); } });"""),
])

# ---------- 4. 推送：失败不静默，成功才记版本 ----------
patch(r"\src\hooks\useNativeMinimalPlayer.ts", [
    ("""        if (!queueDirty.current && snapshot.v === queueVersionSent.current) return;
        queueVersionSent.current = snapshot.v;
        queueDirty.current = false;
        void chromeNative.minimalQueue(snapshot).catch(() => undefined);""",
     """        if (!queueDirty.current && snapshot.v === queueVersionSent.current) return;
        // 版本只在**确认送达之后**才记：失败就当没发过，下一次 tick 重试。
        void chromeNative.minimalQueue(snapshot).then(ack => {
            if (ack?.accepted === false) {
                console.warn('[minimal-queue] snapshot rejected', { v: snapshot.v, n: snapshot.n });
                return;
            }
            queueVersionSent.current = snapshot.v;
            queueDirty.current = false;
        }).catch(error => {
            console.warn('[minimal-queue] snapshot failed', { v: snapshot.v, n: snapshot.n, error });
        });"""),
])

print("OK:", sorted(set(ok)))
for f, frag in miss:
    print("MISS:", f, "|", frag)
