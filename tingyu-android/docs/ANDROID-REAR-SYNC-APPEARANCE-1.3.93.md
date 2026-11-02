# 听屿 1.3.93：播放权、背屏同步与独立舞台外观

基于当前工作区 1.3.92 / `f6d1f10`，按先同步、后外观的顺序实施。版本 1.3.93 / versionCode 116。

## 已确认的代码缺陷

1. **错把“不匹配”当成原生优先的理由。** `rearLyricsTransport.ts` 用 matchingSong 决定 jsFresh；正面 B 与残留原生 A 不匹配时，拒绝正面快照后反而采用 A。旧实现没有先验证输出租约是否仍有效。这条路径可以用模拟快照重现，与用户“正面正常、背屏继续 A”的现象吻合，但没有用户设备的现场 trace，不能认定每次偶发故障只有这一个原因，也没有证据证明一定存在双重声音输出。
2. **轨道消失不等于渲染端退役。** track 变空时，旧 activeTrack/appliedEpoch、在途歌词和恢复定时任务可能仍留在渲染器。现在失效租约会取消歌词请求、清空旧时间轴并暂停，身份不明时留白。
3. **歌曲配置与时钟的身份需要分别验证。** 新歌曲元数据到达，不代表旁边仍缓存的时钟就属于它。时钟现在也带 songKey、输出 session、原生 epoch/兼容播放请求标识，不能因刚发布或 config 已重绑定就采用旧时钟。
4. **缓存准备失败后的 detach 指向未接受的新 id。** NativeAudioElement 为 B 分配了 id，但缓存桥准备失败，原生可能根本没接受 B；旧 dispose 却 detach B，既无法确认 A 停止，也可能把本来可安全接管的兼容播放挡住。现在跟踪已确认/待确认的原生命令租约，在同一串行链中退役真正的输出，保留序号，不把未发起 prepare 当成已拥有输出。停止失败仍阻止兼容输出启动。
5. **兼容源不能只看已选择歌曲。** 手动点歌时，store 可能已经指向 B，而 HTML audio 仍是 A。兼容描述现在验证实际媒体 src 绑定；合法 Automix 的 outgoing display 仍保留，未调用暂停或破坏双 Deck。
6. **循环与释放的边界。** 同曲循环/实际重复 MediaItem 获得新 epoch；释放前先清 sourceId，阻止旧回调重新绑定时钟。视觉修订不会取消仍有效的歌词请求，也不会因一次外观更新重读同 epoch 的歌词。

## 播放权与自动恢复

- 复用 NativeAudioEngine sourceId、既有 CompatibleSleepOutput 租约、播放请求代次，以及 RearNativeTrack；没有另造播放器或平行权威时钟。
- RearNativeTrack 快照明确区分 media3 / compatible / handoff / none，携带输出 session、songKey、epoch、事件序号和既有单调时钟锚点。
- Media3 解码回退先退役原生背屏权威；旧输出停止须获确认，才允许兼容输出接管。缓存准备未被原生接受与“原生已经在播但停止失败”区别处理，不盲目放行。
- Media3 接管、自动切歌和同曲重播绑定真实 MediaItem。有效 Media3 可以在主 WebView 冻结后继续提供歌曲和时钟；兼容接管后残留 Media3 条目无权覆盖它。
- 接收端拒绝旧进程/租约和倒退事件序号。歌词请求按 epoch/request 校验并实际 abort；错误配置不先闪上屏幕。租约重新有效时恢复完整配置，即使该包只有时钟更新而没有新的 config revision。
- 使用原有状态读取和恢复节奏，不增加轮询、播放器重启或窗口重建。原生歌词仍用既有本地仓库与有界快/慢重试；指纹变化和正常状态变化允许重新校验。
- LyricSyncLedger 保留原有 unified / island / stage / rear 信息，增加输出引擎、租约哈希、交接次数、实际渲染歌曲/epoch 与时钟来源。旧事件仍计入 staleEvents；诊断导出路径不变。

## 外观分离与入口

入口：**设置 → 背屏歌词 → 歌词舞台外观**。

