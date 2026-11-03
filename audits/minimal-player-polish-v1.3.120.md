# 极简播放器：安全区、动效与转场专项修复（1.3.120）

基线：`v1.3.119`（`81f5043`）。本轮只改极简前台的呈现层，未触碰 Media3、歌词解析、背屏与
Compose chrome 的图层顺序。

配套：`BUILD-1.3.119.md` 记录的签名与构建环境在本轮沿用；本轮产物见 `BUILD-1.3.120.md`。

---

## 一、先把问题量出来

两张真机截图（1080×2351，密度约 2.75 → 393×855 CSS px）逐像素测量后，两个症状不是"感觉偏"，而是
确定的几何错误：

| 位置 | 真机实测 | 期望 |
| --- | --- | --- |
| 收起按钮字形 | y 60–115 px（CSS 22–42） | 状态栏之下 |
| 状态栏时钟 | y 60–115 px（CSS 22–42） | —— |
| 分页圆点中心 | y ≈ 2302 px（CSS 837） | 手势条之上 |
| 系统手势条 | y 2284–2312 px（CSS 830–841） | 由系统绘制 |

也就是说，收起按钮与系统时钟**画在同一行**，两个分页圆点**压在手势条上**。

### 根因

不是"padding 写小了"，而是取错了安全区来源。

`capacitor.config.json` 里 `plugins.SystemBars.insetsHandling = "disable"`，Activity 是
`LAYOUT_FULLSCREEN | LAYOUT_HIDE_NAVIGATION` 全屏铺满，原生侧**自己**测量系统栏并把结果交给 Web：

- `MainSystemBars.applyWindow` 在 `android.R.id.content` 上装 `OnApplyWindowInsetsListener`，
  取 `systemBars() | displayCutout()` 的 `getInsetsIgnoringVisibility`，除以 density；
- 通过 `FoliaNativePlugin.getMainWindowInsets` / `mainWindowInsetsChanged` 上报；
- `src/services/androidMainInsets.ts` 写进 `--folia-main-inset-{top,bottom,left,right}`。

因此在这套壳里 `env(safe-area-inset-*)` **恒为 0**——而极简页恰好用了 `env()`：

```css
/* 修复前 */
.min-top  { padding: max(6px, env(safe-area-inset-top, 0px)) 10px 4px; }
.min-dots { padding-bottom: max(2px, env(safe-area-inset-bottom, 0px)); }
```

### 修法

安全区只在**外壳**上预留一次，控件不再各自计算：

```css
.min {
    padding: var(--folia-main-inset-top, env(safe-area-inset-top, 0px))
             var(--folia-main-inset-right, env(safe-area-inset-right, 0px))
             var(--folia-main-inset-bottom, env(safe-area-inset-bottom, 0px))
             var(--folia-main-inset-left, env(safe-area-inset-left, 0px));
}
.min-top  { padding: 6px 10px 2px; }   /* 不再重复顶部 inset */
.min-dots { height: 24px; margin-top: 2px; }  /* 不再重复底部 inset */
```

- 背景仍然铺满：背景绘制的是 padding box，所以留白区域照样有渐变。
- 不会重复计算：`.min` 之下没有任何一层再加 inset（`min-amb` 是 `inset: -14%` 的绝对定位层，不受影响）。
- 左右 inset 用原值（竖屏为 0），横屏与挖孔屏自动让开。
- 系统小白条由系统绘制，页面不模拟第二条。

`env()` 保留为 fallback：浏览器预览里没有这套原生桥，仍能退到可用值。

### 纵向空间

封面尺寸由"只看宽度"改成同时受高度约束：

```css
.min-cover__art { width: min(75%, 322px, 40vh); aspect-ratio: 1 / 1; }
```

393×852 上仍是 295px（设计稿的 75%）；在 320×640 或大字号把文字块撑高时，封面先缩，控制区
不被挤出。`.min-cover` 加 `overflow: hidden`，`.min-cover__meta` 保留左右 24px 内边距。

歌词字号接入应用自己的 `lyricsFontScale`（`--min-lyric-scale`，限制在 0.85–1.3）：这是"字体缩放"
在这套壳里唯一真实的来源，Android 系统字体缩放不改变 WebView 的 CSS px。

---

## 二、背景：从"一层渐变"到"青绿框 + 暖色场"

