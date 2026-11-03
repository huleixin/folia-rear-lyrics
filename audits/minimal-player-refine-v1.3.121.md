# 极简播放器 · 视觉与动效打磨（v1.3.121 / versionCode 144）

基线：`e15b1f6`（v1.3.120）。本轮不触碰播放内核、歌词解析、MediaSession、背屏、原歌词舞台。

---

## 一、先审计，再动手

真实渲染链路没有变化，仍然是：

```
App.tsx  shouldMountVisualizer && !minimalStageActive
   └─ AppOverlays  ownsMinimalStage ? <MinimalStage/> : <MobileStageChrome/>
        └─ MinimalStage  ── MinimalAmbience（背景）
                         ── MinimalCoverPage / MinimalLyricsPage（两页）
                         ── MinimalTransport（共用控制条，内含共享 ProgressBar）
```

阶段 2 的结论仍然成立：极简页是 React 层的一个前台视图，`visualizer` 被**卸载**而不是隐藏——这既是省电来源，也是它不会与舞台抢时钟的原因。

这一轮的问题不在链路，在三件事：

1. **版式没有共用一条栏宽。** 封面 75% 居中、标题居中、音质是两个独立胶囊、封面与文字之间没有同一左边缘 —— 参考图里封面、标题、进度条是**同一条左边缘**，这才是"唱片内页感"的来源。
2. **取色规则把页面压成了灰绿。** 三层色雾都在朝 168° 墨绿旋转，暖色封面经过黄绿必然落成橄榄色；面积最大的桶又往往是灰蓝天空。结果：任何封面都是同一个青灰页面。
3. **歌词缺少编辑层次。** 没有封面缩略图、当前句放大不够、行距过松（62px 节距 / 19px 字号 = 3.3 倍，参考图是 2 倍左右）。

---

## 二、排版：一条栏宽

| | 之前 | 现在 |
| --- | --- | --- |
| 封面宽度 | `min(75%, 322px, 40vh)`，居中 | 栏宽（页边距 26px），高度受限时整组收缩并保持左对齐 |
| 文字块 | 居中 | 左对齐，与封面、进度条同左边缘 |
| 音质 | `FLAC` + `无损` 两个胶囊 | `FLAC · 无损` 一个说明性胶囊 |
| 歌手 | 纯文本 | 文本 + 细 chevron（排版元素，非控件） |
| 播放指示 | 无 | 右侧四柱律动，暂停即停 |
| 封面前景 | 无 | 偏移 9px 的细线"第二张印张"（`.min-cover__ghost`） |
| 歌词头部 | 标题 + 折线 | 46px 封面缩略图 + 标题 + 歌手 + 折线 |

歌词节距从「19px 字号 / 40px 行高 / 22px 间距」改为**固定 52px 槽位 + 8px 间距**（60px 节距，接近参考图的 2 倍字号关系），字号 20px，当前句在槽位内放大到 30px（1.5 倍）。槽位固定意味着换句只重排那一行文字，整列不位移——这也是"点歌词先跳一下再重新定位"的根治办法之一。

封面标题从 25px（`6.4vw`）提到 29px（`clamp(23px, 7.4vw, 30px)`）。

---

## 三、取色：三条被写进代码的规则

### 1. 取"有彩色倾向"的部分，而不是面积最大的部分

日落封面 60% 是灰蓝天空。旧的 `buckets[0]` 永远选中天空，于是所有这类封面都是同一个青灰页。现在先把饱和度接近峰值（≥ 55% 峰值，且 ≥ 0.12）的桶筛出来，按 `count × saturation` 加权求均值——封面的**色彩倾向**，不是它的天气。

### 2. 底色固定墨绿，封面色只进色雾

之前把底色也朝 168° 旋转：橙（40°）转到 110° 就是黄绿，落成橄榄。现在底色固定 `188°`（墨绿的偏蓝一侧，也是参考图实测的地板色相 207° 的近邻），只受封面 5% 影响；封面色放在色雾与光晕里。

### 3. 暖色相转"烬色"

`emberShift()`：18°–100° 区间（琥珀、黄绿）按离 18° 的距离旋转 90% 朝向红橙。日落封面因此是暖烬而不是沼泽；青、蓝、紫不动。

