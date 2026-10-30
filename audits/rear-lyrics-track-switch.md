# 背屏歌词切歌不同步：根因、修复与验证计划（commit 46cc7f4 / 05440b9）

设备：小米 17 Pro / HyperOS 4 · 分支 `rear-plan-a` · 版本 1.3.50 / 74 · 签名 `CN=Tingyu` 未变
本轮只做两件事：**共性歌词切歌同步**（46cc7f4）与 **Shizuku 锁屏唤醒**（05440b9），两个独立提交、可分别回滚。

> 真机状态：本机无 adb 设备可读 crash buffer，以下结论来自代码链路推演 + JVM/JS 单测，**未经小米 17 Pro 真机验证**。第 6 节给出导出 `lock_trace` 的办法，回来即可定性。

---

## 1. 首次切歌卡住的真实代码原因

### 1.1 数据链现状（改前）

```
Media3 当前 MediaItem
  └─ NativeAudioEngine.onMediaItemTransition ──▶ FoliaPlaybackService.publishQueuedTrack（锁屏歌词/通知）
  └─ SongInfoLoader  ──▶ NativeLyricsRepository ──▶ ColorOsLyricBridge（锁屏歌词总线，与背屏无关）

主界面 WebView useRearLyricsPublisher（每 100 ms 调 publishRearLyricsSnapshot）
  └─ RearLyricsState.apply(clock/config/audio)   ← 只有这一条来源
       └─ 背屏 transport 轮询 /__folia_rear/state
            └─ createRearClockSynchronizer.accept(clock) ──▶ 渲染逐字高亮
```

背屏拿到的 **歌词（`config.lyrics`）和时钟（`clock`）唯一来源**都是主界面 WebView 的发布。

### 1.2 为什么会停在上一首末尾

| 链路 | 前台 | 锁屏 / 主 Activity 进后台 |
|---|---|---|
| `useRearLyricsPublisher` 每 100 ms 发布 | ✅ | **Chromium 冻结该 WebView → 停止发布** |
| `RearLyricsState.clock` | 更新 | **停在最后一次快照** |
| `createRearClockSynchronizer` | 正常 | 拿同一个 `timelineId` 继续外推 `currentTime += now - sentAtMs` |
| `config.lyrics` | 更新 | **永远是第一首的行** |
| 背景动画 | 运行 | **运行**（`requestAnimationFrame` 不依赖快照） |

于是三个症状同时对上：**时间轴越过末句 → 行索引夹在最后一行 → 背景照常动**。
这正是「歌词停在第一首最后一屏、背景还在跑」，且 LSP / Shizuku **都必然出现**——两者都不参与歌词数据链。

### 1.3 四层判定（对应你要求的区分）

| 层 | 结论 | 证据 |
|---|---|---|
| 事件没发出？ | 否 | `onMediaItemTransition` 正常触发，`publishQueuedTrack` 一直在跑（否则通知/锁屏歌词也会停） |
| 消息没送达？ | 否 | 背屏轮询 `/__folia_rear/state` 一直成功，只是内容不再变 |
| 歌词不存在？ | **否** | `SongInfoLoader` 早已为当前曲 + 后 2 首预取并落盘（C3 的成果），但只喂给了 `ColorOsLyricBridge`，**从没以背屏需要的形状暴露过** |
| 时钟没更新？ | **是（主因）** | 唯一的时钟发布者在后台被冻结 |
| 渲染没有切换？ | 是（连带） | `config.lyrics` 一直带着旧 `song.id` |

**一句话**：Media3 是切了的，原生也有歌词，唯独背屏的数据入口只有一个，而那个入口在后台就不存在了。

---

## 2. 修复（最小范围）

### 2.1 让 Media3 成为背屏可见的权威

新增 `RearNativeTrack`（commit 46cc7f4）：

- 身份 = `MediaItem.mediaId`（即 songKey），与 `publishQueuedTrack` 同源，随机播放不会错配；
- **换曲递增 `epoch`**（`songKey#generation`），异步结果用它做代次校验，旧歌回调永远无法覆盖新歌；
- 位置 = 锚点 + `SystemClock.elapsedRealtime()` 外推，**不轮询 Player**（非应用线程调用 `Player` 会直接抛 `IllegalStateException`，这也是为什么不能简单在这一侧补一个 getter）；
- `positionNow()` 被 `durationMs` 夹住，避免越过曲末继续涨。

接线点只有三处、全在应用线程：`onMediaItemTransition` / `onIsPlayingChanged` / `onPlayWhenReadyChanged`。

### 2.2 把已有歌词交给背屏

新增 `RearNativeLyricLines` + `/__folia_rear/lyrics`：只读原生已缓存歌词，**不联网**（联网仍归 `SongInfoLoader` 管，两件事不混），转成背屏的 `LyricData` 行结构；epoch 不符返回 `stale`，由调用方丢弃。