- 默认“跟随正面”，升级不改变现有表现；只跟随视觉，背屏尺寸、相机避让、安全区和既有后端策略不进入共享配置。
- 第一次“独立设置”复制当前正面视觉与素材；之后正背屏分别保存。切回跟随保留独立配置，再切独立/重启均恢复。LSP/Shizuku 只读取同一个 rear-stage profile。
- 独立配置覆盖现有内置舞台模式/调参、主题配色及两套明暗主题、背景/图片、字体/字号/字重、翻译和声/字幕、高亮相关视觉参数、静态模式和帧率。
- 复用原 `VisPlayground`、背景卡和受控 `ThemeQuickEditor`，没有复制舞台或临时替换正面 store。编辑器回调仅写 rear profile；真实背屏发布器消费该 profile 后仍由原舞台渲染。
- 素材使用原始内容的独立引用/字节。上传字体与背景不占用正面单例槽位；Tempera 使用独立 id 并保留可恢复图片内容，删除一侧素材不会删除另一侧的图片。
- 新增专用 IndexedDB appearance_profiles 表（0.9 → 1.0，只增加表），不修改原缓存、账号、队列或旧本地音乐记录。导入/导出接入原视觉配置 codec 与确认流程，并提供背屏 JSON 备份；Android 文件选择仍走既有 SAF，导出走原生分享。
- 原生控制中心增加真实 NativePage 入口；外观/编辑页使用既有 NativeSettingsDocument → Compose 路线，Web 备用界面共用同一状态与编辑器，返回语义为编辑器 → 外观 → 控制中心。
- 前台歌曲、歌词、seed、播放状态和时钟不存入视觉 profile。换主题只发布视觉修订，不重播、不重建音频、不清队列、不重新下载歌词、不修改灵动岛状态。

范围边界：内置舞台/背景的受控参数已接入。第三方 Folium 额外调参卡目前会直接写公共参数 store，因此不在背屏独立编辑器中开放；正面原卡片保留。本轮没有重构第三方模组参数系统，也不宣称任意第三方模组均已获得独立作用域。

## 提交与主要文件

- `e778583`：输出租约与背屏歌曲/时钟归属。
- `463bf3b`：时钟样本校验、循环代次、视觉修订保留当前歌词。
- `ecfc448`：缓存失败后的已确认输出退役与恢复。
- `615f6fd`：独立视觉 profile、受控编辑器、二级页面和原生接线。
- `e945f97`：素材、作用域、数据库迁移、上传与 UI 回归。
- `f3f8f7a`：兼容通道手动点歌时的真实 src 绑定。

同步文件：`rearLyricsTransport.ts`、`rearPlaybackAuthority.ts`、`playbackOutputIdentity.ts`、`nativeAudioElement.ts`、`compatibleSleepOutput.ts`、`useRearLyricsPublisher.ts`、`RearNativeTrack.java`、`RearLyricsState.java`、`RearLyricsWebClient.java`、`NativeAudioEngine.java`、`SleepTimerController.java`（仅复用输出描述，不改截止时间算法）、`LyricSyncLedger.java`。

视觉文件：`rearStageAppearance.ts`、`rearStageAssets.ts`、`useRearStageAppearanceStore.ts`、`RearStageAppearancePage.tsx`、`rearStageEditorProps.ts`、`rearStageEditorAssets.ts`，以及原控制中心路由/操作模型、OBS 配置发布、视觉 codec 和导入确认接线。

## 验证与真机边界

- TypeScript 通过。
- 联合前端测试：357 项通过；最终媒体源绑定另新增 1 项通过，相关用例总计 358 项。
- Android JVM：125 类、861 项、0 失败。包括输出租约失效、同曲重播/循环，以及两小时单调时钟、暂停和 Seek 的模拟测试。
- 仪器测试 APK 编译通过，未在设备执行。
- 浏览器 7 场景通过：LSP/Shizuku × 深浅色、320/360 宽大字体、独立/跟随恢复、原编辑器打开及背景图片上传，期间未触发启停/播放操作。图片仅为实际 Web 预览。
- 压力验证包含 50 次原生/兼容状态交替、快速 A/B/C/D、失效租约/旧时钟/旧歌词晚到、只有时钟包时的重绑定、视觉修改时歌词在途和同 epoch 不重复读取。它们是事件/时钟模拟，不是 50 首真机音频播放。
- 原签名 Release 构建与 APK 摘要见本次 Release 附件 SHA256SUMS.txt。

当前没有连接 Android 真机。尚未验证小米设备上的实际声音输出、冷/热运行手动点歌、锁屏自动下一首、长时间后台、LSPosed/Shizuku、相机让位/恢复和真实 Compose 文件选择。兼容 WebView 被系统冻结时的后台回调可靠性仍受系统限制，本轮不会用残留 Media3 时钟伪装成兼容通道正常。

建议设备验收：覆盖安装后播放 A 未结束直接点 B，再快速点 B/C/D；暂停/Seek/上下首；A 原生 → B 兼容 → C 原生；锁屏自动切歌及 1–2 小时播放；背屏恢复；切换外观时核对声音、进度与三端歌词不变。若再现，从背屏使用说明/诊断导出日志，重点对照 output/session、song、renderedSong/renderedEpoch、clockSource 与 staleEvents。没有现场日志前不宣称偶发故障已百分之百根治。

## 回滚

同步与视觉实现分开提交。可以单独 revert 视觉/测试接线保留同步修复；或者以 `f6d1f10` 为完整改动前参照，逆序 revert 本轮提交并用更高 versionCode 发布。新增外观表可保留，不清用户数据。Android 正常降级可能被系统拒绝，不建议卸载或清数据回退。