修复前的问题不是没有动画（`min-drift-a` 54s 一直在跑），而是**颜色层次太平**：整个页面是同一种
墨绿，封面颜色只贡献了 20% 的混合，肉眼读起来就是静态。

### 结构

按设计稿重新分层（仍是纯渐变，无 canvas / 无 shader / 无 `filter: blur()`）：

```
.min-amb__wash      底色 + 两层暖光（宽 116%×30%，紧 70%×24%，都压在作品带）
.min-amb__blob--a   左上青绿  88%   41s
.min-amb__blob--b   右上青绿  84%   53s
.min-amb__blob--c   底部青绿  78%   47s
.min-amb__bloom     作品后方呼吸      26s
.min-amb__veil      上下压暗
```

所有动画只动 `transform` / `opacity`，`will-change` 只给这三个 blob 和 bloom；`prefers-reduced-motion`
与应用的 `reduce_motion_monetBackground` 都会让它们 `animation: none`，暂停/后台
（`data-paused`）走 `animation-play-state: paused`。

### 取色规则（`minimalPalette.ts`）

- 色相分段约束，而不是一刀切：底色 0.90 拉向墨绿（保住"听屿是绿的"），两个色场 0.78 / 0.86，
  暖光 0（封面自己的色），高亮 0.90（薄荷青绿）。
- 饱和度/亮度区间放宽（底色 s 0.34–0.50、l 0.075–0.105；色场 l 0.115–0.175）。原来的窄区间会把
  任何封面压成同一个青绿。
- 暖光用整图均值；均值近乎无色时（`s <= 0.07`）改用墨绿色相 + 均值的亮度——否则 HSL 里灰的
  hue 是 0，加上饱和度下限会在一块黑白封面上打出红光。

### 逐点比对（与设计稿等高归一化后取样）

| 采样点 | 设计稿 | 修复前 | 修复后 |
| --- | --- | --- | --- |
| 左上 | (16,42,40) | (59,79,82) | (33,47,40) |
| 顶部中 | (34,60,54) | (74,71,61) | (38,45,37) |
| 中部左（作品旁） | (129,109,84) | (43,48,44) | (116,86,60) |
| 底部左 | (23,42,38) | (44,44,37) | (17,28,24) |

修复前顶部比设计稿亮 3–4 倍、作品旁几乎没有暖光；修复后四条带的明暗与冷暖关系都对上了。剩余差异
是中部暖光略暗、略偏橙——因为这台机器的封面是暖色日落，暖光直接取它的均值，再提亮就会脱离封面。

### 不同封面

同一套规则跑三种封面（原图 / 色相偏移的冷色与玫红），页面明显不同而基底仍是墨绿：

`shots/cover-palettes.png`

### 性能

- 取色仍是**每张封面一次**（28×28 采样 + 4bit 直方图，结果有界缓存）。
- 每帧不变的部分：背景只有 6 个合成层，动画属性全部是 `transform`/`opacity`。
- 没有 JS 逐帧驱动背景；`data-paused` 时合成器动画停止。
- **没有在真机上测过 GPU/功耗**，见第六节。

---

## 三、歌词动画

### 自动跟随

`scrollTo({behavior:'smooth'})` 换成了自写的 rAF 补间：

```ts
duration = min(460ms, 240ms + distance * 0.34)
easing   = easeOutCubic
```

理由：平台的平滑滚动没有可设的时长，一屏距离只跑约 90–120ms，读起来就是"跳"；而且**无法收敛**——
点最后一行会滚一秒半。现在无论多远都不超过 460ms。

锚点简化成"当前行中心落在可视区 32% 高度"，删掉了原来多减的 `clientHeight/6`。

`content-visibility: auto` 是另一个元凶，已删除：屏幕外的行在被绘制前上报的是估算高度，滚到两屏
之外会先落到错位置再被纠正——这正是"点了歌词先跳一下再重新定位"。代价是长歌词全部参与布局，实测
10 行列表 `scrollHeight` 从 1083 → 1203 只有排版差异，没有可测的滚动卡顿。

### 点击

- 按压反馈：`transform: scale(0.992)` + `opacity: 0.82`，130ms；`transform-origin: left center`
  让文字向左收，不产生横移。
