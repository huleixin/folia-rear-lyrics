# S1.0 源码审计

审计日期：2026-11-16。实际版本 1.5.62 / 277，基线 69f64785，原分支 feat/tablet-adaptive，施工分支 feat/discovery-system-v2。不以 d6bf24f 的路径或能力作为施工依据。

## 工作区保护

施工前已有 kugouPlaylistOrder.ts、kugouProvider.ts、kugouProvider.test.ts 修改，属于歌单加载修复，不属于本专项；补丁保存于 C:/tb/s1-design/pre-s1-kugou.patch。原有调查图片不加入提交。播放器、Melox、歌词舞台、Media3、通道策略、底栏动画均不在施工范围。

## 实际归属与可复用能力

|领域|源码依据|状态与处理|
|---|---|---|
|推荐首页|NativeHomePage.tsx → NativeHomeOverview.tsx → useNativePage → chrome/NativeHomePage.kt|已实现原生首页；当前仅三张入口、最近播放、我的歌单。扩展同一协议，保留 hydration 门控|
|本地首页|NativeLocalHomeOverview.tsx、useLibraryHomeLocal、localPlayHistory|已实现本地30首、常听、最近添加/播放、专辑与发现；保持现有功能|
|平台管理|onlineMusic/omni.ts、providerRegistry.ts、types/onlineMusic.ts|已有五个平台与动态 LX 注册；新推荐读取扩展 Omni 显式 provider 方法，不改 activeProviderId|
|歌曲身份|appPlaybackGuards、songMetadata、UnifiedSong|已有真实 sourceRef、providerId/mediaId/variant；仅按真实播放身份去重，不以同名跨平台合并|
|推荐请求|OnlineRecommendationProvider、useLibraryHomeOnline、onlineHomeFeeds|部分实现；旧 home feed 绑定全局平台。缺少跨平台并发预算、统一缓存和独立筛选|
|收藏及歌单|Omni song-aware likes、collection resources/mutations|已实现，复用原始身份和原生集合详情|
|收听历史|useMobileListeningHistory、useMobileLibraryStore、local_play_history|在线最近24条；本地播放次数。没有统一偏好模型|
|有效播放|PlaybackListenTracker、useNeteaseScrobbleReporter|已实现真实媒体进度累计、seek 排除、会话结算；可复用计量，不能将歌曲切换一概认定负面跳过|
|数据库|appDatabase.ts / KineticPlayerDB|已有 session/cache 表可存新命名空间数据；不需要迁移或删除原有表|
|原生导航|NativePageModel/useNativePage、collection resource、OperationPanel|已实现缓存、身份/导航戳、返回和原生面板；复用，不创建竞争页面栈|
|设置|useHomeLayoutSettingsStore|已有旧首页布局设置；缺少推荐来源权重、雷达及隐私配置|

## Provider 能力

网易：日推、FM、歌单、历史推荐已有实现。酷狗：日推、FM、歌单、历史推荐已有实现。QQ：日推、猜你喜欢、推荐歌单已有实现；日推/FM需会话，现有实现可能把空或失败折为 []。波点：FM、推荐歌单已有实现。汽水：FM、真实场景目录已有实现；未提供日推。LX 不因可搜索/可播放就获得推荐入口。方法存在不等于本轮已完成账号实时验证。

相似推荐、全量榜单、新碟、风格标签、热度数据须逐项确认；缺少可信热度时不开放小众雷达。没有可信风格时只用歌手/专辑关联并如实解释。

## 上游核查

2026-11-16 通过 GitHub API 读取仓库元数据及源码：Folia AGPL-3.0；api-enhanced MIT；KuGouMusicApi MIT；qqmusic-skills Apache-2.0。Folia 当前 OnlineRecommendationProvider 已有 daily style 和 explore 扩展，但本地没有对应已验证 Android transport，不直接复制接口空壳。网易 recommend_songs 源码 blob 9295052dfb81ca2ffe935d0b5002ea53b73a75c6；酷狗 everyday_recommend blob 20538fa9fad373a16654afccc696b14c8be560f0，均与现有能力重叠。QQ skills README blob fbda3aeb26580b8bd78b5d0a2127f83dfed13766 要求额外 API key，并含 AI 服务；本轮不接入。代码许可证不代表平台账号授权或接口服务条款授权；不新增绕权访问。

## 设计与验证边界

已读取 README、design.html 及五张 PNG。设计仅用于布局/层级与独立品牌图形；不使用示意歌曲、热度和数量，不把 HTML 嵌入 WebView。四主题沿用现有 palette。

本阶段测试：0 执行、0 通过、0 失败（源码与资源审计）。ADB devices 为空；暂无真机/模拟器、已授权测试账号，不能宣称实时接口、播放、四主题视觉与性能验收通过。后续 TEST-REPORT 更新实际结果。
