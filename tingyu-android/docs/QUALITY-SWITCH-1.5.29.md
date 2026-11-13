# 1.5.29 音质工具修复

## 诊断结论

输入诊断包：tingyu-diagnostic-20261113-135924.zip。用户反馈音质切换无法点击。
日志没有足够的音质动作记录，不能仅凭日志确认每一次点击的失败位置；日志中的上游 HTTP 403 是独立的取流问题，本次没有绕过账号或资源访问限制。

源码确认：ComposeChromeHost 的 toolActions/textToolActions 和工具页开关通知依赖 minimal.bridgeLive()/非空极简页 session。工具页本身属于宿主，从歌词舞台或浏览页打开时不保证有极简页桥帧，因此页面可以显示，动作却被静默丢弃。

## 修改

- ComposeChromeHost.kt：工具页数值、文本动作和开关通知统一按宿主 active 状态发送；复用既有 action 事件和 nativeMinimalTools 模块监听，保留播放控制本身的会话校验。
- MinimalToolsSheets.kt、QualityDialog.tsx：移除音质面板内的洛雪管理入口；设置中的导入/管理入口保留。原生面板按剩余内容收紧高度。
- useAudioQualitySwitch.ts：未执行切换时显示重播重试提示；切歌后不回写上一首的音质状态；增加脱敏的开始/结果/异常诊断事件。
- HostToolsActionsTest.kt：实际宿主在没有极简会话时发送工具动作，暂停后拒绝发送。
- audioQualitySwitch.test.ts：成功保存首选、失败解锁、未执行提示、跨歌曲异步结果保护。
- PlayerOverlayThemeTest.kt / MinimalParityTest.kt：更新入口移除后的测试调用；各主题检查音质点击与洛雪入口缺失。
- package.json/package-lock.json：版本 1.5.29，versionCode 244。

## 验证

- Vitest：5 文件、54 项通过，含音质 hook、桥路由、在线恢复、音质迁移及 Android 页面归属约束。
- TypeScript 与主题一致性检查通过。
- Robolectric：HostToolsActionsTest 1 项、PlayerOverlayThemeTest 音质主题用例 1 项通过；后者覆盖经典/冰川的明暗色，并生成截图供检查。
- Capacitor 网页构建和资源同步通过。
- Android Release 构建及签名校验结果随交付记录提供。
- adb 无连接设备：本次未进行真机、真实账号和特定歌曲的播放音质切换验收。Robolectric 属于主机自动化测试，不代表真机播放成功。

安装后建议从歌词舞台、极简页及浏览页分别打开音质面板，切换标准/高品质/无损/Hi-Res，检查进度和暂停状态保留。资源或账号不支持时应保留原音频并提示失败；实际音质未验证时继续显示未确认，不将首选音质作为实测音质。