### 校准（等高归一化后逐点比对）

| 采样点 | 参考图 | 实现 |
| --- | --- | --- |
| 左上（页框） | (16, 32, 47) | (30, 33, 55) |
| 顶部中央 | (16, 28, 40) | (32, 33, 60) |
| 中上（封面上方） | (50, 46, 73) | (35, 32, 63) |
| 作品下方 | (32, 40, 59) | (29, 32, 51) |
| 底部 | (11, 26, 33) | (18, 29, 37) |

三种封面（暖 / 蓝 / 玫瑰）分别得到暖烬、深蓝、紫红三种页面，基底始终是深墨绿：`shots/cover-palettes.png`。

### 质感

- **暗角**：`radial-gradient(116% 88% at 50% 38%, transparent 42%, shade 50%)`，浅色主题用 13% 的墨色版本。
- **颗粒**：一张 120×120 的 SVG `feTurbulence` 平铺贴图，`opacity 0.05`、`mix-blend-mode: overlay`。静态，只画一次，不参与每帧合成。
- 仍然**没有** `filter: blur()`、`backdrop-filter`、shader、canvas。

---

## 四、动效清单（8 项全部实现）

| # | 动效 | 触发 | 参数 | 属性 | 成本 |
| --- | --- | --- | --- | --- | --- |
| 1 | 背景缓慢漂移 | 常驻 | 三层色团 41s / 53s / 47s，呼吸 26s，均为 `alternate` | transform / opacity | 合成器，暂停/不可见即 `paused` |
| 2 | 试听页左右切换 | 指针拖动 | 跟手 1:1；越界 ×0.32；28% 或 0.35px/ms 提交；260–390ms ease-out | transform | 每帧一次 `--min-pos` + transform，无重排 |
| 3 | 歌词滚动 + 逐字高亮 | 时钟 / 点击 | 跟随补间 `min(460ms, 240+0.34×距离)`；点击 130ms 按压 | scrollTop / color | 只改变化的字符 |
| 4 | 迷你播放器 → 展开 | 视图挂载 | 420ms 上滑 `cubic-bezier(.2,.72,.16,1)`，内容延迟 70ms 淡入 | transform / opacity | 合成器 |
| 5 | 按钮微交互 | 按下 | 图标 0.9、播放键 0.94、播放/暂停双图标交叉淡入 170ms | transform / opacity | 合成器 |
| 6 | 封面浮动 + 视差 | 常驻 / 拖动 | 19s ±2.5px；拖动时 `--min-pos × 11%` 反向位移 | transform | 合成器，切到歌词页即 `paused` |
| 7 | 页面元素淡入淡出 | 挂载 / 拖动 | 内容 360ms +70ms；控制条 280ms +150ms；拖动时封面文字块随进度降到 0.5 | opacity | 合成器 |
| 8 | 页码圆点跟随 | 拖动 / 翻页 | 宽度 4→8px、透明度 0.32→1，由 `--min-pos` 直接驱动 | width / opacity | 每帧一次，元素仅 2 个 |

新增的两个变量都由**同一处**写入：`applyPos()` 除了移动轨道，还写 `--min-pos`。所以视差、圆点、页面淡出三者天然与手指同步，不需要各自的动画循环。

**降级**：`prefers-reduced-motion: reduce` 与 App 内"减少动态效果"都会关掉 1/4/6/7，并把翻页与歌词跟随改为瞬时；暂停、后台、`document.hidden` 都会让背景与律动停在原地。

---

## 五、安全区与自适应

沿用上一轮的结构，没有新增固定 padding：`--folia-main-inset-*` 只在 `.min` 上预留一次，子元素不再重复；背景画 padding box，所以仍然全屏。

本轮补的是**高度受限**的情况：封面的高度上限从 `aspect-ratio` 上的 `width: min(100%, 43vh)` 挪到 `.min-cover__stage` 上，整组（封面 + 纸层）一起收缩并保持左对齐。之前只收封面，纸层会留在栏宽上，短屏时看起来像浮在一边。

验证过的尺寸：393×852、360×780、320×640、1.3 倍歌词字号、`orientation: landscape` 规则。

---

## 六、验证结果

### 单元测试