### 2.3 Transport 的接管规则（`rearLyricsTransport.ts`）

```
新 epoch 到达 ──▶ 立即 patch config（song.id / 空行），不清空背景与字体 → 视觉不闪
              ──▶ 主界面 WebView 仍新鲜(sentAtMs ≤ 2.5 s)：保留它的逐字/翻译歌词，不降级
              ──▶ 已冻结：接管时钟（timelineId = native:<songKey>），从新歌 position 重启
              ──▶ 歌词未到：渲染空行 + 有限重试（8 × 1.5 s），绝不保留上一首末句
```

关键取舍：**「加载中」必须长成什么都没有，而不是长成旧歌词。**

### 2.4 Shizuku 锁屏（commit 05440b9，独立可回滚）

- 旧行为：整场会话只有一个唤醒名额（`wakeTried`），锁屏前一次抖动用掉后，**整个锁屏周期不再尝试** → 表现为「背屏歌词被关闭」。
- 新行为：`RearLockWakeBudget` **每次锁屏独立预算、封顶 3 次**；LSP 侧 `lockStarted(true)` → `take()` 恒 false，**LSP 行为完全不变**。
- `lock-probe` 诊断把四种「背屏消失」写成不同判词：
  `panel-off`（面板熄灭）/ `window-not-on-rear`（被移走）/ `window-not-rendering`（在但不画）/ `window-visible`（被官方中心或锁屏层盖住，这时再 wake 也没用）。

---

## 3. 修改文件清单

### 提交 1 · 歌词同步 `46cc7f4`

| 文件 | 改动 |
|---|---|
| `RearNativeTrack.java` | 新增 · Media3 当前歌曲权威（songKey / epoch / 位置外推） |
| `RearNativeLyricLines.java` | 新增 · 原生歌词缓存 → 背屏行结构，`stale` 守卫 |
| `RearLyricsWebClient.java` | 新增 `/__folia_rear/lyrics`、`/__folia_rear/trace` |
| `RearLyricsState.java` | 每个 state 包都带 `track`（重连时无需等主 WebView 就能知道换歌了） |
| `RearLyricsTrace.java` | `record` 改为 public，让 `playback` 包也能写入同一份 trace |
| `playback/NativeAudioEngine.java` | 三个回调喂养 `RearNativeTrack`；写 `media3-track` 诊断 |
| `rearLyricsTransport.ts` | epoch 接管 / 空行优先 / 时钟来源切换 / 诊断上报 |
| `rearStateRelay.ts` | 快照类型增加 `track` |
| `RearNativeLyricLinesTest.java` | 新增 4 项 |
| `test/unit/services/rearTrackSwitch.test.ts` | 新增 5 项 |

### 提交 2 · Shizuku 锁屏 `05440b9`

| 文件 | 改动 |
|---|---|
| `RearLockWakeBudget.java` | 新增 · 纯逻辑唤醒预算 |
| `RearLyricsCoordinator.java` | SCREEN_OFF 按后端分流、`checkWindow` 用预算、`lock-probe` 诊断 |
| `RearLockWakeBudgetTest.java` | 新增 4 项 |

**没有碰**：Media3 播放内核、音源解析、歌词获取源（LRCLIB/酷狗/QQ）、锁屏时间（C1）、LSP 相机与窗口控制、背屏布局与视觉效果、版本号。

---

## 4. 诊断：你需要记录的四层 songKey 现在都在一份 trace 里

原生 new trace 事件：

| 事件 | 内容 | 谁写 |
|---|---|---|
| `media3-track` | Media3 当前 songKey（匿名）+ epoch + 标题 + index + playing | `NativeAudioEngine` |
| `rear/switch` | 背屏**收到**的新 epoch、（来自哪个源 webview / native）、positionMs、playing | 背屏 renderer |
| `rear/lyrics`·`rear/render` | 原生歌词 songKey / state（ready / loading / none / stale）+ **实际渲染行数** | 背屏 renderer |
| `rear/clock` | 时钟来源（webview / native） | 背屏 renderer |
| `lock-probe` | 四种消失形态之一 + occupancy / ownership / lease 全量状态 | 协调器 |
| `power-event` | SCREEN_OFF / SCREEN_ON / USER_PRESENT | 协调器 |

每行自动带上 `locked=` `mainPower=` `rearPower=` `shizuku=`。

---

## 5. 自动化测试结果

