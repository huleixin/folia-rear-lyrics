# 极简播放器 Compose 原生化 · 第二阶段（真实重写）

基线：`main` @ `46dd381`（第一阶段）。
本阶段把极简页**整页用 Kotlin + Compose 重画**：没有再包 WebView，也没有复用旧 DOM。

**证据先说明**：仓库里 `audits/assets/minimal-compose/` 的截图与 GIF 是
**Robolectric NATIVE 图形栈对真实 Compose 组合的离屏渲染**（`MinimalScreenshotTest`，1031×2236）。
它不是真机截图，也不是设计稿；组合、取色、歌词时间轴、动画曲线都是 App 里跑的那一套，
只是没有 AudioTrack —— 播放状态由测试给定，而这一页的所有事实本来就来自第一阶段的
`MinimalPlayerState`。真机验证清单见第七节。

---

## 一、范围

| | 内容 |
| --- | --- |
| 重写 | 极简封面页、极简歌词页、顶栏、批传输、分页点、氛围背景、封面取色 |
| 复用 | 第一阶段的 `MinimalPlayerRuntime` / `MinimalPlayback` / `MinimalLyrics` / `MinimalPlayerCommands` |
| 未动 | `VisualizerRenderer` 与全部舞台模式、`ChromeStagePlayer`、Media3、兼容播放通道、LSP/Shizuku 背屏、媒体会话、歌词解析与版本仲裁 |
| 回滚 | `TINGYU_COMPOSE_MINIMAL` 关闭（或 probe 失败 / 桥连续 3 帧被拒）时，WebView 极简页原样接管 —— 那一套组件、样式、单测一行未改 |

第一阶段那份"数据验证面"已删除（`MinimalPlayerPage` 只保留宿主壳）。

---

## 二、文件

新增（`android/app/src/main/java/io/github/huleixin/tingyu/minimal/`）：

```
MinimalPalette.kt        minimalPalette.ts 的逐条移植：色相绕行、直方图、五个颜色、逐字高亮对比度守卫
MinimalLyricTiming.kt    逐字时间轴：字形簇切分、词内均分、整行均分、已唱字数
MinimalCredits.kt        制作人名单识别（只改字号，不删行、不改时间、不改点击）
ui/MinimalTheme.kt       深浅色文字与线条、clamp/vh 工具、减少动效
ui/MinimalAmbience.kt    五层渐变背景（只动图层）
ui/MinimalArtworkView.kt 封面：层叠、背光、交叉淡化、19 秒浮动
ui/MinimalCoverPage.kt   封面页
ui/MinimalLyricsPage.kt  歌词页（逐字高亮 / 翻译 / 点击跳转 / 自动滚动）
ui/MinimalTransport.kt   进度条 + 五个按钮 + 分页点
ui/MinimalPlayerScreen.kt 外壳：顶栏 + pager + 共用传输
```

改动：

```
chrome/MinimalPlayerPage.kt  只剩宿主壳（订阅运行时 → 页面）
chrome/ComposeChromeHost.kt  进退场动画、安全区、舞台顺访让位
minimal/MinimalPlayerRuntime.kt  封面/取色状态、舞台顺访、点赞、音质标签
minimal/MinimalPlayerCommands.kt like / openStage
src/hooks/useNativeMinimalPlayer.ts  桥帧补齐 quality/qualityGold/liked/likeDisabled/detour
src/services/nativeMinimalPlayer.ts  两个新动作 + 字段
```

---

## 三、版式还原

数值全部取自 `minimalStage.css` / `minimalAmbience.css` / `minimalProgressGlow.css`；
CSS px 在 WebView 里就是 dp，所以这里是 1:1。

