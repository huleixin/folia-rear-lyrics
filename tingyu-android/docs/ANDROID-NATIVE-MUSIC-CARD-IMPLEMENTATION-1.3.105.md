# 1.3.105：仅听屿会话的真实 MAML 卡片接入

基线 62f39d00。用户 1.3.104 真机证据：observed=1, attached=1, music=1, own=0, unknown=1，卡片可见且尺寸904x572。该尺寸由 MAML 自己给出，不能由像素尺寸推断为“原生小卡片已呈现”。

## Controller 为空的调查结论

FoliaPlaybackService 确实 new MediaSession("FoliaPlayback")，设置本地 MEDIA/MUSIC 路由、媒体按钮和 transport flags、callback，并按现有流程 setActive(true)、发布 metadata/playback state。没有代码证据说明听屿从未创建 MediaSession，所以本轮不重写播放服务。

MAML 的 mMusicController.getMediaController() 为空，只能证明系统卡片还没选中媒体会话，不能证明系统不存在听屿会话，也不能直接判定白名单就是唯一根因。

参考 APK HostMedia.preferredController 还会依据明确来源包名查询 MediaSessionManager.getActiveSessions(null)，优先对应包的播放中会话；SecurityException 时保留原宿主会话。**此行为不等于向 MAML 注入 Controller**。本轮仅把同样的公开查询用于诊断 activeOwn/playingOwn，不替换 MAML 字段，不伪造 token，不使用其他应用会话。

## 实际实现

| 参考机制 | 听屿接入位置 | 本轮边界 |
|---|---|---|
| FoliaHook 从 MamlView 的 root 查找 music_control | RearMamlProbe.ownCard | 必须有真实可见实例、目标 display 和非零原生尺寸 |
| HostMedia 筛选指定来源会话 | RearMusicAdmission.sessionEvidence / RearNativeCardPolicy | 查询用于区分不存在与未选中，不把查询结果硬塞进系统卡片 |
| NativeMusicCard 获取/释放原绘制 | RearNativeCardOwner / 精确实例 Hook | 先校验 MAML 选中听屿，释放时还原可见性、VSync、媒体刷新 |
| RearCardView 在原容器渲染 | RearHostView(card) | 复用完整听屿舞台；不存在 DecorView 替代路径 |
| 原生宿主拖动/退出 | 保留父容器 intercept，观察 MAML pause/detach/隐藏 | 未取得 OEM 手势实现源码和设备操作证据，不声称已复现全部手势 |
| Janus 包准入适配 | RearMusicAdmission / RearOwnMusicPackages | 只添加听屿，按签名检测；缺失时明确报告 |

1. RearMusicAdmission：依据 Janus 已公开准入入口独立编写、按真实签名验证的适配。p2.a.c(String)->boolean 只对听屿包保留/变更为允许；b()->Set 复制原集合且只补听屿；MusicController.addMusicPackageList(List) 同样复制并只补听屿。保留所有已有条目，不合入任意 App。入口缺失/签名不符记录确切异常类型，不猜改字段。安装、实际 ownChecks/ownLists 调用数和系统活跃听屿数量与 MAML selected 状态分别报告。
2. RearMamlProbe.ownCard：要求真实附着可见的背屏 MamlView、mRoot.findElement("music_control") 的正确元素类型、恢复 API 齐全、MAML 自己返回的 MediaController 包为听屿，才提供卡片实例。
3. Controller.attach：不再无条件 FAILED。等待系统选择；身份通过后构造 RearNativeCardOwner 与现有 RearHostView。已删除旧全屏挂载方法。created 日志标记 native-maml、selectedPackage、卡片大小和真实父类。
4. RearHostView：必须传入真实卡片 owner，ViewGroup 为 card.container，不再有 DecorView 或无 card 构造路径。继续使用完整 rear-lyrics.html、原舞台、原状态/歌词与静态 FD。Media3、歌词时钟、独立外观均不改。
5. RearNativeCardOwner：配置 ready 后且再次验证 MAML 身份才获取绘制所有权，暂停 root/selfPause、detachFromVsync，保存并隐藏除歌词层以外的原子 View。按精确 root 实例门禁拦截绘制/update/重新订阅，非接管期间放行。失败先恢复，不留双窗口。
6. 释放先清除 owned，恢复原可见性；检查 root 未换、未结束，恢复 VSync、自身 resume、当前媒体 metadata/state、requestUpdate。关键恢复未确认保留原 lease，阻止并行独立回退。
7. 生命周期：MAML pause/resume/detach 与 enterAod/exitAod 接入；相机挂起和 AOD 标记分别保存。系统显示暂停时原卡片恢复，歌词 WebView per-view 暂停；恢复重用原配置和同步链，不重启音乐。媒体 callback 检查会话销毁；归属丢失恢复原卡片并失败回退。
8. 触摸：只把短点击送入 WebView，拖动不送给网页、不禁止父容器 intercept。上滑只观测，不合成系统返回；仅真实宿主 pause/detach 后且非AOD/相机时才分类主动退出。OEM 父层是否完成原生上滑必须真机证实。

