# 1.3.104：原生 MAML 音乐卡片路线审查与设备验证门禁

本轮明确停止 Launcher 全屏覆盖路线。基线 cdd55c74；不覆盖既有提交，不复制反编译 APK 实现进公开仓库。当前交付为原生实例验证版，**不是已经完成接管的卡片移植版**。

## 证据来源

- 用户提供的 Folia 背屏 0.3.2 APK 及本工作区已提取 DEX/JADX：FoliaHook、NativeMusicCard、RearCardView、EngineView。反编译内容只用于行为研究，不加入仓库源码或发布附件。
- Janus 固定提交 `27e28314d7daad4a63e7f7053abb6cd478e61ce1`，仓库 `https://github.com/penguinyzsh/janus`；已直接读取根 LICENSE（GPL 第3版）、WhitelistEngine、CardInjectionEngine、SystemCardEngine 及对应 JSON 规则。项目 README 表明 libxposed API 101，本项目使用 legacy Xposed API，不能原样链接该 Hook 层。
- 听屿当前 RearHostHooks、RearHostView、RearHostProvider/Bridge、RearLyricsCoordinator、RearLyricsActivity；保留既有 Media3/兼容状态、歌词与时钟、字体背景、FD 静态资产和受限跨进程协议。

## 逐项对应

| 原 APK 机制/证据 | 听屿当前对应 | 本轮处理/缺口 |
| --- | --- | --- |
| FoliaHook 只在背屏中心主进程 Hook MamlView initMamlview/attach/resume | 当前 Hooks 主要观察 launcher Activity | 新增只读 MAML 类/生命周期探针，不改宿主窗口 |
| mRoot.findElement("music_control") 且实例类型为 MusicControlScreenElement | 当前 launcher 模式完全不查 music_control | 真实反射查找、类型、显示 ID/尺寸/可见性记录 |
| mMusicController.getMediaController() | 听屿自己的 RearNativeTrack/Media3 是播放权威，但没有卡片媒体归属验证 | 原生卡片实例必须独立证明选中了听屿包；只计其他包，不控制其他会话 |
| NativeMusicCard.setOwned 暂停 root/selfPause、detachFromVsync，隐藏非歌词子 View、取消进度/封面回调 | 当前 RearHostView 不涉及原卡片绘制 | 本轮仅检查恢复方法是否齐全；未取得实例证据，不安装绘制拦截 |
| 释放时清除 active、恢复各子 View 原可见性，核对 root/finished，attachToVsync/selfResume、媒体刷新/requestUpdate | 当前 close 只从 DecorView 移除全屏层 | 最终卡片接管必须自己实现对称恢复；不能套用全屏 close 作为恢复 |
| RearCardView 被加入具体 MamlView 的子树，MATCH_PARENT 相对于卡片容器 | 当前完整舞台 View 加入 Activity DecorView | 本轮禁止从正常 attach 路径调用全屏挂载，保持独立 Activity 回退 |
| MAML pause/resume、sendCommand enterAod/exitAod、显示监听 | 当前 launcher pause/resume 与 DisplayListener | 后续卡片实现需要改由 MAML 控制；本轮不伪造支持 |
| 被接管 root 的 onTouch/onHover 返回 false；RearCardView 点击门控 | 当前全屏层自己的上滑退出 | 原 APK 未提供 OEM 外层上滑导航的完整源码；不能把全屏手势宣称为原卡片手势，须设备验证 |
| 后屏恢复时恢复播放/歌词快照 | 现有 RearNativeTrack、State、transport/relay | 继续复用，不建立播放器或歌词队列 |

## Janus 审查与复用边界

根 LICENSE 确认为 GPL-3.0。听屿声明 AGPL-3.0；若实际合入 Janus 受版权保护的代码，应保留署名、原 GPL 许可、修改说明与来源提交，并按对应组合许可要求分发源代码。本轮没有复制 Janus 源码，不把审查等同于已完成全部许可合规分析。