| 元素 | 定稿值 | Compose |
| --- | --- | --- |
| 封面宽度 | `min(90%, 39vh)`，左对齐 | `minOf(pageWidth*0.90, pageHeight*0.39)` |
| 封面圆角 | `clamp(18px, 7%, 30px)` | 同式，`coerceIn(18f, 30f)` |
| 层叠（第二张纸） | `translate(-3px,1px) rotate(-5deg) scale(.99)` + 1px 边 | 同值，`graphicsLayer` |
| 封面背光 | `radial 46% @ inset -18%`，不透明度 .55 | `drawRect(radialGradient)` |
| 标题 | `clamp(23px,7.4vw,30px)` / 600 / `-0.014em` / 1.26 | 同式 |
| 歌手 | 13.5px，muted，尾部 chevron | 同 |
| 音质角标 | 高 24，圆角 999，11px，`0.055em` | 同；金色态由桥里 `qualityGold` 决定 |
| 播放指示 | 4 根 2px 柱 / 15px / 间距 2.5 | 同，`scaleY` 动画 2.1s，停播塌到 .42 |
| 单句歌词 | `clamp(17,4.6vw,19)` / 高 `max(54,3em)` / 上距 `clamp(16,2.2vh,20)` | 同 |
| 歌词行 | 20px → 当前行 30px/600，行高 1.34→1.22 | 同（只有当前行重新排版） |
| 制作人行 | 12.5px → 当前 14px，不放大到演唱尺寸 | 同 |
| 翻译行 | 12px / 1.5 / muted 72% | 同 |
| 当前行锚点 | 32% 视口高 | `ACTIVE_LINE_ANCHOR = 0.32` |
| 自动滚动 | 240–460ms 缓动，手动后 4s 不抢 | 同 |
| 进度轨 / 已播 / 拇指 | 3px / 3px / 9px + 4px 软环 | 同 |
| 进度辉光 | 宽 `min(76px, 已播宽)`，封面色，播放时呼吸 | 同，绘制阶段 |
| 按钮 | 50dp，播放 56dp + 1.5px 玻璃环 | 同 |
| 分页点 | 8×4，间距 7，激活 scaleX 1 / 未激活 .5 | 同，`pageOffset` 连续驱动 |
| 歌词遮罩 | 上 34px 渐隐 / 下 82% 起渐隐 | 同（离屏图层 + `DstIn`） |
| 氛围背景 | 底色洗 + 3 片光斑（20/24/28s）+ veil + 暗角 | 同，只动 transform |
| 配色过渡 | 760ms；封面 420ms；文字 260ms | 同 |

刻意保留的细节：封面 19 秒 ±2.5px 呼吸；播放/暂停图标交叉淡化；模式名 1.5 秒胶囊；
点击封面上的歌词进入歌词页；拖动时封面反向漂移。

---

## 四、交互

| 交互 | 实现 |
| --- | --- |
| 封面右滑进歌词 / 歌词左滑回封面 | `HorizontalPager`（两页共用 transport 与状态，翻页不重建） |
| 迷你播放器向上展开 / 向下收起 | `AnimatedVisibility`：进场 420ms `cubic-bezier(.2,.72,.16,1)` 从底边升起，退场 300ms `(.42,0,.74,.3)` 落下 —— 与原页面同一组曲线 |
| 歌词页右上角进舞台 | 动作 `openStage` → `usePlayerViewModeStore.openStage()`（既有 detour 语义）；桥帧把 `detour` 回报原生，原生页立刻让位给仍在 WebView 的舞台 |
| 退出舞台回到极简歌词页 | 舞台侧 `closeStage()` 清 detour → 桥帧 `detour=false` → 原生页重新出现（pager 位置由 `rememberSaveable` 保留） |
| 点歌词行跳转 | `commands.seekTo(line.startSec)`：rows 的 `startTime` 已在交付点烘焙偏移，直接就是播放位置 |
| 切歌 | 封面 420ms 交叉淡化（等解码完成才提交）、配色 760ms 过渡、标题/歌手 260ms 切换 |
| 深浅色 | `InterfacePalette` 的 light 判定 + `minimalInk(light)`；取色只算一次，两套主题从同一份 `CoverColors` 派生 |
| 安全区 | 宿主把 `safeTop/safeBottom` 传进来，只有内容列内缩，背景仍然满幅 |

---

## 五、性能

