# 云端反馈专项交付与验收记录

更新时间：2026-11-14。用户确认直接上线后，现有 D1 迁移、Secrets、Worker、后台及清理 cron 已部署。
真实云端验收通过后已开放用户上传（配置门与 D1 门均为 true）。没有新建资源，没有发布正式 APK。
当前 Worker 版本：8049808a-8b76-4f1b-81e0-3fc53298ae96。

## 功能与架构

设置内已有反馈页新增云端反馈：九类问题、描述、复现步骤、环境、可选日志、内容/大小预览、
主动确认、进度、失败草稿及主动重试、编号复制、本机近期记录和状态刷新；手动导出仍保留。
反馈控件使用现有Compose设置投影、语义布局和主题色，React只供数据/动作；Pad隐藏背屏类别。
三种客户端语言已接入。原生反馈弹窗已通过经典/冰川深浅色、393/1024宽度的 JVM 布局与动作测试。
实际设备的毛玻璃、键盘及 Pad 系统缩放仍需实机验证。
反馈页已精简：底部主题色“提交反馈”进入内容确认页，同意后点“确认上传”；完整诊断按需展开。
手动导出和截图默认收起；近期反馈按需展开。保留必要的隐私、存储期限及 AI 分析告知。

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

新增文件（本次跟进另含 useCloudFeedbackFlow.ts、live-browser.mjs、原生反馈布局测试及语义夹具）：

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
远程只读核验：桶dev URL禁用、无公开域名；既有D1初始零表，桶初始零对象。部署前已再次核验。

本地及远程0001/0002迁移通过，远程无待迁移项。表feedback、quota、counters、challenges、settings、
pairings、fix_history、metrics；触发器保证字节计量及匿名累计；过期个人信息不留长期统计明细。
上传失败回滚，finalize失联保留账本并在主动重试时校验恢复；过期先R2再D1；孤立对象延迟清理。

公开：GET /health、GET /api/feedback/challenge、POST /api/feedback、GET /api/feedback/status。
用户状态查询必须另带随机256bit能力，编号本身不足。管理员：GET列表/详情/私有校验日志，
PATCH详情状态/commit/note，GET issues/stats，登录/退出/会话/一次性手机配对、PATCH暂停开关。
完整路径和分页/筛选字段见服务README。

已上线后台地址：https://tingyu-feedback-api.2473297053.workers.dev/admin 。
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
部署已通过stdin配置两个Secrets，远程绑定核验通过；本次修正 Windows Wrangler 输出为 UTF-8 解码。

初始迁移的 D1 门默认关闭，本次在授权范围内开放双门；PoW18bit、单次短期挑战、IP小时限流/全局日计数、100提交/日、256MiB存储、
10k账本上限，后台可立即暂停。默认30天不可再读，每日03:17 UTC清理；积压/云故障可延迟物理删除。
无付费AI调用。应用配额无法为任意洪泛提供绝对费用/可用性保证；平台请求和拒绝本身仍耗额度。
未更改Cloudflare套餐/账单。现有 OAuth 的账单查询返回403，套餐/边缘WAF/用量通知无法确认；
应用级配额已测试，但平台请求费用仍需通过 Cloudflare 控制台核验，不宣称已确认免费套餐。

## 验收矩阵

| 验收项 | 已完成结果 | 尚未完成 |
|---|---|---|
| 正常/无日志反馈、R2/D1、状态和管理 | 本地及真实 Cloudflare 两轮合成反馈通过；SHA256/大小一致 | 真实用户反馈 |
| 网络失败/重试/幂等 | 编译Worker浏览器模拟断开成功响应、手动重试同编号通过 | 真实手机弱网/网络切换 |
| 回滚/一致性/孤立文件 | 存储故障注入、finalize失联恢复、清理失败账本保留通过 | 云端故障不做破坏式注入 |
| 分类/聚组/分页/过滤/历史 | 本地8套服务验收覆盖；描述无证据不合并 | 真实用户证据及版本匹配 |
| 脱敏/大文件/恶意ZIP | 本地白名单/攻击用例及真实云端敏感字段、超大正文、ZIP拒绝通过 | 未知自由输入仍需用户检查 |
| 未授权/读管隔离/状态能力 | 本地安全测试及真实云端未授权、只读拒绝管理、状态凭证隔离通过 | 无 |
| 限流/配额/并发/双门/清理 | 全局/IP/日提交/存储容量、并发配额、两门、过期读取/清理通过 | 平台洪泛/账单不模拟承诺 |
| 后台手机/Pad/桌面 | 本地390/1024/1440通过；真实域名390浅/深及1024登录/筛选/详情/管理/宽度通过 | 用户手机浏览器体验 |
| Codex工具 | 8个Python安全测试；新进程DPAPI只读读取真实云端、pull四条合成记录和summary通过 | 新会话用户反馈分析 |
| 闪退/启动恢复 | JVM脱敏和启动/heartbeat策略21项通过；启动提示逻辑前端测试通过 | 实机崩溃/连续闪退/安全页 |
| 前端功能与原生归属 | 18项Android UI归属检查、此前18文件199项专项回归、本次提交/确认专项与类型检查通过；原生Debug 11项（含反馈两项覆盖8种主题/尺寸组合）通过 | 实机主题/Pad呈现 |
| 上传期间响应/播放 | 编译Worker浏览器8.336秒两次校验+发送期间主线程417次响应 | 实机音乐稳定性、耗电/内存 |
| 播放/歌词/背屏/本地/音源 | 专项199项包括相关既有功能单测；原生重试/背屏策略通过 | 实际设备完整端到端 |
| 构建/部署配置 | 新版 APK 重新 Vite 构建/cap sync/原生 Release 打包通过；签名/版本/commit/无真实凭据检查通过；远程绑定/cron/健康复核通过 | 无 |