1. `WhitelistEngine.kt`：三个适配点为 `p2.a.c(String)->boolean`、`p2.a.b()->Set`、`MusicController.addMusicPackageList(List)`；规则路径 `hook/src/main/assets/rules/subscreencenter_whitelist.json`。可借鉴严格包名门禁与方法签名校验。最终若启用，只允许听屿自己的包，不合入任意 App 白名单。
2. `CardInjectionEngine.kt`：为 Smart Assistant 自定义业务建立模板/通知槽位，修改多个混淆映射/排序/管理器，**不是定位既存 music_control 原生音乐卡片**。本轮不移植，以免换成另一种伪装原卡片的方案。
3. `SystemCardEngine.kt`：明确处理非音乐系统卡片，并引用独立 MusicTemplateEngine。但在此固定提交的递归 Git tree 中未找到 MusicTemplateEngine 或音乐模板规则文件。不能据注释声称已研究到该缺失实现，不能补猜。
4. ROM 混淆名不构成 Android 17 的已验证 API。类/签名/返回类型必须现场探测；本轮没有无条件 Hook 白名单、写系统主题目录或部署模板。

## 最小代码改动

- `RearMamlProbe.java`：独立编写的只读 Hook，记录 MAML 类加载/生命周期数、背屏 attached 实例、music_control 数、听屿/其他/未知 Controller 数、恢复 API 是否缺失，以及卡片尺寸和可见性。最多8次有界512节点窗口树补查；候选 View 用弱引用表，不启动轮询，不持有 Activity。反射检查在宿主 UI 回调，IO 线程只读缓存结果。
- `RearNativeCardPolicy.java`：仅听屿包可通过身份闸门，缺失与不兼容各自有明确原因；测试覆盖 null/其他包/无恢复能力。
- `RearHostHooks.attach`：先记录 native-card-probe，明确返回未开启原生接管并沿用独立窗口回退；原全屏方法保留历史但无调用路径。PING/profile 带缓存的原生实例证据。不会因为 probe 找到了音乐卡片就宣称歌词 ready。
- `RearHostContract`：增加受限诊断事件；现有 Provider UID、协议、会话校验与安全回退保留。

## Android 17 必须现场确认

当前 `adb devices` 无连接，现有真机日志只证明 SubScreenLauncher/全屏层，未包含 music_control 的实例证据。**尚不能确认当前 ROM 创建了听屿原生音乐卡片，也不能声称不存在。**

安装验证构建后重启目标宿主/手机。播放听屿并打开系统原生背屏音乐卡片，然后开启背屏歌词；导出 Dedicated host startup evidence 中 native-card-probe 与 profile/PING：

| 观察结果 | 可作的结论 | 下一步 |
| --- | --- | --- |
| MAML 类不存在 | 固定类名不适用该宿主 ClassLoader/版本 | 获取背屏中心版本及其 APK 类索引，适配真实类，不退回覆盖层 |
| 类存在、observed=0 或 attached=0 | 尚未观察到附着的 MAML 容器 | 实际打开原生音乐卡片；检查其所在进程、类加载和视图层级 |
| attached>0、music=0 | 已有 MAML，但这些场景没有 music_control | 查看该系统音乐模板真实元素名/卡片创建条件，不能随便选一个 MAML |
| music>0、unknown>0 | 元素存在但未选中 MediaController | 检查听屿 MediaSession 与系统音乐准入链 |
| other>0、own=0 | 原卡片属于别的应用 | 不接管；由用户切换听屿会话，再验证 |
| own>0、恢复API缺失 | 身份正确但不能安全对称恢复 | 核对该版本替代 API，未适配前禁止隐藏/暂停原卡片 |
| own>0、恢复API齐全 | 实例与静态恢复能力验证通过 | 才进入卡片边界内复用舞台、原生绘制接管/释放及手势/AOD的下一步实现 |

如果最终确认系统因白名单不创建听屿卡片，解决方向是基于已验证 Janus 入口做**仅听屿包**的准入适配，而不是扩大支持其他应用或新造全屏卡片。当前缺少系统 APK/设备方法签名证据，未实施该写操作。

## 验证与交付限制

本轮只读探测与全屏禁用是完成项；卡片嵌入/原生绘制恢复尚未开启，原因是用户要求先验证真实实例且当前没有设备。可用独立窗口保持原功能。最终测试与构建结果见交付说明。未授权 APK 反编译源码未提交、未包含于 APK；Janus 仅作为具名机制研究。
