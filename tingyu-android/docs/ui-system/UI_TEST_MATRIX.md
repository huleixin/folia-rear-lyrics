# UI_TEST_MATRIX — 测试与验收矩阵

> 所有「通过/失败」均为真实执行结果（2026-11-08，基线 commit `1745121` + 设计系统阶段 B 提交）。
> 「待真机验证」项不得标记为通过。

## 1. 已执行（本机）

| 检查 | 命令 | 结果 |
|---|---|---|
| TypeScript 类型检查 | `npx tsc --noEmit` | ✅ 通过（基线、阶段B、阶段C+D、阶段F-1 四次均通过） |
| 单元测试全量 | `npm test`（vitest） | ⚠️ **7356 通过 / 14 失败 / 2 跳过**（阶段F-1 Top Scroll Scrim 后；失败集合与基线一致（14），新增 `topScrollScrimContract` 13 断言 + `designTokenParity` scrim 2 组全过）。失败明细见 §1.1 |
| 页面归属门禁 | `npm run check:android-ui` | ✅ 10/10（阶段F-1 后复跑） |
| Token 一致性门禁 | `test/unit/ui/designTokenParity.test.ts` | ✅ 8/8（含阶段 F-1 新增「顶部滚动渐隐 token 三端一致」与「WebView 公共能力消费 scrim token」两组） |
| Scrim 结构契约 | `test/unit/ui/topScrollScrimContract.test.ts` | ✅ 13/13（页面接入/只画不接事件/静止零绘制/Tier2 门控/豁免面锁定） |
| Compose 编译 | `:app:compileDebugKotlin` | ✅ 通过（阶段F-1 后复跑；环境绕行见 PERFORMANCE_REPORT 附录） |
| Kotlin 单元测试 | `:app:testDebugUnitTest --tests TopScrollScrimMathTest` | ✅ 5 用例（融合取色/smoothstep/激活度/色标分布/模糊段半径；经 C:/tb/t182 ASCII 镜像运行——junction 路径下 Gradle 测试 worker 的 argfile 中文类路径会 garble，见工作日志） |

### 1.1 存量失败明细（14 项，与基线 1745121 相同集合，经 git stash 对照确认非本次引入）

| 测试文件 | 失败用例 | 原因 | 影响本次迁移？ |
|---|---|---|---|
| `library/mobilePlaylistDetail.test.ts` ×6 | hides only playlist navigation… / keeps original mini-player transport… / does not hide navigation… / keeps the same transport node… / uses the system reduced-motion… / virtualizes 2000 tracks… | jsdom 缺 `window.matchMedia`（`useMobileFooterMotion.ts:23` 直接调用）+ 虚拟化断言对 artwork 渲染的漂移 | **否**（环境与断言漂移；已用 stash 在基线复现同样 7 失败） |
| `command-palette/commandRegistry.test.ts` ×2 | opens the controls panel and ten-band equalizer / the player surface gates the panel commands › withdraws them on home | 命令面板环境依赖 | 否 |
| `command-palette/customShortcut.test.ts` ×1 | excludes the ones that need particular surroundings | 同上域 | 否 |
| `library/layerBoundaries.test.ts` ×2 | keeps the artist data in core (grid artist page) / lets nothing outside the suites reach into a suite except the registry | **grid/bravais suite 已删除但测试仍引用**（文档-代码漂移的测试面） | 否；建议后续修（与 CODEMAP 漂移同源） |
| `services/navigationTiming.test.ts` ×1 | does no continuous sampling when off… | 计时采样断言 | 否 |
| `services/videoLayerPersistence.test.ts` ×1 | survives the clear-cache button | 持久化清理断言 | 否 |
| `settings/mobileSettings.test.ts`（文件级） | — | 文件级失败（导入/环境） | 否（本轮改动了 MobileSettingsLanding，失败**早于**改动存在——基线 8 失败文件之一） |
| `stores/storeContract.test.ts` ×1 | keeps store-to-store coupling to the edges that were argued for | 期望 store 间无耦合边，实际存在 `useSettingsModalStore → useAppViewStore/usePlayerViewModeStore` 两条边（契约漂移） | 否 |

