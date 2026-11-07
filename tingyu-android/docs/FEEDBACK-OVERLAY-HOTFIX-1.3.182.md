# 「问题反馈」点击即返回——专项定位与修复报告

版本：1.3.182 / versionCode 205（上一交付包 1.3.181/204 仍复现）
交付 APK：`tingyu-1.3.182-feedback-hotfix.apk`
日期：2026-11-07

## 1. 真正原因

**两层原因叠加，缺一不可。**

### 1.1 功能性根因（真机专属）

真机上设置页**不直接显示 DOM**：`useNativeSettingsDocument` 调用
`captureSettingsDocument(root)`，把设置页 DOM 测量成 `paints / controls / areas`
显示列表，交给 Compose 的 `NativeSettingsDocumentView` 重画；DOM 本身被
`src/styles/nativePages.css` 设为 `visibility:hidden; pointer-events:none`。
`captureSettingsDocument` 会把 `[role="dialog"]` 的 portal（反馈面板）一起采集，
其中每个 `button / a / [role=button] / input / textarea / select` 都会被注册成一个
`SettingsControl`（点击热区）。

`NativeSettingsDocumentView.kt` 的合成顺序是：

```
document.areas.forEach { Controls(area) }   // 先画有滚动区的控件（下层）
Controls(null)                              // 再画无滚动区的控件（最上层，最后合成）
```

即：**没有滚动区（`area=null`）的控件永远盖在滚动区内容控件之上**。

反馈面板的遮罩当时是 `<button className="absolute inset-0" onClick={onClose}>` ——
全屏、无 area。它被还原成一个覆盖整块面板的热区，压在分类、输入框、开关之上。
于是真机上任何一次点击都命中它，触发链为：

```
触摸 → Compose clickable Box(遮罩) → latestAction(control.id)
     → JS actions[control.id] (bindSettingsControl)
     → element.dispatchEvent(pointerdown/mousedown/...)
     → activateSettingsClick → element.click()
     → React onClick={onClose}
     → SettingsHelpActions: setFeedbackOpen(false)
     → 面板卸载＝用户看到的「返回上一页」
```

浏览器 / Playwright 里 DOM 事件按 DOM 树冒泡，遮罩是面板的**兄弟节点**而非父节点，
点内容不会命中遮罩，所以同一套 DOM 在桌面完全正常 —— 这就是问题只在真机出现、
且极易被误判为「React 事件冒泡」的原因。

### 1.2 交付性根因（上一轮修复为何无效）

上一轮提交 `f63ad1b` 已把遮罩从 `<button>` 改成带 `data-native-decoration` 的 `<div>`，
并在采集端跳过装饰层。**但修复从未进入 APK**：

| 产物 | 时间 | 内容 |
| --- | --- | --- |
| `dist/assets/FeedbackPanel-Qgsnm1Bi.js` | 07:17 | 含 `native-decoration`（源码修复后构建） |
| `android/app/src/main/assets/public/assets/FeedbackPanel-eJMKUpxx.js` | 01:47 | **旧 chunk，遮罩仍是全屏 `<button>`** |
| `tingyu-1.3.181-feedback-fix.apk` | 07:35 | 打包的是上面这个旧 chunk |

本次复跑 `npm run cap:sync:android` 暴露了断链点：

```
[stash-dirs] FAIL: android/app/src/main/assets/public 无法移走: EPERM operation not permitted
```

`stashDirs.mjs` 在 Windows 上 rename 整个 `public` 目录被拒绝，`&&` 链在此断开，
`cap sync android` 根本没有执行；之后单独跑 `assembleRelease` 时照旧把旧的
`public` 打进了包。更隐蔽的是管道 `| tail` 会把这条失败吞成退出码 0。

**结论：源码修过，但设备装到的仍是旧前端资源，用户自然继续复现。**

## 2. 涉及文件及修改内容

| 文件 | 修改 |
| --- | --- |
| `src/components/modal/feedback/FeedbackPanel.tsx` | 遮罩改为纯装饰 div：`aria-hidden` + `data-native-decoration` + `pointer-events-none`，**移除自身 onClick**；关闭逻辑收敛到外层 dialog 容器并严格判定 `event.target === event.currentTarget`；面板容器加 `onClick={e => e.stopPropagation()}` 阻断 React Portal 合成事件冒泡到宿主。X 的关闭保留。视觉（背景色 / blur / 圆角 / 动画）不变。 |
| `src/services/nativeSettingsDocument.ts` | 装饰层判定从单一 `closest('[data-native-decoration]')` 扩展为「或元素自身 `aria-hidden="true"`」，给「新弹窗漏打标记」加一道结构性兜底。 |
| `test/unit/components/feedbackPanelInteraction.test.ts` | **新增**：jsdom + react-dom 真实渲染 FeedbackPanel，9 例覆盖 6 类问题按钮、输入框聚焦与输入、诊断开关、添加截图、预览、导出、X、遮罩/面板空白点击，断言 `onClose` 只在 X 与容器空白处触发，且绝不冒泡到宿主。 |
| `test/unit/services/feedbackNativeDocumentContract.test.ts` | **新增**：直接把真实结构 DOM 喂给 `captureSettingsDocument`，断言不产生「全屏 + 无 area 的 click 控件」；含一个把遮罩换回旧 `<button>` 的反向用例，证明断言确实能抓到回归。 |
| `test/unit/architecture/feedbackOverlayContract.test.ts` | 更新契约：遮罩不得带 onClick、必须 `pointer-events-none`、关闭必须严格 `target===currentTarget`、面板必须 `stopPropagation`、采集端需同时尊重两种装饰标记。 |
| `dev/build/verifyFeedbackOverlay.mjs` | **新增**：资产新鲜度守门员。比对 `dist` 与 `android/app/src/main/assets/public` 的 FeedbackPanel chunk 名与内容、index.html 一致性，并断言产物里三个修复指纹；任一不满足即非零退出。 |
| `package.json` | 在 `cap:sync:android` 与 `build:android:release` 两条链上接入上述守门；版本 1.3.181/204 → 1.3.182/205。 |

