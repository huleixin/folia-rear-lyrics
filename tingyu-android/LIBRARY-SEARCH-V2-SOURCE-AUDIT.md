# 听屿 S2.0 源码审计

## 基线与验证边界

- 基线：`eddeaeec654b3762a9ab64f5f0f485ee3f5357f`，`1.5.63 / 278`。开发分支：`feat/library-search-v2`。
- 开始施工时应用源码干净；仓库上级目录用户录屏拆帧文件保留，不纳入提交。
- 本报告为源码核查，尚未运行新增专项测试：通过 0、失败 0、未执行。ADB 未发现运行设备；不宣称完成实机、账户接口或播放验证。
- Folia 上游页面访问此次未返回可审阅正文；没有据此移植代码或推断最新能力。优先复用当前已集成源码。

## 页面和公共基础

| 领域 | 当前源码与状态 | 扩展边界 |
| --- | --- | --- |
| 推荐 | `services/discovery/{service,ranking,roaming,preferences,requestCache}.ts` 已有聚合、雷达、漫游、配置与有界缓存 | 保留算法，仅补齐真实统计及状态联动 |
| 资料库 | `library/suites/mobile/native/NativeDirectoryPage.tsx`，`core/bindings/useLibraryHomeSources.ts` 按当前来源与目录类别读取 | 新增独立来源选择及聚合资源；不修改全局播放来源 |
| 搜索 | `stores/useSearchNavigationStore.ts`、`useSearchExploreStore.ts`，`components/app/search/useNativeSearchPage.ts` 已有单源、分页、联想、历史、分类 | 在现有链路补聚合、逐源进度、来源选择与配置 |
| 原生页面 | `types/nativePages.ts`、`hooks/useNativePage.ts`，Compose `chrome/Native*Page.kt` | 保留单一页面归属、会话校验、原生错误态与原有导航 |
| 账户 | `useOnlineProviderAccountStore`、`providerAccountCache` | 缓存必须按 provider、账户、资源、参数隔离，登出后迟到请求不得重新发布 |
| 数据库 | `services/appDatabase.ts` 的 KineticPlayerDB v2；session、缓存、本地实体与 local_play_history | 非破坏性增加记录，保留旧收藏/歌单/历史；禁止推算缺失有效时长 |
| 播放与身份 | Omni、`getPlaybackSongKey`、`getPlaybackSourceRef` | 所有新入口复用；跨平台同名不等于同录音 |
| 主题与动画 | 现有 theme token、原生 glass top bar、统一页面生命周期 | 保留播放器、歌词、Melox、迷你播放器与底部导航实现 |

## S1 完整性复核

- 已实现：多来源候选、偏好评分/衰减、六种雷达策略入口（小众无可信热度时隐藏）、漫游队列复用、原生 Hero/雷达卡、来源权重和推荐设置、平台本地化名称。
- 部分实现：偏好仅保存累计次数与最后时间，无法支持 7/30 天真实时长、深夜、年度与每日趋势。`useDiscoveryListening` 复用 `PlaybackListenTracker`，达到 30 秒后结算，不每秒写库。新增统计应消费同一结算。
- 部分实现：目前保守去重是 source-aware key，尚无可信跨平台录音关联；不能声称同录音合并已实现。
- 未验证：本轮没有登录账户或设备，不能确认所有平台日推、历史日推、FM、漫游和设置的端到端表现。
- 尚未实现：按会话持久化有效时长、智能规则资料库、统一聚合搜索及来源分组。

## Provider 能力（源码声明，不等同于实测）

| 来源 | 用户歌单 | 收藏歌曲 | 收藏专辑 | 搜索 | 验证状态 |
| --- | --- | --- | --- | --- | --- |
| 网易云 | 有 | IDs/喜欢歌单；不假设 getLikedSongs 存在 | 有 | 歌曲/分类，通过 Omni 能力检查 | 接口存在，当前账户未验证 |
| QQ音乐 | 有 | 喜欢能力；按实际 library 方法判断 | 有 | 歌曲/分类 | 同上 |
| 酷狗 | 有 | getLikedSongs 有 | 有 | 歌曲/分类 | 同上；不改用户已叫停的上游乱序问题 |
| 波点 | 有 | 按实际 library 方法判断 | 有 | 按 SearchCapabilities | 接口存在，当前账户未验证 |
| 汽水 | 有 | 按实际 library 方法判断 | 未声明 userAlbums | 按 SearchCapabilities | 接口存在，当前账户未验证 |
| 本地 | 已有本地歌单、收藏及实体目录 | 有 | 本地实体 | 本地检索 | 源码已实现，离线回归待执行 |
| Navidrome | 独立服务 | 复用既有功能 | 独立服务 | 已有搜索 | 保留原入口，不伪装为 Omni provider |
| 动态来源 | 运行时注册 | 动态能力 | 动态能力 | 动态能力 | 不硬编码正式入口 |

## 复用与缺口

Omni 已有显式 `getProviderUserPlaylists`、`getProviderLikedSongIds`、`getProviderLikedSongs` 及四类 `searchProvider*`，但收藏专辑仍只有 active-provider 方法，需要增加显式方法。资料库按来源读取、分页和出错隔离应以现有契约为边界。账户刷新必须检查请求前后身份，缓存不可仅使用 provider ID。

搜索已有请求预算、代次检查、本地搜索与原生歌曲菜单；复用其播放、收藏、队列及歌手专辑导航。搜索历史应补单项删除/记录开关，资料库搜索必须使用私人集合而非全网接口。

智能歌单必须使用真实可用字段；旧历史没有有效秒数时只展示已有次数/时间，不将 duration 当作实际收听。歌单分组、置顶和排序是本地组织元数据，不向远端暗中写入。批量远端修改和迁移必须由用户在产品内确认。

## 施工和风险控制

按 S2.1 数据资源、S2.2 统计规则、S2.3 原生页面、S2.4 测试，随后 S3 搜索与 S4 联动分别提交。新增数据库记录采用追加表/键，不覆盖旧表；所有异常记录失败均不得中断播放。身份不明、可信时间/热度不足和权限未知的能力必须降级或隐藏。

完整验收包括 typecheck、Vitest、Android 归属、Kotlin/JVM、Debug/Release 和设备视觉/播放性能。无设备的项目明确保留为未验收。最终提交源码后再构建相同 SHA 原签名包；不直接推送 main。
