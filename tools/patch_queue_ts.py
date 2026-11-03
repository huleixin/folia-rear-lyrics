import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"

# ---------- 1. 插件接口：原生 ← JS 的队列快照 ----------
p = root + r"\src\services\nativeChrome.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace(
    """    minimalPlayerFrame(frame: import('./nativeMinimalPlayer').MinimalPlayerFrame): Promise<{accepted:boolean}>;""",
    """    minimalPlayerFrame(frame: import('./nativeMinimalPlayer').MinimalPlayerFrame): Promise<{accepted:boolean}>;
    /** 队列抽屉要的数据。只在打开时或版本变化时推，不是每帧。 */
    minimalQueue(snapshot: import('./nativeMinimalQueue').NativeQueueSnapshot): Promise<void>;""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 2. hook：队列动作与推送 ----------
p = root + r"\src\hooks\useNativeMinimalPlayer.ts"
s = io.open(p, encoding="utf-8").read()

s = s.replace(
    """import { canUseComposeChrome } from '../services/nativeChrome';""",
    """import { canUseComposeChrome, chromeNative } from '../services/nativeChrome';
import { readNativeQueue, runNativeQueueAction } from '../services/nativeMinimalQueue';""")

# 队列动作：原生发来的 action，值当行下标
s = s.replace(
    """                openPlaybackSettings: () => openSettings('options', 'playback'),""",
    """                openPlaybackSettings: () => openSettings('options', 'playback'),
                // 队列：原生抽屉打开时把快照推过去；行内动作原样交给原版处理器。
                openQueueSnapshot: () => {
                    queueDirty.current = true;
                    pushQueue();
                },
                closeQueueSnapshot: () => {
                    queueOpen.current = false;
                },
                queueAction: (action, index) => {
                    if (runNativeQueueAction(action, index)) queueDirty.current = true;
                    pushQueue();
                },""")

# 推送函数与状态
s = s.replace(
    """    const paletteRef = useRef(palette);
    paletteRef.current = palette;""",
    """    const paletteRef = useRef(palette);
    paletteRef.current = palette;

    // 队列推送：只在抽屉打开后、且版本变了才发。396 条曲目一秒一包是不可接受的。
    const queueOpen = useRef(false);
    const queueDirty = useRef(false);
    const queueVersionSent = useRef(-1);
    const pushQueue = useCallback(() => {
        const currentKey = latest.current.chrome?.song?.track
            ? getPlaybackSongKey(latest.current.chrome.song.track)
            : '';
        const snapshot = readNativeQueue(currentKey);
        if (!snapshot) return;
        if (!queueDirty.current && snapshot.v === queueVersionSent.current) return;
        queueVersionSent.current = snapshot.v;
        queueDirty.current = false;
        void chromeNative.minimalQueue(snapshot).catch(() => undefined);
    }, []);""")
io.open(p, "w", encoding="utf-8").write(s)
print("ts wired")