服务8套是SQLite+故障注入R2模拟；本地Wrangler使用本地真实运行时和存储，不是Cloudflare云端。
浏览器与JVM也不能代替Android实机。当前ADB无已连接设备。没有虚构实机或云端通过。
早期新增测试失败已修复后复测通过；最终结果以此表所列通过记录为准。
原生渲染测试使用 Debug 变体的 ui-test-manifest；Release 测试缺少测试 Activity 注册。
JVM 无法分配底层毛玻璃 Haze 的 RenderScript Surface，因此渲染实际 TyDialogFrame/
TySettingsContent 反馈弹窗，跳过底层设置页顶栏。没有改动生产毛玻璃代码，也不宣称已验证毛玻璃。

## APK与本机工具

新版测试 APK：C:/Users/DELL/Documents/Codex/2026-11-10/hze/outputs/cloud-feedback-1.5.40-ui-test/tingyu-1.5.40-feedback-ui-test.apk
大小57,362,815字节，versionName 1.5.40，versionCode 255。
SHA256：b5cb43c426db22084b20c5fd2a0b228188a38e00c78f53ac4e8dbd9e24dcfaa7。
APK 内 Build ID：1.5.40@3717a1a7；对应完整源码 commit 3717a1a7c32267b365d86f79a92bee2104c6a336。
签名SHA256：a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d，与原安装包一致。
此前 cloud-feedback-1.5.40-test 初版仍保留；新版单独上传 GitHub 测试版，不覆盖旧包，不设为正式 latest。

本机凭据：C:/Users/DELL/AppData/Local/TingyuFeedback/read.dpapi、admin.dpapi，分别加密。
普通list/pull/summary只读；管理mark/login-link须显式操作。可通过安全环境变量读取
TINGYU_FEEDBACK_API_URL和TINGYU_FEEDBACK_READ_TOKEN，默认使用系统持久化存储。

后续用户只需提出“检查云端日志”“修复最近反馈”或具体播放/歌词/闪退问题，Codex按AGENTS流程
拉取真实日志、聚组排序、对照版本源码、区分已确认/可能/证据不足并最小修复。CLI支持list、
pull --hours 24、--id、--type、--issue、--version、summary。旧分组应加--hours 720。
真实云端已部署。初次验收读取四条明确标记的合成反馈；2026-11-14 已通过本机持久化只读凭据
读取用户从 1.5.40 客户端主动提交的测试反馈，中文描述、版本/commit 和 43,848 字节白名单
诊断日志均正常，下载 SHA256 校验通过。该记录是用户测试上传，不能认定为实际闪退或独立用户统计。
Python 默认 User-Agent 曾被 Cloudflare 拒绝，现已显式使用 Tingyu-feedback/1.0，真实请求通过。

## 用户最后需要的事项与限制

1. 安装新版测试包，在实际手机/Pad/车机验证交互、播放中上传、闪退恢复/安全页、背屏/AOD及本地/在线回归。
2. Cloudflare 控制台核验套餐及用量通知；发生恶意请求或费用异常可在后台立即暂停。

真实云端安全验收执行 tools/test_feedback_live.py --allow-test-uploads --security-checks：
包括短暂暂停/恢复、敏感字段/ZIP/超大正文拒绝、PoW要求、Android CORS、有/无日志、重放、
私有下载一致性及状态权限。合成反馈已关闭，使用 version=feedback-acceptance 可筛选；30天到期清理。
限流/容量/并发与云故障回滚的详尽验证仍为本地模拟，未通过耗尽生产配额或破坏存储测试。

安全启动页目前支持独立手动反馈导出，没有独立云端提交；部分旧专用诊断因隐私未原样上传。
设备/用户独立数量证据不足时留空，仅统计环境组合；同指纹仍需根因分析；后台聚组最多100组。
日志30天后不可恢复，旧版本或dirty构建可能缺完整源码对应。PoW会增加有限CPU，低端机仍需测。

## 1.5.41 正式包前的反馈图标修复

用户截图中的播放异常、播放卡顿、本地音乐异常共用 Music4，但原生资源缺少 music-4，
导致 Compose 留出图标位置却没有路径可画。现分别采用 circle-play、audio-lines、file-music；
cap:sync:android 自动执行现有 Lucide 导出脚本，同步真实安装版本的图标与别名。

39 项反馈/诊断/语义契约测试、18 项 Android 页面归属检查及类型检查通过。
原生 JVM Debug 11 项通过，反馈弹窗检查经典/冰川深浅色、手机/Pad 共 8 种组合；
已查看原生截图确认三项图标可见。测试仍跳过底层 Haze 设置顶栏，不能代表实机毛玻璃、
播放中上传或厂商背屏行为。版本已按发布脚本递增为 1.5.41 / versionCode 256。
用户本次明确授权在云端可读取后生成正式签名安装包并发布到 GitHub。