宿主协议升至 v4，拒绝仍驻留的 v2 覆盖层和 v3 探测模块。覆盖安装后必须在 LSPosed 确认背屏中心作用域并重启设备/宿主进程，才能加载新模块。不会强制停止系统进程。

## 来源及许可

参考 Folia APK 的机制研究不构成复制授权；没有将反编译类直接复制进仓库。新增 owner/准入等为本项目独立实现。

Janus `penguinyzsh/janus` 固定提交27e28314d7daad4a63e7f7053abb6cd478e61ce1，GPL-3.0。具名依据为 WhitelistEngine.kt 与 subscreencenter_whitelist.json 中的准入目标；未原样复制其源码或依赖，不改写本项目 AGPL-3.0。原生模板/普通卡片注入未移植。未添加对其他音乐应用的 hook。

## 成败判据与边界

- activeOwn=0：宿主没有可见的听屿活跃媒体会话，需要确认实际通知/服务状态，不伪造。
- query permission-denied：宿主没有公共查询权限；卡片 MAML 身份校验仍独立执行。
- activeOwn>0、selected为空、ownChecks/ownLists=0：当前ROM不调用所适配入口或在模块加载前已缓存，重启宿主后仍如此需要宿主APK方法索引/系统日志；不能宣布仅凭启用模块即已关联。
- ownChecks/ownLists>0、selected仍为空：准入执行但系统选择另有条件，保留准确诊断与独立回退。
- selectedPackage为听屿且created=native-maml：真实实例关联和容器挂载成立；仍须page-ready/drawn/ready和手机画面/手势同时验收，不能单看日志宣称完成。

不声称 HyperOS 当前必然不支持；现有证据仅缺 selected Controller。无设备无法给出新实现真机成功结论。若最终 ROM 不允许系统选择，最接近且已可用的替代是明确命名的独立窗口，不称它原生卡片。本轮不发布纯探测包，交付的预发布包含实际准入、挂载及恢复代码。

## 验证

JVM新增不可变包集合复制/幂等与只增听屿测试，原身份/回退/阶段/恢复相关测试继续执行。仪器测试编译和Release构建结果见说明；无设备不宣称NativeMusicCard系统行为已通过。

本轮已执行：TypeScript 检查通过；前端状态/资源/独立外观相关7个测试文件、47项通过；Android JVM 133个测试类、893项通过，失败/错误0；assembleDebugAndroidTest编译通过但未上机执行。Release APK 与原签名比对在发布资产中单独记录。未执行Android 17、MAML系统容器、上滑、锁屏/AOD、相机真机验收。

回滚：实现与版本文档分别提交，可按提交使用git revert保留历史；安装旧低versionCode APK可能受系统降级限制，不卸载清数据。若只需临时停用实验宿主，可在LSPosed取消背屏中心作用域并重启，使现有独立窗口回退继续工作，不影响其他原有作用域。

真机覆盖安装重启后，先播放听屿并打开系统音乐卡片，启用背屏。核对准入调用数、activeOwn/playingOwn、MAML selectedPackage、created=native-maml及父容器类型；然后核对完整舞台page-ready/drawn/ready，实际卡片布局、上滑退出、AOD、相机、回到听屿、切其他音乐应用不被接管。回退只能在卡片所有权已释放后进行。
