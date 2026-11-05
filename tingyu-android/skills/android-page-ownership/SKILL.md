---
name: android-page-ownership
description: Use when touching any page UI on Android (home/library/collection/artist/search/settings/minimal player/chrome) or when a React DOM page, WebView shell or native page adapter is involved. Enforces the single-canonical-UI rule, the WebView allowlist, and the no-silent-fallback policy defined in docs/ANDROID-PAGE-OWNERSHIP.md.
---

# Android Page Ownership

**先读 `docs/ANDROID-PAGE-OWNERSHIP.md`。** 它是页面「正式 UI 实现」的唯一权威清单；
本 skill 只写执行规则，不复制那张表。

## 三条硬规则

1. **一个页面只有一套正式 UI。** Android 正式包里页面由 Compose 绘制
   （`android/app/src/main/java/io/github/huleixin/tingyu/chrome/`、`.../minimal/ui/`），
   React 只提供数据、路由、业务动作与原生桥接。
2. **旧 React DOM UI 不得重新出现在 Android 上。** 页面 DOM 分支必须挂在
   `NATIVE_FIRST` 的模块常量门控上（`{!NATIVE_FIRST && ...}`），不要改回运行时
   `nativeReady` / `!native` 之类的可变量——那类门控一旦翻转就是旧页面复活。
   不要为了"看起来正常"把 `ready` 写死为 true、隐藏错误或跳过 session 校验。
3. **接管失败要可见，不要静默回退。** 原生侧必须显示错误状态与重试
   （`NativePageFallbackPanel`）；唯一允许的回退是极简播放器的握手期（`owns=false`）。

## 改动前先自问

- 这个页面在归属表里是谁画的？改视觉要改 `.kt`，不要改 React 分支。
- 我要动的 DOM 是不是**白名单**里的（设置文档排版源 / Folia 舞台 / 背屏 / 二级 sheet /
  实时预览岛 / 极简页回退）？白名单里的只许改样式或数据契约，不许删结构。
- 我要动的适配器（`useNativeCollectionPage` 等）是不是只改模型与动作？**不要**把它的返回值
  改成常量、也不要把 DOM 分支重新挂回去。

## 收尾必做

- `npm run check:android-ui`（或 `npm test -- androidPageOwnership`）必须通过。
- 若新增/移除 WebView 绘制面，同步更新 `docs/ANDROID-PAGE-OWNERSHIP.md` §3 与
  `dev/build/androidWebUiOwnership.json`。
- 真机验收固定 8 项：进入 / 返回 / 点击 / 搜索 / 滚动 / 播放 / 切换路由 / 后台恢复。
