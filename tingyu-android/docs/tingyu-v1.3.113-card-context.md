# 1.3.113 原生卡片承载 Context 修复

用户 1.3.112 日志已证明 SmartAssistantPanel 的真实音乐业务、听屿 MediaController 和可见容器正常，但 priority=2，始终没有 host/created 或网页事件，卡在 card-available 后超时。源码中 Controller.attach 在找到卡片后仍要求 launcher.get() 非空；该引用仅由历史 Activity 生命周期回调建立。缺少回调时，即使卡片已经存在也拒绝创建舞台，且没有上报这一等待原因。

本轮直接使用已验证的原生卡片 container.getContext() 创建舞台子视图及 WebView，保留显示/主题上下文。Context 包装链中若存在 Activity，则检查它是否正在关闭或已经销毁；不存在 Activity 也不要求重启 Launcher。绝不从应用 Context 伪造 Activity，不启动新窗口，不改变卡片布局/导航。关联身份、非零尺寸、背屏 display、容器附着与媒体身份校验仍保留。

新增 host/card-context 事件，记录 Context 类名、是否含 Activity、是否观察到 Launcher；视图创建失败上报 blocked 和具体原因。原生容器的 detach、可见性、媒体身份与系统电源事件仍负责暂停/释放/恢复；LSP 独立窗口禁用和 AOD 策略保持。

验证：912 项 Android JVM 测试通过；Context 包装链/WebView 子视图创建仪器测试已编译，未在设备执行。前端没有功能代码修改，正常构建以更新版本元数据。Release 原签名构建后发布测试包。

设备验收：覆盖安装并重启背屏中心/手机加载模块；正常播放并打开原生音乐卡片，检查 card-context → created → web-stage → page-ready → drawn → ready，正常歌词舞台应替换系统封面按钮内容。重复收起再进入、切歌、锁屏/AOD、相机让位恢复。即使 priority 仍为 2，只要真实卡片身份有效，也应能创建舞台。若失败导出日志，应能明确区分 Context、视图创建、网页初始化或配置/绘制阶段。

没有设备连接，实际正常舞台与 AOD 显示仍待真机确认。回滚本轮提交后提高 versionCode 原签名重建，不卸载或清除数据。