`test/unit/minimalStage.test.ts`：**27 项通过**（新增 3 项，覆盖本轮三条取色规则：彩色倾向取样、底色留在墨绿侧、琥珀转烬色）。

### 浏览器行为验证（Chromium 393×852，CDP 可信触摸）

**29/29 通过**，其中本轮新增 4 项：

```
PASS  滑动时封面产生轻微视差 — translateX=...px
PASS  页码圆点跟随滑动进度 — opacity=[0.6,0.6]
PASS  暂停时播律动指示停止 — animation-name=none
PASS  播放时律动指示运行 — animation-name=min-wave
```

原有的顶栏避让、圆点避让、两页控制条同位置、跟手、回弹、竖滑只滚歌词、点歌词 Seek、换句平滑、舞台顺访与返回、展开/收起、连点只返回一次、减少动态效果全部保持通过。

### 全量回归

`npx vitest run`：7041 用例，**12 项失败，全部落在 6 个与本改动无关的文件**（`commandRegistry`、`customShortcut`、`layerBoundaries`、`mobilePlaylistDetail`、`videoLayerPersistence`、`configSurfaceContract`）。这 6 个文件单独运行时同样是 12 项失败，与上一轮在**干净检出**上复现的基线一致；失败详情中没有出现 `minimal`。

---

## 七、没有验证的部分（不算通过）

**本机无真机、无模拟器镜像。** 因此以下均未验证：

- Media3 实际播放、锁屏/后台、双通道定时关闭；
- 背屏 / LSP / 灵动岛同步；
- Compose 与 WebView 的图层顺序、真实 inset 数值；
- 真机滑动手感、帧率、功耗（**没有任何功耗测量数据**）；
- 50 首连续切歌、Activity 重建、进程恢复。

截图与录屏全部来自 Chromium 预览壳（注入 40/24 的 `--folia-main-inset-*`），**不是设备画面**。

---

## 八、已知取舍

1. **暖色封面的页面上半部分仍是暖褐。** 这是色彩学问题而不是参数问题：低明度的暖色与墨绿混合必然偏褐。已用"烬色 + 低透明度 + 暗角"压到可接受范围，但它不会像参考图（紫罗兰）那样"干净"。蓝色、紫色、玫瑰封面的效果更接近参考图。
2. **当前句放大 1.5 倍是一次字号变化**，会触发该行一次文字重排；槽位固定所以整列不动，但极端长句（一行折两行）时该行会占两行槽位。
3. **颗粒层用了 `mix-blend-mode`**，在低端 GPU 上会让背景层参与混合合成。若目标机型出现掉帧，删掉 `.min-amb__grain` 一条即可，其余不受影响。
4. 极简页仍然挂在「手机版资料库」下，桌面端切到该 suite 也会看到；设置开关本身只在 Android 出现。

---

## 九、改动文件

新增：

- 无（本轮全部是在既有文件上继续）

修改：

- `src/components/app/overlays/minimal-stage/minimalPalette.ts` — 取色三条规则、`emberShift`、墨绿基准 188°
- `src/components/app/overlays/minimal-stage/minimalStage.css` — 栏宽版式、背景分层、暗角/颗粒、律动、圆点进度联动、视差、歌词节距
- `src/components/app/overlays/minimal-stage/MinimalCoverPage.tsx` — 一栏式排版、单胶囊音质、播放律动、纸层
- `src/components/app/overlays/minimal-stage/MinimalLyricsPage.tsx` — 封面缩略图头部、空歌词状态
- `src/components/app/overlays/minimal-stage/MinimalStage.tsx` — `--min-pos` 发布、新 props
- `src/components/app/overlays/minimal-stage/MinimalAmbience.tsx` — 暗角与颗粒层
- `test/unit/minimalStage.test.ts` — 3 项新用例
- `dev/probes/shootMinimal.mjs` — 逐字高亮状态截图
- `dev/probes/recordMinimal.mjs` — 录屏加入歌词跟随与点击
- `dev/probes/verifyMinimal.mjs` — 4 项新验证
- `dev/assets/minimal-preview-cover.jpg` — 预览封面改为参考图原封面（不含边框）
- `package.json` / `package-lock.json` — 1.3.121 / 144
