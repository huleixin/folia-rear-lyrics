# 云端反馈专项交付与验收记录

更新时间：2026-11-14。本地施工完成；正式远程迁移/Secrets配置/Worker部署尚待用户确认。
手机Wrangler OAuth已经授权，授权不等于部署确认。没有新建Cloudflare资源，没有发布正式APK。

## 功能与架构

设置内已有反馈页新增云端反馈：九类问题、描述、复现步骤、环境、可选日志、内容/大小预览、
主动确认、进度、失败草稿及主动重试、编号复制、本机近期记录和状态刷新；手动导出仍保留。
反馈控件使用现有Compose设置投影、语义布局和主题色，React只供数据/动作；Pad隐藏背屏类别。
三种客户端语言已接入。实际经典/冰川/毛玻璃/Pad视觉仍需实机验证。

数据流：既有有界诊断 → 原生后台读取/前端Worker白名单JSON → 本机IndexedDB草稿 → 用户确认 →
签名短期PoW → D1原子预留配额 → 私有R2日志 → D1完成状态 → 随机编号及独立状态查询凭证。
管理后台和Codex只读工具经授权读取；确定性指纹聚组，Codex按证据匹配源码/最小修复/回归。
管理状态有六类；修复记录含commit及历史；源码修复后应待验证，实机验证通过才标记已修复。

审计详情见CLOUD-FEEDBACK-AUDIT.md；隐私说明见CLOUD-FEEDBACK-PRIVACY.md；长期流程见
CLOUD-FEEDBACK-WORKFLOW.md；协议/部署/维护详情见../feedback-server/README.md。

## 修改文件

既有文件：.gitignore、AGENTS.md；CrashDiagnostics.java、FoliaNativePlugin.java；
settingsCommands.ts、SettingsHelpActions.tsx、FeedbackPanel.tsx、useStartupExperienceGate.ts；
feedbackCopy.ts及zh-CN/en/in语言；diagnosticLog.ts、diagnosticPackage.ts、crashDiagnostics.ts；
crashDiagnostics.test.ts。现有播放内核及无关业务未重构，根README未修改。

新增文件：

- feedback-server/package.json、package-lock.json、wrangler.jsonc、README.md。
- feedback-server/migrations/0001_feedback.sql、0002_metrics.sql。
- feedback-server/src/security.mjs、feedback.mjs、admin.mjs、index.mjs、ui.mjs。
- feedback-server/test/harness.mjs、system.test.mjs、browser.mjs、client-worker.mjs、local-smoke.mjs。
- src/services/feedback/schema.mjs、feedback.worker.mjs、client.ts、navigation.ts、crashRecovery.ts。
- src/components/modal/feedback/CloudFeedbackSection.tsx、src/i18n/cloudFeedbackCopy.ts。
- android/.../feedback/CloudDiagnosticSnapshot.java、CrashPrivacy.java及CrashPrivacyTest.java。
- test/unit/diagnostics/cloudFeedback.test.ts、test/unit/components/cloudFeedbackConsent.test.ts。
- tools/feedback.py、feedback_credentials.py、deploy_feedback.py、test_feedback.py、test_feedback_live.py。
- docs/CLOUD-FEEDBACK-AUDIT.md、CLOUD-FEEDBACK-PRIVACY.md、CLOUD-FEEDBACK-WORKFLOW.md及本记录。

本次源码、测试和文档纳入Git提交；父工作区原有未跟踪文件保留。测试产物/日志/凭据不应提交。

## 数据库、接口与后台

复用现有Worker tingyu-feedback-api、R2 tingyu-feedback、D1 tingyu-feedback-db，
DB ID bf8680e8-37b3-42f4-b878-0b41fd584ea6。wrangler含完整DB/LOGS_BUCKET绑定及账号。
远程只读核验：桶dev URL禁用、无公开域名；既有D1初始零表，桶初始零对象。部署前再次核验。

本地0001/0002迁移通过；远程迁移未执行。表feedback、quota、counters、challenges、settings、
pairings、fix_history、metrics；触发器保证字节计量及匿名累计；过期个人信息不留长期统计明细。
上传失败回滚，finalize失联保留账本并在主动重试时校验恢复；过期先R2再D1；孤立对象延迟清理。

公开：GET /health、GET /api/feedback/challenge、POST /api/feedback、GET /api/feedback/status。
用户状态查询必须另带随机256bit能力，编号本身不足。管理员：GET列表/详情/私有校验日志，
PATCH详情状态/commit/note，GET issues/stats，登录/退出/会话/一次性手机配对、PATCH暂停开关。
完整路径和分页/筛选字段见服务README。

部署后的后台地址：https://tingyu-feedback-api.2473297053.workers.dev/admin 。此刻不能视为已经上线。
登录凭据不硬编码、不存浏览器localStorage、不进长期URL；cookie一小时HttpOnly/Secure/SameSite。
手机可由本机工具显式生成5分钟单次登录链接，打开后清除片段。未授权用户不能读取反馈或日志。
读密钥FEEDBACK_READ_TOKEN与管理密钥FEEDBACK_ADMIN_TOKEN分离。

## 安全、隐私和成本

客户端/服务端共用闭合白名单，服务端拒绝未知及未脱敏内容；日志不含账号、Cookie/Token、
私人文件、音频/歌词/图片、完整请求正文/鉴权URL；保留有限错误码/状态及代码栈位置。
每份日志≤5MiB，全部ZIP拒绝且不解压；本机旧格式安全解压另做路径/数量/膨胀/链接限制测试。
用户手填文本仍须本人预览；不能保证识别任意未知形式的秘密。CSP、textContent、同源写入检查
防XSS/CSRF；下载核对SHA256与大小；Worker不打印诊断正文、异常对象或秘密。