> 说明：仓库所在路径含中文（`C:\Users\东北大妞\WorkBuddy\听屿`），AGP 在 Windows 上默认拒绝该路径，`local.properties` 的中文路径会被 Properties 编码破坏。本机验证方式：`mklink /J C:\tingyu-build <项目>` + 环境变量 `ANDROID_HOME` 指向 SDK。**正式发版构建（npm run build:android:release）此前如何在中文路径下成功，待与维护者确认。**

## 2. 组件测试（待补）

| 项 | 状态 |
|---|---|
| 原生集合详情契约（歌单/专辑同构、序号独立字段、songHeading 专属、筛选区按需下发） | ✅ **自动化**（nativeCollectionDetailContract.test.ts，4 断言，阶段 E） |
| 歌单行（TrackRow）正常/超长/缺封面/不可播 | ⬜ 待真机+快照（存量 mobilePlaylistDetail 快照测试因环境缺陷失败，见 §1.1） |
| 双端歌单详情截图对比（Compose vs WebView 同数据） | ⬜ **待真机验证**（静态已按 PLAYLIST_DETAIL_PARITY.md 逐值对齐，视觉一致性结论必须以截图为准） |
| 专辑/每日推荐接入统一模板后的截图对比与底栏隐藏行为 | ⬜ **待真机验证**（阶段 E：数据契约与路由已统一并有单测，视觉与手势待实机） |
| 迷你播放器/底栏深浅色 | ⬜ 待真机 |
| ConfirmDialog / ThemedDialog 返回注册 | ✅ 存量单测覆盖 + 本轮 D-1 收敛（MobileSettingsLanding/MobileHome/歌单内搜索均已入栈体系） |
| motionTokens 数值与 CSS/Kotlin 三端一致 | ✅ **自动化**（designTokenParity.test.ts，6 组断言） |

## 3. 导航测试

| 项 | 状态 |
|---|---|
| 一级页签切换（推荐/资料库/搜索/设置） | ⬜ 待真机 |
| 集合进入/返回、滚动位置恢复 | ⬜ 待真机（回归 23:29 拖影专项） |
| 连续快速点击导航 | ⬜ 待真机（NativeRouteFence 幂等闸门在位） |
| 弹窗返回优先级（modalBackStack） | ✅ 存量单测部分覆盖 / ⬜ 待真机手势 |

## 4. 播放与 UI 联动（全部待真机）

切页不停播、切歌、极简页进出（播放不断/进度不跳/歌词时钟不重置）、队列打开、锁屏解锁、后台恢复、播放测试包回归（playbackTestRevision 通道）。

## 5. 异常测试

| 项 | 状态 |
|---|---|
| 空歌单/超长文本/大量数据 | ⬜ 待真机（原生侧 NativePage.parse 已有 60 区块/3000 行截断降级） |
| 横竖屏/字体缩放/输入法 | ⬜ 待真机（Density(cssScale) + fontScale 传入在位） |
| 网络断开/在线源失败 | ⬜ 待真机（playback skip-tx 单测覆盖跳过逻辑） |

## 6. 真机验证清单（一次集中回归）

1. 深浅色/跟随系统切换：底栏玻璃、页面渐变、设置页。
2. 极简歌词页进出 ×10 快速重复：无残留遮罩、控件立即可点、播放不断。
3. 底部玻璃导航：选中态、迷你条、防双绘（Compose 接管时）。
4. 系统返回：各层级顺序、预测性返回动画。
5. 三音源歌单详情并排比对（本地/QQ/网易云）：同模板、能力差异正确。
6. 后台播放 502 专项回归（1745121 修复不受影响）。
7. 灵动岛/背屏/逐字歌词高亮时序不受影响。
