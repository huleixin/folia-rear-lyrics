# 1.3.118 · 原生卡片兼容与显示交接

## 新提供的 APK

实际包名 com.xiaomi.subscreencenter，versionCode **426092316**，versionName **RELEASE-1.0.2609231642**。

APK SHA-256：ec10efa0a007a4eab01d2165bd63f49ea9a307fe30d27768666ede05cccde32f。

针对用户提供的 APK 使用 JADX 分析，并独立读取 DEX 中的字段/方法声明验证。没有复制反编译实现、系统素材或 APK 到公开仓库。完整反编译有 26 处错误，不能据此声称整个 APK 完全反编译成功；本轮依赖的原生卡片链路单独检查，并以 DEX 声明确认原始混淆名，避免 Windows 大小写碰撞产生的 JADX 别名误用。

| 结构 | 26010521 | 426091419 | 426092316 |
| --- | --- | --- | --- |
| 面板 | SmartAssistantPanel | SmartAssistantPanel | SmartAssistantPanel |
| 绑定方法 | n(int,int,int,int,Runnable) | y(int,int,int,int,Runnable) | y(int,int,int,int,Runnable) |
| holder / widget | Z1.s0 / r2.r | k2.o0 / E2.w | U1.O0 / q2.v |
| 音乐准入 | n2.a | A2.a | m2.a |
| 管理器 | Z1.V | k2.V | U1.r0 |
| 更新 / 收起 / 展开 / 删除 | f / j / i / g | f / j / i / g | g / k / j / h |
| 音乐开关 Map 字段 | q | q | r |
| 业务记录 / Bundle 字段 | Z1.U / k | k2.U / l | U1.q0 / l |
| 服务观测接口 | Y1.b.a(String,Bundle) | F2.g.a(String,Bundle) | T1.c.b(String,Bundle) |

新 APK 的 SmartAssistantPanel.y 仍从中心 holder 列表取得原生 slot，设置 widget.p、使用 widget.n，并由原容器控制切换动画。U1.r0.g 处理真实 unified.music:music_media 业务，k 保存收起索引，j 恢复原生索引/导航。听屿仅观察这些操作，不创建列表或强制展开。

## 兼容策略

此前只按两个 versionCode 放行。现在版本号仅为优选提示：所有映射必须先通过完整类型/字段/方法签名检查，随后仍须验证实际 SmartAssistantPanel → holder → widget → MAML 的父子关联、真实音乐业务 Bundle、选中的听屿 MediaController、背屏 ID 与恢复能力。

未知旧版或新版只有在**唯一匹配一套已验证结构**时才允许使用。多个结构同时匹配且无准确版本提示时拒绝；不按相邻版本猜测、不扫描任意类寻找替代容器、不移除媒体身份校验。真正改名或改结构的新版本仍需新增证据和映射，不能保证任意未来版本。

能力检查按 ClassLoader 缓存，最多检查三套映射，无持续 DEX 扫描或高频轮询。诊断区分 exact-and-structural / structural，并记录实际版本、命中映射及缺失签名。旧版和新提供 APK 都通过各自 **23 项**原始 DEX 声明校验。工具：dev/android/verifyRearSystemProfiles.py，需用户自行提供对应 APK，不把私有 APK 打包进测试。

## 短暂露出系统音乐卡片

源码确认两个交接窗口：开始播放时要等待完整舞台准备；暂时 OFF/AOD/可见性变化时，旧 hide 路径可能恢复系统内容，之后再次接管。

- 将暂停绘制与释放卡片所有权分开。有效的听屿显示会话、媒体身份、holder 和附着关系仍存在时，普通电源过渡保留已有接管权；OFF 时隐藏舞台并暂停 WebView，不保亮、不唤醒主屏。
- 相机占用、用户关闭、媒体转交其他应用、实际容器失效仍对称释放；用户明确关闭听屿 AOD 时仍恢复系统 AOD 内容。
- 在真实但尚未显示的听屿音乐卡片内提前加载原舞台。准备不获得显示所有权、不报告 ready、不覆盖其他卡片。未显示的准备最多运行 4.5 秒，之后暂停等待系统选中；不反复重建或延长可见首帧超时。
- 只有页面 configured 且进入实际可见 WebView 绘制边界时才接管原生内容；显示成功仍沿用原首帧判定，不伪造硬件呈现。
- 系统在同一容器中新增或重新显示原生绘制子 View 时，重新抑制这些子 View，同时保留原可见性以供恢复。正常 AOD 每帧不做额外重绑定或重新遍历所有系统卡片。
- 如果系统当前选中的是另一个有效听屿 holder，先释放旧准备视图，再绑定新的原生容器，禁止两个舞台同时接管。

新增 preparing / prepared-idle / handoff-acquired、preparationMs、ownershipRetained、frozenFrame 和 power 诊断。沿用有界日志，不记录通知或歌词正文。

首次冷创建时，若系统已经显示卡片而听屿尚未取得有效实例或舞台尚未加载，不能承诺屏蔽系统先显示的第一帧；本轮不使用黑色遮罩或伪造 ready 掩盖。充电拔插的具体系统事件顺序及闪露改善幅度仍需真机日志和录像确认。

## 验证

- 三个实际 APK，各 23 项 DEX 声明校验通过。
- TypeScript 和 52 项相关前端回归通过，保护 AOD 调度、歌词时钟、切歌、状态中继及休眠。
- 920 项 Android JVM 测试通过，覆盖新映射、未知版本唯一/歧义判断、字段和方法类型失败、能力检查缓存、隐藏准备身份约束、100 次电源状态往返、相机/所有权丢失释放及原卡片策略。
- Android 仪器测试 APK 编译通过；没有连接手机，未执行真机仪器测试。

上述结果不等于新系统版本已在真机成功接管，也不证明充电拔插零闪帧。发布包沿用原签名，versionCode 141，支持覆盖安装。

## 真机验收与回滚

覆盖安装后重启手机，让背屏中心加载新模块。若系统版本为 426092316，诊断应显示 profile=426092316、match=exact-and-structural，随后在真正原生卡片中看到原歌词舞台。其他相同结构的版本应显示 match=structural；无法识别时导出缺失签名诊断。

检查首次播放、暂停/继续、快速切歌、充电插拔各十次；反复 NORMAL/AOD/OFF；系统 AOD 关闭；收起再展开；相机占用与退出；其他音乐应用获得焦点。不得用 hostActive=true 单独替代可见卡片和交互验收。

本轮分兼容映射与显示交接两个提交，未更改播放、歌词时钟、舞台视觉、AOD 30 FPS 调度或 Shizuku 窗口。回滚对应源码提交，再用更高 versionCode 和同签名构建，不卸载清数据。
