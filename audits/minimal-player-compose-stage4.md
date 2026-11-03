# 极简播放器 · 主题、背景与原生队列（第 4 轮）

## 一、字体颜色：不是调色，是**两个主题源**

截图里深蓝背景配深绿字，成因不是配色表错了，是页面同时听了两个主题：

| 用途 | 来源 |
| --- | --- |
| 背景（palette） | JS 的 `controls.isDaylight` —— 播放器/歌曲主题 |
| 文字（ink） | 原生 `InterfaceAppearance.resolve(...)` —— **应用界面**主题 |

两者不是一回事：应用是浅色界面、这一页跟随歌曲是深色时，就会拿到深色配色 + 浅色主题的深墨。
WebView 原版没有这个问题，因为它的 `data-theme` 和 CSS 变量是同一行代码算出来的。

修法：`light` 随帧下发（`useNativeMinimalPlayer` 里和 `palette` 用同一个变量），
原生 `MinimalControls.light` 为 `null` 时才退回界面主题。**现在整页只有一个主题来源。**

## 二、背景断层：三个移动的图层边界

左侧那道竖线、底部那块"漂浮的矩形"，不是渐变没画满，是**每片光斑各自在一个 `graphicsLayer` 里平移**：
图层自身的矩形边界随动画进出屏幕，边界处渐变的非零不透明度被硬切一刀。

修法：三片光斑改到**一张全屏 Canvas** 里，位移写进渐变的圆心（`drawBlob(..., drift)`），
画布恒等于视口 —— 没有任何可被切到的图层边界。颜色过渡（760ms）仍在，只是不再需要图层。
洗色 / 压暗 / 暗角本来就不动，继续用静止的 `drawBehind`，因此整页只有两块绘制工作。

顺带把 `minimalAuroraGlow` 的提亮保留（`l = .62`），否则深色下光斑等于没画。

## 三、原生队列（本轮补上）

```
面板模型（usePlayerPanelModel） ──registerNativeQueue──► nativeMinimalQueue.ts
                                                          │  只读投影 + 动作转交
   frame/快照 ◄──── chromeNative.minimalQueue ─────────────┤
        │                                                 │
        ▼                                                 ▼
  MinimalQueue（Kotlin，带版本）                   onPlaySong / onRemoveSong
        │                                          onMoveSongToNext / onMoveSongToEnd
        ▼
  MinimalQueueSheet（Compose：LazyColumn / 高亮 / 滚动 / 删除 / 排序 / 下滑关闭 / 返回键）
```

- **不复制队列**：`App` 把 `playerPanelModel.panelProps.queue` 注册进 `nativeMinimalQueue`，
  原生发来的行内动作原样转给这四个处理器，和 WebView 队列点下去走的是同一批函数。
- **不整包高频传**：快照带版本号 `v`，只在抽屉打开时推一次、之后**版本变了才推**；
  原生丢弃版本倒退的包（动作是异步的，乱序到达会让列表闪回）。
- **带身份校验**：每条曲目带 `k`（`getPlaybackSongKey`），高亮按 key 而不是下标；
  动作带下标，越界一律丢弃（队列可能比原生手里的快照新）。
- 底部列表按钮现在**只**打开这个抽屉，不再打开 WebView 面板。

## 四、验证

| 项 | 结果 |
| --- | --- |
| Android 单测 | **977 用例 / 0 失败**（新增队列抽屉渲染 1 例） |
| 前端类型 | `tsc --noEmit` 通过 |
| 前端单测 | `nativeMinimalPlayer.test.ts` 7 例通过 |
| 打包 | `assembleRelease`，`COMPOSE_MINIMAL_PLAYER=true` 已核对 |
| 包内 bundle | 含 `queueOpen` / `minimalQueue` / `light` 字段 |

APK：`tingyu-1.3.131-compose-minimal.apk`（原签名，可覆盖正式版），sha256 前缀 `b6d8139b`。

图：`07-cover-dark-r4.png`、`08-cover-light-r4.png`、`09-queue-sheet.png`。

## 五、**未完成 / 未达标**

1. **封面区块仍低约 26dp**（约 3%）。实测：标题 61.6% vs 参考 58.5%，歌手 66.7% vs 64.0%，
   角标 70.2% vs 67.2%；而下半部已对齐（歌词 +0.8%、进度 +0.3%、传输 +0.1%、圆点 −0.5%）。
   也就是说误差集中在「封面底 → 角标」这一段，还没有找到准确的那一项，**本轮没有修掉**。
2. **真机未验证**：没有设备/模拟器，队列的滚动、下滑关闭、返回键、以及与 WebView 的层级
   都只在 Robolectric 的渲染里验证过，没有在真机上跑过。
3. **旧 `minimal-stage/` 未删除**：它仍是开关关闭时的回滚路径，且 `minimalQuality` /
   `minimalPalette` / `useCoverPalette` 被原生复用。队列已原生化，但「Compose 侧全部验收通过」
   这条还没满足（第 1、2 项未闭环），所以不删。

## 六、下一步

1. 用 `tools/measure_player.py` 继续二分「封面底 → 角标」这一段，把 26dp 定位到具体某一行；
2. 真机跑队列：滚动、下滑关闭、返回键、与 WebView 层级；
3. 两项闭环后再清 `minimal-stage/` 的专属 TSX/CSS，保留被复用的模块。
