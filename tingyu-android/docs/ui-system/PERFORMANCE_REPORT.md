# PERFORMANCE_REPORT — 性能验证报告（诚实版）

> 基线 commit `1745121`（1.3.182）。本报告区分「已验证」「未验证」；**未标注数据的结论一律视为未验证**。

## 1. 已验证

| 项 | 方法 | 结果 |
|---|---|---|
| 类型安全 | `tsc --noEmit` | 通过，改动未引入类型错误 |
| 回归安全 | vitest 全量 ×2（基线/改后） | 失败集合无变化（14 存量失败），本次改动未引入新失败 |
| Compose 编译 | `:app:compileDebugKotlin` | 通过 |
| 构建产物体积影响 | tokens 收编为 CSS 变量 + Kotlin 常量，无新增依赖、无运行时新增抽象层 | 预期中性（未做包体测量） |

## 2. 未验证（明确标注）

以下全部**未在本机测量**，不声称任何性能提升：

- 冷启动耗时（基线 vs 现状）
- 首页/歌单详情首次进入帧时间
- 极简歌词进出帧时间
- 长列表（数百首）滚动掉帧
- 内存占用
- Macrobenchmark / Baseline Profile 状态

**待办**：设备允许时建 `android/app/src/androidTest` Macrobenchmark 模块，测「冷启动 / 首页首帧 / 极简页进出 / 歌单滚动」四条关键路径，与本基线比对。

## 3. 设计层面的性能红线（代码审计结论，非测量）

1. **双层模糊禁止**：父子容器同时 backdrop-filter 是最贵的失效模式；现有 `[data-native-glass]` / `[data-soft-glass]` / `composeChrome.css` 的互斥开关链必须保持。
2. **逐帧值不进 React state**：进度/歌词时钟/频谱只走 `motionSignals` MotionValue；`ChromePlayback.rememberChromeNow` 33ms tick 只驱动 draw 节点。新增实时 UI 一律沿用该模式。
3. **页面实例按路由归并**（`NativeMotionPolicy.pageRouteKey`）：防止同一页面双实例叠影（2026-11-07 首页闪烁专项根因）。
4. **包上限**：NativePageModel 1.5MB / 60 区块 / 3000 行，超出自动截断——新字段注意体积。
5. **动画期间不透明页禁淡入**（强制整屏离屏图层）；既有 `EnterTransition.None` 的豁免路径不得移除。

## 4. 附录：中文路径下的本机构建方式

```
mklink /J C:\tingyu-build "C:\Users\<用户>\WorkBuddy\听屿\src\tingyu-android"
cd C:\tingyu-build\android
set ANDROID_HOME=C:\Users\<用户>\AppData\Local\Android\Sdk   # local.properties 的中文路径会被 Properties 编码破坏
gradlew.bat :app:compileDebugKotlin
```

正式发版链路（`npm run build:android:release`）在中文路径下的行为未验证；建议后续把「构建环境要求」固化进 CI 或文档。