本机已生成独立随机凭据，Windows当前用户DPAPI加密，ACL只授当前用户；凭据不在源码/构建
日志/聊天/命令参数。真实凭据扫描通过源码、工具及签名APK；缓存/本地Wrangler/测试变量已忽略。
后续部署通过stdin配置Secrets；尚未写入远程Worker。

双门默认关闭；PoW18bit、单次短期挑战、IP小时限流/全局日计数、100提交/日、256MiB存储、
10k账本上限，后台可立即暂停。默认30天不可再读，每日03:17 UTC清理；积压/云故障可延迟物理删除。
无付费AI调用。应用配额无法为任意洪泛提供绝对费用/可用性保证；平台请求和拒绝本身仍耗额度。
未更改Cloudflare套餐/账单，当前套餐及边缘WAF/用量通知未实测，正式长期开放前仍需核验。

## 验收矩阵

| 验收项 | 已完成结果 | 尚未完成 |
|---|---|---|
| 正常/无日志反馈、R2/D1、状态和管理 | 本地实际Wrangler/D1/R2通过；服务handler+SQLite模拟通过 | 真实云端 |
| 网络失败/重试/幂等 | 编译Worker浏览器模拟断开成功响应、手动重试同编号通过 | 真实手机弱网/网络切换 |
| 回滚/一致性/孤立文件 | 存储故障注入、finalize失联恢复、清理失败账本保留通过 | 云端故障不做破坏式注入 |
| 分类/聚组/分页/过滤/历史 | 本地8套服务验收覆盖；描述无证据不合并 | 真实用户证据及版本匹配 |
| 脱敏/大文件/恶意ZIP | 共享白名单、服务拒绝及工具攻击用例通过 | 未知自由输入仍需用户检查 |
| 未授权/读管隔离/状态能力 | 令牌、cookie、伪造/过期凭证及一次性配对通过 | 云端实际验证 |
| 限流/配额/并发/双门/清理 | 全局/IP/日提交/存储容量、并发配额、两门、过期读取/清理通过 | 平台洪泛/账单不模拟承诺 |
| 后台手机/Pad/桌面 | 390浅/深、1024Pad、1440桌面浏览器登录/筛选/管理/XSS/宽度通过 | 手机浏览器连接真实域名 |
| Codex工具 | 8个Python安全测试；本地真实拉取/摘要；新进程DPAPI读取与角色隔离通过 | 新Codex会话真实云端读取 |
| 闪退/启动恢复 | JVM脱敏和启动/heartbeat策略21项通过；启动提示逻辑前端测试通过 | 实机崩溃/连续闪退/安全页 |
| 前端功能与原生归属 | 18项Android UI归属检查、18文件199项专项回归、类型检查通过 | 实机主题/Pad呈现 |
| 上传期间响应/播放 | 编译Worker浏览器8.336秒两次校验+发送期间主线程417次响应 | 实机音乐稳定性、耗电/内存 |
| 播放/歌词/背屏/本地/音源 | 专项199项包括相关既有功能单测；原生重试/背屏策略通过 | 实际设备完整端到端 |
| 构建/部署配置 | Capacitor构建/资产校验/同步、assembleRelease、dry-run完整绑定通过 | 正式远程迁移和部署 |

服务8套是SQLite+故障注入R2模拟；本地Wrangler使用本地真实运行时和存储，不是Cloudflare云端。
浏览器与JVM也不能代替Android实机。当前ADB无已连接设备。没有虚构实机或云端通过。
早期新增测试失败已修复后复测通过；最终结果以此表所列通过记录为准。

## APK与本机工具

测试APK：C:/Users/DELL/Documents/Codex/2026-11-10/hze/outputs/cloud-feedback-1.5.40-test/tingyu-1.5.40-feedback-test.apk
大小57,360,942字节，versionName 1.5.40，versionCode 255。
SHA256：169ab136a7a2b413cd511544e7868197101399020e49aed9ae688f4b4effb074。
签名SHA256：a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d，与原安装包一致。
这是测试构建，未经正式发布；不递增正式版本，不上传GitHub Release。

本机凭据：C:/Users/DELL/AppData/Local/TingyuFeedback/read.dpapi、admin.dpapi，分别加密。
普通list/pull/summary只读；管理mark/login-link须显式操作。可通过安全环境变量读取
TINGYU_FEEDBACK_API_URL和TINGYU_FEEDBACK_READ_TOKEN，默认使用系统持久化存储。

后续用户只需提出“检查云端日志”“修复最近反馈”或具体播放/歌词/闪退问题，Codex按AGENTS流程
拉取真实日志、聚组排序、对照版本源码、区分已确认/可能/证据不足并最小修复。CLI支持list、
pull --hours 24、--id、--type、--issue、--version、summary。旧分组应加--hours 720。
真实云端还未部署，当前只能确认工具及凭据就绪，不能宣称已读取真实用户反馈。

## 用户最后需要的事项与限制

1. 手机确认更新现有Worker、现有D1两次迁移、配置两个Secrets、部署后台及清理cron。
2. 同一确认范围内仅用合成数据短暂打开上传验收，验收后恢复双门暂停；正式开放另行确认。
3. 实际手机/Pad/车机验证主题/交互、播放中上传、闪退恢复/安全页、背屏/AOD及本地/在线回归。

安全启动页目前支持独立手动反馈导出，没有独立云端提交；部分旧专用诊断因隐私未原样上传。
设备/用户独立数量证据不足时留空，仅统计环境组合；同指纹仍需根因分析；后台聚组最多100组。
日志30天后不可恢复，旧版本或dirty构建可能缺完整源码对应。PoW会增加有限CPU，低端机仍需测。