这一版按"低功耗优先"写的，逐条对应实现：

- **一个时钟**：整页只有 `rememberMinimalClock` 持有"现在"；进度、逐字、分页点、封面浮动都从它读，
  没有第二个 `Timer`/`Handler` 循环。暂停时 `withFrameNanos` 不再被调度。
- **派生值收敛**：行索引用 `derivedStateOf`，逐字进度再收敛成"已唱字数"这个整数，
  时间文字收敛成整秒 —— 每帧的位置变化不会让歌词列重组，只有跨字/跨行/跨秒才重组。
- **绘制阶段读时钟**：进度条、辉光、分页点、波形、氛围位移都在 draw / graphicsLayer 里读，
  不触发重组。
- **背景只动图层**：五层渐变各是一个 RenderNode，每帧只改 transform；光斑相位 25fps 更新一次。
- **封面**：解码在后台线程（复用 `NativeArtworkRepository` 的内存 LRU + 磁盘），
  取色 28×28 每张一次，结果与主题无关。
- **无重滤镜**：全文件没有 blur / shader / backdrop；唯一的离屏图层是歌词上下渐隐。
- **桥**：仍然 1 s 一帧，只有事件变化时才额外补一帧。

已知取舍：当前行字号是真的在变（20→30sp），这是唯一会重新排版文字的地方，与 CSS 行为一致；
旧页面用 `content-visibility` 做虚拟化，这里没有做（一屏歌词通常几十行，实测绘制成本低于收益）。

---

## 六、证据

`audits/assets/minimal-compose/`：

| 文件 | 内容 |
| --- | --- |
| `01-cover-dark.png` | 封面页 · 深色 · 播放中（层叠、金色音质角标、波形、进度辉光） |
| `02-cover-light.png` | 封面页 · 浅色 |
| `03-lyrics-dark.png` | 歌词页 · 深色（当前行 30sp、逐字染色、翻译、制作人行缩小） |
| `04-lyrics-light.png` | 歌词页 · 浅色 |
| `lyrics-word-by-word.gif` | 12 帧：逐字高亮推进 + 进度从 09:24 走到 10:72（0.12s/帧） |
| `track-change.gif` | 8 帧：封面交叉淡化 + 背景配色过渡（切歌前后各 4 帧，60ms/帧） |

生成方式：`./gradlew :app:testDebugUnitTest --tests "*MinimalScreenshotTest"`，
输出在 `app/build/screenshots/minimal/`，GIF 由 `Pillow` 合成（12fps / 11fps）。

### 安装包

| 包 | 路径 | 签名 | 用途 |
| --- | --- | --- | --- |
| **release（推荐）** | `tingyu-android/out/tingyu-1.3.131-compose-minimal-release.apk` | 原签名 `CN=Tingyu`，v2+v3 | 直接覆盖已装的正式版升级验证 |
| debug | `tingyu-android/out/tingyu-1.3.131-compose-minimal-debug.apk` | debug key | 与正式版共存安装（不同签名不能覆盖） |

release 包：51.7 MB（51 704 888 B），`versionCode 154` / `versionName 1.3.131`，
`BuildConfig.COMPOSE_MINIMAL_PLAYER = true`，sha256
`94b90ec2f4536ae2f7e109030d7cdffa4473d6dddfa2f5ef0ae77be4e073efa3`。

签名核验（`apksigner verify --print-certs`）：`CN=Tingyu, OU=Android, O=huleixin, C=CN`，
SHA-256 `A3:6E:F2:A5:32:4B:55:D1:B8:46:9B:D8:3B:08:1F:43:EC:9C:9C:E5:63:F0:E6:CF:67:56:7F:8E:CE:02:24:9D`
—— 与已发布 1.3.110 / 1.3.123 的同名证书逐字节相同，因此可原地升级、无需卸载。
签名方案也与历史包一致（v2 + v3，v1 关闭；`minSdk 24` 下不影响任何目标设备）。