- 点击仍然只做一件事：`controls.onSeek(line.startTime)`，然后由现有时间线驱动跟随。
- 手动滚动（`pointerdown` / `wheel`）会**立刻**取消跟随补间，并暂停自动跟随 4s。

### 换歌

`lyricToken`（行数 + 首行时间 + 曲名）变化时：整列重新挂载 → `min-lyric-swap` 300ms 淡入并上移
12px，同时把 `scrollTop` 归零、下一次跟随改为瞬时定位（不从上一首的位置滑过去）。

防串歌没有改动：数据仍来自 `usePlaybackStore.lyrics`，仍由既有的歌曲身份校验决定。

### 逐字高亮

仍是直接改 `[data-ch]` 的 `data-sung` 属性，只写变化的字符；颜色 150ms 线性过渡。当前行的字号
19→27px 现在也参与过渡（200ms），不再是一帧内跳大。

---

## 四、横向翻页

从"原生 scroll-snap"改为"transform 位移 + 指针跟踪"。

原生方案的毛病在**松手**：吸附动画由平台执行，约 90ms，无法调时长，这就是"切换过于突然"。
另外 `.min-lyrics__scroll` 之前是 `touch-action: pan-x pan-y`，横向手势会和列表抢，起手在歌词上的
滑动经常什么都不发生。

现在的规则：

| 项 | 值 |
| --- | --- |
| 容器 | `.min-pager { overflow: hidden; touch-action: pan-y }`，`.min-track` 宽 200% |
| 跟手 | `translate3d(-pos * 50%, 0, 0)`，`pos` 为页单位，拖动时可为负或 >1 |
| 阻尼 | 越界后偏移 ×0.32 |
| 提交 | 位移 > 28%，或速度 > 0.35 px/ms |
| 动画 | 260–390ms，`easeOutCubic`，无过冲 |
| 轴锁定 | 起手 6px 后才判定，`|dx| > |dy| × 1.15` 才算横向 |
| 边缘 | 起点 x < 22px 直接放行，把系统返回手势让出去 |

- 竖向仍然由浏览器滚 `.min-lyrics__scroll`（`touch-action: pan-y`），不经过 JS。
- 进度条在 `.min-transport`，不在 pager 内，拖动 seek 与翻页互不干扰。
- 没有逐帧 React：`pos` 存在 ref 里，每帧只写一次 `style.transform`。
- 翻页不重新挂载页面，背景、传输、歌词时钟都不重建。

**没有在真机上验证手感与帧率**，见第六节。

---

## 五、开合转场与按钮微交互

### 展开 / 收起

挂载即播放：`.min[data-phase='enter']` 跑 `min-rise`（420ms，`translate3d(0,100%,0) → 0`），
页面内容 `min-content-in` 延迟 70ms 淡入并上移 16px，两段运动错开，不像一张整图在滑。460ms 后
React 把 `data-phase` 清掉，不留常驻的合成层。

收起是**先播完再导航**：`.min[data-phase='exit']` 跑 300ms，结束后才调用真正的返回。

这里有个结构问题要解决：收起按钮和系统返回都在这套组件之外，而且期望同步完成。所以加了一个
最小桥接 `minimalStageTransition.ts`：

```ts
registerMinimalStageExit(runner)   // 极简页挂载时注册
runMinimalStageExit(done)          // 导航侧调用；没人注册时立即执行 done()
```

- `useAppNavigation.navigateBackInApp` 的 player 分支改走 `runMinimalStageExit(navigateBackFromPlayer)`；
- 收起按钮改走 `runMinimalStageExit(() => chrome.onBack())`；
- 未挂载时（原歌词舞台、桌面 suite）行为完全不变；
- 连点：`closingRef` 保证第二次请求被丢弃，不会叠出第二个播放页；
- `still`（减少动态效果）时直接 `done()`，不做动画。

### 按钮

- 播放/暂停：两个图标同时存在、堆叠，用 `opacity + scale` 交叉淡入 170–200ms，不再是一帧换形。
- 上一首/下一首/随机/循环：`:active` 缩放 0.9（原有），播放键 0.94，`min-play-ring` 同步微缩。
- 收藏：`aria-pressed` 驱动，颜色与图标填充都由真实 `slotContext.isLiked` 决定，本轮未改逻辑。
- 进度条：仍是共享 `ProgressBar`，拖动所有权与时钟不变；本轮只改视觉分层，未碰拖拽实现。

