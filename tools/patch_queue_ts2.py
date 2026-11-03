import io

root = r"C:\Users\DELL\WorkBuddy\2026-11-04-00-12-04\repo\tingyu-android"

# ---------- 3. 分发器：原生队列的四个动作 + 打开/关闭 ----------
p = root + r"\src\services\nativeMinimalPlayer.ts"
s = io.open(p, encoding="utf-8").read()

s = s.replace(
    """    /** 顶栏"更多"菜单的五项，和 `MobileStageMenu` 一一对应。 */
    openAudioQuality: () => void;
    openAudioEffects: () => void;
    openLyricsPanel: () => void;
    openPlaybackSettings: () => void;""",
    """    /** 顶栏"更多"菜单的五项，和 `MobileStageMenu` 一一对应。 */
    openAudioQuality: () => void;
    openAudioEffects: () => void;
    openLyricsPanel: () => void;
    openPlaybackSettings: () => void;
    /** 原生抽屉打开/关闭：打开时推一次快照，关闭后不再推。 */
    openQueueSnapshot: () => void;
    closeQueueSnapshot: () => void;
    /** 行内动作，`value` 是行下标。 */
    queueAction: (action: string, index: number) => void;""")

s = s.replace(
    """        case 'queue':
            handlers.openQueue();
            return true;""",
    """        case 'queue':
            handlers.openQueue();
            return true;
        case 'queueOpen':
            handlers.openQueueSnapshot();
            return true;
        case 'queueClose':
            handlers.closeQueueSnapshot();
            return true;
        case 'queuePlay':
            handlers.queueAction('play', value);
            return true;
        case 'queueRemove':
            handlers.queueAction('remove', value);
            return true;
        case 'queueNext':
            handlers.queueAction('next', value);
            return true;
        case 'queueEnd':
            handlers.queueAction('end', value);
            return true;""")
io.open(p, "w", encoding="utf-8").write(s)

# ---------- 4. hook 里 openQueue 也要把快照推过去（底部列表按钮走这里） ----------
p = root + r"\src\hooks\useNativeMinimalPlayer.ts"
s = io.open(p, encoding="utf-8").read()
s = s.replace(
    """                openQueue: () => {
                    const view = useAppViewStore.getState();
                    view.setPanelTab('queue');
                    view.setIsPanelOpen(true);
                },""",
    """                openQueue: () => {
                    // 原生抽屉自己画，不再打开 WebView 面板；只把数据推过去。
                    queueOpen.current = true;
                    queueDirty.current = true;
                    pushQueue();
                },""")
io.open(p, "w", encoding="utf-8").write(s)
print("dispatch wired")