> 签名材料不在仓库（`*.p12`、`keystore.properties` 均在 `.gitignore` 内）。构建机上的
> `android/keystore.properties` 指向 `tingyu-private/tingyu-release.p12`，别名 `tingyu-release`。

> 构建注意：`buildConfigField` 在**配置期**求值，改环境变量后必须让 `generateDebugBuildConfig` /
> `generateReleaseBuildConfig` 重跑（`--rerun-tasks` 或删掉 `app/build/generated/source/buildConfig`），
> 否则 Gradle 会把上次的常量当成最新 —— 第一次打出的 APK 里开关是 `false`，就是这么来的。

---

## 七、测试结果

| 项 | 命令 | 结果 |
| --- | --- | --- |
| Kotlin/Java 编译 | `./gradlew :app:assembleDebug` | 通过，0 警告 |
| Android 单测 | `./gradlew :app:testDebugUnitTest` | **145 文件 / 974 用例 / 0 失败**（新增 23 项） |
| 前端类型 | `npx tsc --noEmit` | 通过 |
| 前端单测 | `npx vitest run` | 732 文件 / 7131 用例，12 失败（与基线同 6 个文件，非本改动） |

新增测试：

- `MinimalPaletteTest`（9）：色相绕行、HSL 往返、直方图过滤、样本不足、单色封面、夕阳封面不产橄榄、
  浅色纸面、逐字高亮对比度、空配色的兜底。
- `MinimalLyricTimingTest`（8）：CJK 逐字切分、emoji/组合符不拆、词内均分、无词整行均分、
  词标签对不上时退化、已唱字数、进度、空行。
- `MinimalScreenshotTest`（6）：4 张截图 + 2 组动效帧（同时充当渲染回归）。
- 前端 `nativeMinimalPlayer.test.ts`（7）：命令路由、不盲目反转、同曲 seek 生效、旧曲 seek 丢弃、
  非法 seek、未知动作、顶栏 like / openStage。

### 未执行（不得视为通过）

- **真机 / 模拟器**：本机没有 Android 设备，SDK 里没有 emulator 与系统镜像，
  CPU 虚拟化未启用（`HypervisorPresent=False`），无法启动模拟器。以下全部未在设备上验证：
  实际帧率与功耗、手势手感（pager 与竖向歌词滚动的手势竞争）、AnimatedVisibility 与 WebView 的层级衔接、
  系统栏/挖孔内边距、Activity 重建、后台长驻、EQ/自动混音通道下的进度。
- 动态取色的主观观感（只能给数值与截图，不能替用户判断"好不好看"）。
- 舞台顺访的真实观感（进入/退出时舞台与原生页的交接）。

---

## 八、已知限制

1. **手势**：`HorizontalPager` 没有实现旧页面最左 22px 的"让给系统返回手势"那段守卫。
2. **队列面板**仍是 WebView：点队列会把界面交还 WebView 极简页（原生页是整窗图层，不能盖住面板），
   关掉面板再交回来 —— 会看到一次极简页重建。第二阶段未做原生的队列面板。
3. **"更多"按钮**在封面页顶栏，行为是打开队列面板（原页面是弹出菜单）。菜单本身不在本阶段范围。
4. **歌手链接**按装饰绘制（chevron），没有接 `onOpenArtist`。
5. **本地曲目的 blob: 封面**原生读不到（看不到图，显示占位音符）；content:// 与 file:// 已支持。
6. 歌词行没有做虚拟化（见第五节）。
7. 分页位置用 `rememberSaveable` 记忆，不写回 JS 的 `minimal_player_page`；原生页被交还后重建会回到封面页。

---

## 九、回滚

| 层 | 开关 | 效果 |
| --- | --- | --- |
| 构建期 | 不设 `TINGYU_COMPOSE_MINIMAL`（默认关闭） | `probe().minimalPlayer=false`，JS 永远挂 WebView 极简页 |
| 运行期 | probe 失败 / 帧连续 3 次被拒 / 打开 JS 面板 | `owns=false`，WebView 极简页重新挂载 |

WebView 极简页的组件、样式、单测全部保持原样。