## 3. 修复前后的事件触发逻辑

| 场景 | 修复前（真机） | 修复后（真机） |
| --- | --- | --- |
| 点分类 / 输入框 / 开关 / 截图 / 预览 / 导出 | 命中全屏遮罩热区 → `onClose` → 面板关闭 | 遮罩不再是控件；命中各自的内容控件 → 正常执行业务逻辑；DOM 侧 `stopPropagation` + 严格 target 判定双保险 |
| 点右上角 X | 命中遮罩（X 被盖住） | 命中 X 自身控件 → `onClose`（恰好一次） |
| 点遮罩空白处 | 命中遮罩 → `onClose` | 装饰层 `pointer-events-none`，点击落到容器 → `target===currentTarget` → `onClose` |
| 系统返回键 | 未改动 | 未改动（不在本次修改范围内，按原有预期工作） |

采集层：遮罩从「全屏、无 area 的 click 控件」变为「不注册任何控件的装饰层」，
`Controls(null)` 里不再有全屏热区，X / 底部按钮等小尺寸控件仍正常合成。

## 4. 测试及编译结果

- 新增/更新用例：`4` 个文件 `23` 例全部通过
  （`feedbackPanelInteraction` 9 + `feedbackNativeDocumentContract` 3 + `feedbackOverlayContract` 5 + `nativeSettingsDocument` 6）。
- `tsc --noEmit`：通过（exit 0）。
- 全量前端：`757` 文件通过、`8` 文件失败（`14` 例）；这 8 个为**既有失败**，
  涉及 `videoLayerPersistence` / `storeContract` 等与反馈面板无关的模块，
  在本次改动之前即存在，本次未引入新失败。
- Kotlin：`:app:testReleaseUnitTest`（NativeSettingsDocumentModel / StartupFailurePolicy /
  DiagnosticEventStream）**BUILD SUCCESSFUL**。
- Android release：`:app:assembleRelease --offline` 成功，产物 52,344,695 B。
- **产物级校验**（本次新增的关键一项）：解包 `tingyu-1.3.182-feedback-hotfix.apk`，
  内含 `FeedbackPanel-CHDnDP03.js`，具备 `data-native-decoration`、`pointer-events-none`、
  `target===currentTarget`、`stopPropagation`，遮罩自身无 onClick、不再是 `<button>`；
  `dist` 与 Android 资产 chunk 名/内容/index.html 三者一致。
  `node dev/build/verifyFeedbackOverlay.mjs` 通过。

### 未验证（无真机 / 无 adb）

以下只能靠代码与产物校验，**未做真机触摸验证**：真机上 6 类按钮、输入框弹出键盘、
截图选择器、诊断包 ZIP 分享、深浅色实际观感、系统返回键实机行为、连续失败安全模式。
请在安装本次 APK 后按上述清单逐项确认。

## 5. 是否存在其他类似隐患

- 全仓扫描 `absolute inset-0` / `fixed inset-0` 且带 onClick 关闭的元素：
  **当前仅反馈面板一处**，`GlobalLyricOffsetModal` 等用「父容器 onClick + 子容器
  stopPropagation」且父容器是 `div`（不匹配采集器的 `clickable` 选择器），不构成全屏热区。
- 结构性隐患仍在：`NativeSettingsDocumentView.Controls(null)` 最后合成的语义，
  意味着**任何**新加入的「全屏、无 area 的可点元素」都会重现同类问题。
  本次的两道缓解是：采集端对 `aria-hidden` 与 `data-native-decoration` 一律不注册控件，
  以及构建守门脚本防止源码修复没进包。若后续要彻底消除，需在 Compose 侧按
  z-index / 面积排序合成控件，属于较大改动，本次按「最小范围修改」要求未实施。
- 构建链隐患：`stashDirs.mjs` 在 Windows 上 rename 整个 `public` 目录被占用时会 EPERM，
  且失败容易被管道吞掉。本次已通过资产守门把「打旧包」变成显式失败；
  若该 EPERM 反复出现，建议把 stash 策略改为就地清空而非 rename。

## 6. 排障提示词（复现时可直接贴给开发者）

> 真机「问题反馈」点任何位置都返回帮助页。请按此顺序取证：
> ① 解包 APK 读 `assets/public/assets/FeedbackPanel-*.js`，确认遮罩是否为
> `<button className="absolute inset-0" onClick>`；② 对比 `dist/assets/FeedbackPanel-*.js`
> 与 Android 资产的 chunk 名是否一致（不一致＝cap sync 断链）；
> ③ 跑 `npm run cap:sync:android` 观察 `stash-dirs` 是否 EPERM；
> ④ 用 `settingsTrace("touch-hit")` 看点击命中的 control id 是否为遮罩；
> ⑤ 跑 `node dev/build/verifyFeedbackOverlay.mjs` 与
> `npx vitest run test/unit/components/feedbackPanelInteraction.test.ts
> test/unit/services/feedbackNativeDocumentContract.test.ts`。