| 套件 | 结果 |
|---|---|
| Android 全量单测 | **414 通过 / 0 失败** |
| `RearLockWakeBudgetTest` | 4 通过（含「LSP 恒不自行唤醒」「切到有 hook 的后端立即停」） |
| `RearNativeLyricLinesTest` | 4 通过 |
| `rearTrackSwitch.test.ts` | 5 通过（含诊断上报去重） |
| `rearTransportSleep` / `rearStateRelay` | 5 通过 |
| 前端全量 687 文件 | 15 失败 —— **全部为此前在干净树上复现过的既有失败**（command-palette ×3、layerBoundaries ×2、mobilePlaylistDetail ×5、onlinePlaybackStop、settingsAnchor、videoLayerPersistence、playbackTestDeckIsolation、storeContract），与本次无关 |
| `tsc --noEmit` | 通过 |

反证（证明新测试真的锁住了这个 bug）：把 `applyNativeTrack(track)` 的条件临时改成 `false as boolean` 后，`rearTrackSwitch` 立即 FAILED，恢复后通过。

---

## 6. 真机验证步骤

### 6.1 LSP 模式（先做，它是已经正常的那套）

1. 设置 → 小米背屏歌词 → 后端选 **LSP / LSPosed**；背屏控制引擎保持「单控制器（测试中）」。
2. 播放列表 → **自动切到第 2、3、5 首**：每首都应看到歌词从第一行开始，背景动画不中断。
3. 锁屏连续播放 30 分钟：歌词跟着切，进度条不倒退。
4. 暂停 → 恢复 → 随机播放 → 手动上一首/下一首 → 一首无歌词的歌（应显示「无歌词」或空白，**不得**留着上一首的句）。

### 6.2 Shizuku 模式（歌词部分应与 LSP 一致）

切到 Shizuku 后端重复上面 2–4 步，再单独看 6.3。

### 6.3 Shizuku 锁屏（本次新增）

反复「播放 → 锁屏 → 解锁 → 播放」，重点看：
- 锁屏后背屏是否仍然有歌词（而不是「被关闭」）；
- 中途不再出现无限重试（`lock_trace` 里 `wake1/wake2/wake3` 之后不再有 `wake4`）。

### 6.4 导出诊断（手机上就能看，无需 adb）

`lock_trace` 写在 `rear_lyrics` 偏好里。**如果你能连电脑**：

```
adb shell run-as io.github.huleixin.tingyu cat /data/data/io.github.huleixin.tingyu/shared_prefs/rear_lyrics.xml
```

重点看同一时间段里这四行是否指向同一首歌：

```
media3-track  song=xxxx epoch=xxxx#N index=1 playing=true
rear/switch   xxxx#N-1 -> xxxx#N song=xxxx source=native
rear/render   song=xxxx epoch=xxxx#N state=ready lines=37
rear/clock    source=native epoch=xxxx#N
```

**四种典型坏相**：
- 只有 `media3-track` 变了、`rear/switch` 没来 → 消息没送达；
- `rear/switch` 来了、`state=loading` 且 12 s 后仍是 → 原生歌词没取到（那是另一个问题，别再改传输层）；
- `rear/render` 的 `song` 与 `rear/switch` 不同 → 旧异步结果覆盖了新歌（epoch 守卫失效）；
- 都已就绪但屏幕不动 → 真·渲染问题（`window-not-rendering`）。

---

## 7. 回滚

| 范围 | 办法 |
|---|---|
| 只回滚 Shizuku 锁屏 | `git revert 05440b9` —— 歌词同步完全不受影响 |
| 只回滚歌词同步 | `git revert 46cc7f4`（并 revert `05440b9`，后者依赖 `RearLyricsTrace` 公开） |
| 真机上一键切回旧行为 | 设置 → 小米背屏歌词 → **背屏控制引擎 → 旧引擎（一键回滚）** |
| 整个方案 A | `git checkout <稳定分支>` 或安装上一版 APK |

---

## 8. 明确未验证 / 已知边界

1. **真机一条都没验**（本机无 adb 设备）。上述「XXvbxems causa」是推演，需要第 6.4 节的四条 trace 佐证。
2. **相机闪退**：仍未拿到 crash buffer。按上一轮结论，候选仍是 system_server 侧 hook（`RearWindowLease` / `RearDisplayPower` / `RearDirectPower`）与 Shizuku 命令的时序；本轮**没有**新增或改动任何 LSP hook，也没有新增 power hook。
3. 一首从没被取到歌词的歌：现在显示空而不是假歌词——这是有意的取舍。
4. 让屏期间 WebView 被 `onPause`，若相机退出后歌词「不动了」，说明其时钟没随 `onResume` 恢复，需改成只降帧不暂停（本轮未做）。
5. `NATIVE_STALE_MS = 2500` 是「主界面 WebView 已冻结」的判据，真机上如出现前后 App 都在前台却仍抢时钟，把这个值调小（反之调大）。