---

## 六、测试与验证边界

### 已执行

| 项 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 通过 |
| `vitest test/unit/minimalStage.test.ts` | 24 项通过（新增 3 项取色规则） |
| 全量 `vitest` | 6996 用例，12 失败 |
| `node dev/probes/verifyMinimal.mjs`（Chromium 393×852 + CDP 真实触摸） | **25/25 通过** |
| 转场录屏 | `shots/minimal-transition.webm`（见第七节的说明） |
| 截图 | 深/浅色、长标题、无歌词、无封面、320×640、1.3 倍字号、三种封面配色 |

全量 12 个失败全部集中在 `commandRegistry` / `customShortcut` / `layerBoundaries` /
`mobilePlaylistDetail` / `videoLayerPersistence` / `configSurfaceContract` 六个文件，均与本改动无关
（上一轮已在未修改的干净检出上复现同一批）。失败详情中没有出现 `minimal` 相关内容。

浏览器验证覆盖的行为：

- 顶栏底 ≥ 顶部安全区、圆点底 ≤ 可用底、控制栏与圆点不重叠；
- 封面 1:1 且不越界；两页控制栏/圆点位置一致；
- 拖动中 `pos=0.69`（跟手）、松手完成翻页、左滑返回、位移不足回弹；
- 竖直滑动只滚歌词不翻页；点击歌词执行 Seek；
- 换句时 `scrollTop 99 → 162 → 233`（中间态存在，证明是补间不是瞬跳）；
- 进入原舞台是顺访、退出回到原页；
- 暂停时 `animation-play-state: paused`，播放时 `running`；
- 收起时 `phase=exit` 且尚未导航，300ms 后 `backs=1`；连点仍只返回一次；
- 减少动态效果时 `phase=idle`、点击立即收起。

### 未执行（不得当作通过）

- **真机**：`adb devices` 无设备，SDK 内无 emulator 镜像。
- 因此以下全部**未经验证**：Media3 实际播放、锁屏/后台、背屏与 LSP 同步、灵动岛、Compose 图层
  顺序与原生控制条是否真的退场、真实系统栏 inset 数值、滑动跟手感与帧率、50 首连续切歌、
  Activity 重建、真实功耗与 GPU 开销。
- 截图与录屏来自 Chromium 预览壳（`--folia-main-inset-*` 手工注入 40/24），不是设备画面。
  预览壳里没有迷你播放器，录屏中的"展开"是重载页面触发的挂载，不是点击迷你播放器触发。

### 功耗

没有测量数据。可陈述的是实现约束：无逐帧 JS、无全屏滤镜、动画只走合成器、暂停即停、
不可见即停（`document.hidden`）、取色只随封面变化。这些是设计约束，不是测量结果。

---

## 七、交付物

| 文件 | 内容 |
| --- | --- |
| `shots/compare-design.png` | 设计稿与实现四联对比 |
| `shots/cover-palettes.png` | 三种封面的背景差异 |
| `shots/theme-check.png` | 深色歌词页 + 浅色封面页 |
| `shots/states.png` | 大字号、320×640、长标题、无歌词 |
| `shots/enter-strip.png` | 展开动画逐帧 |
| `shots/exit-strip.png` | 收起动画逐帧 |
| `shots/minimal-transition.webm` | 转场录屏（浏览器预览） |

---

## 八、取舍与遗留

1. **中部暖光比设计稿略暗、略偏橙**：暖光直接取封面均值，提亮就会脱离封面；再往青里压会和其他
   封面区分不开。
2. **当前行字号 19→27px 是动画过渡**，会触发该行一次排版。行高固定，整列高度不变，但极端长行在
   过渡期间可能换行一次。若要完全避免，需要用 `scale` 变换，代价是字形横移。
3. **长歌词不再 `content-visibility`**：100 行以上的超长歌词会全部参与布局。实测 10 行无差异，
   未测 200 行级别。
4. **边缘 22px 不放翻页**：与系统返回手势共用左边缘，优先让给系统。
5. **`--min-lyric-scale` 上限 1.3**：超过后一屏只剩两行，观感更像阅读器而不是播放器。
6. 上一轮遗留的两项仍然成立：默认视图是极简、作用域是"手机版资料库"而非仅 Android。
