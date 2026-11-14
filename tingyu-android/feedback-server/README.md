# 听屿云端反馈服务

独立 Cloudflare Worker，复用现有 tingyu-feedback-api、私有 R2 tingyu-feedback 和 D1 tingyu-feedback-db。
数据库 ID bf8680e8-37b3-42f4-b878-0b41fd584ea6，Binding 分别为 DB、LOGS_BUCKET。
账号和完整绑定已写入 wrangler.jsonc；不得另建同名资源或删减绑定部署。

## 数据流和安全边界

用户填写分类/描述/复现 → 本机后台 Worker 生成白名单 JSON → IndexedDB 保存草稿 →
用户预览大小及内容并同意 → 短期签名挑战/PoW → D1 预留 → 私有 R2 存日志 → D1 ready →
返回随机反馈 ID；用户凭本机独立随机查询凭证获取状态。开发者后台和 Python 工具经鉴权读取。
所有诊断解析、PoW、IndexedDB 和 XHR 在后台 Web Worker；原生日志读盘在有界后台执行器。
无自动上传或无限后台重试；本机记录最多20条，30天到期；成功后删除本机上传正文。

上传格式仅 application/json，共享协议在 src/services/feedback/schema.mjs。
不上传已有完整手动诊断包、ZIP、图片、音频、歌词、私人文件、原始请求/响应或登录凭据。
**所有 ZIP 均在服务端拒绝，完全不解压**，因此不存在服务端 ZIP 路径穿越/炸弹路径。
原有手动导出不变；Python 的旧格式安全解压函数另有限制，常规 pull 只下载 JSON。
单份诊断5MiB，整个请求5MiB+32KiB，500事件、10崩溃、每堆栈256帧/64K字符。

## 本地验证

在此目录运行 npm ci、npm test、npm run migrate:local。
.dev.vars 只能含合成测试凭据并已忽略。使用本地 D1 更新 settings.uploads_enabled=true 后，
运行 npx wrangler dev --ip 127.0.0.1 --port 8787 --var UPLOADS_ENABLED:true --var POW_BITS:16 。
node test/local-smoke.mjs 使用合成凭据，验证本地真实 Worker/D1/R2；不是云端测试。
node test/browser.mjs 测移动/Pad/桌面管理后台；node test/client-worker.mjs 需要先在项目根
执行 npm run build:capacitor，验证实际编译后的 APK Worker、丢响应重试、隐私和 UI 响应。
项目根执行 python -m unittest discover -s tools -p test_feedback.py，并运行相关 Vitest/Android JVM 回归。

## 部署及维护

正式远程迁移和部署必须先获得用户确认。先核验账号、现有 Worker 绑定、R2 dev URL 关闭/无公开域名。
本机 Wrangler OAuth 使用 Windows keyring；反馈读/管理凭据分别由 tools/feedback_credentials.py
存于 Windows 用户 DPAPI，目录 ACL 限当前用户。不要打印值，不要在命令行、聊天、Git 中传密钥。

确认后在项目根执行 python tools/deploy_feedback.py --confirmed-remote-deployment：
1. 将0001/0002迁移应用到现有 D1；2. stdin secret bulk 配置 FEEDBACK_READ_TOKEN 和
FEEDBACK_ADMIN_TOKEN；3. 部署当前 Worker 和内置后台及每日03:17 UTC清理 cron。
初始迁移 D1 settings=false，部署本身不会开启第二门。目前已获用户上线确认并通过云端验收，
wrangler.jsonc 的 UPLOADS_ENABLED=true，线上 D1 门也已开启。新环境验收应在获授权范围内打开，
未获得正式开放授权时验收后恢复暂停。正式开放前需安全用例全部通过；管理鉴权
PATCH /api/admin/settings body {"uploadsEnabled":true} 开启第二门。
紧急暂停可在后台点“暂停上传”，立即关闭 D1 门；配置门为false时公开上传无需访问D1。
真实云端验收：项目根 python tools/test_feedback_live.py --allow-test-uploads --security-checks。
该命令创建并关闭两条合成反馈，短暂检查暂停开关；必须在已授权范围内使用。
test/live-browser.mjs 从 stdin 接收 OS 凭据读取器提供的 url/readToken/adminToken，检验手机/Pad后台。
禁止将凭据写入文件或打印到终端；全局及新提交/重放限流也适用于验收，避免反复运行。
变更配置门需重新部署。禁止为了调试开放 R2 或公开日志接口。

安全轮换：先在受保护本机准备新值，通过 stdin secret bulk 更新 Worker，再原子替换对应系统存储。
更新管理密钥会同时使登录 cookie/未用 PoW 失效；只读密钥更新会改变日内匿名限流散列。
勿在凭据不可读时静默覆盖已有加密文件；备份加密凭据及恢复权限由用户管理。

## 接口

| 接口 | 权限/作用 |
|---|---|
| GET /health | 仅返回ok，不泄露绑定/版本/密钥 |
| GET /api/feedback/challenge | 公开限流，签名随机10分钟PoW挑战 |
| POST /api/feedback | 用户主动提交JSON；Idempotency-Key、X-Feedback-Status-Token各64hex；挑战/证明头必需 |
| GET /api/feedback/status?id= | X-Feedback-Status-Token查询凭证，返回状态/时间/修复commit，编号本身不足 |
| GET /api/admin/feedback | read/admin，cursor分页；limit≤100；since/until/type/version/model/os/severity/status/issue/q |
| GET /api/admin/feedback/:id | read/admin，脱敏详情/处理历史；不返回能力凭证散列 |
| GET /api/admin/feedback/:id/log | read/admin，私有JSON；校验大小及SHA256；no-store下载 |
| PATCH /api/admin/feedback/:id | admin，status/commit/note，原子写处理历史 |
| GET /api/admin/issues | read/admin，按证据指纹聚合，优先级排序最多100组 |
| GET /api/admin/stats | read/admin，UTC今日、匿名累计、保留期反馈/问题/待处理/高优先及分布 |
| POST /api/admin/login | 同源，凭据或一次性pairing，1小时HttpOnly Secure SameSiteStrict cookie |
| POST /api/admin/pairings | admin，生成5分钟单次登录URL片段；只存代码散列 |
| GET /api/admin/session; POST /api/admin/logout | 已登录用户；退出使本浏览器cookie到期 |
| PATCH /api/admin/settings | admin，双门中的运行时暂停开关 |

状态：pending/investigating/verification/fixed/unreproduced/closed。
后台主地址：https://feedback.20262000.xyz/admin 。备用地址：https://tingyu-feedback-api.2473297053.workers.dev/admin 。
客户端、崩溃反馈和状态查询共享HTTPS主入口；主动上传最多3次（主、备、主），查询最多2次。
上传复用同一正文、幂等键和状态凭证；失败保留草稿，由用户主动重试。暂停、限流、权限及校验错误不触发切换。
挑战/查询每入口15秒，上传每入口60秒，PoW每次最多90秒；没有无限后台重试。
后台 API 使用同源相对路径；Cookie 是 HttpOnly/Secure/SameSite=Strict，仅当前主机有效。
新旧域名分别登录，不共享浏览器 Cookie，不放宽 CORS；管理员密钥不放在 URL 或 APK 内。
Wrangler routes 明确保留自定义域名，workers_dev=true 保留旧入口，D1/R2 绑定不变。
仅同步域名和发布 Worker 时，在 feedback-server 运行 npx wrangler deploy；**不要运行迁移或 deploy_feedback.py**。
域名切换验收：python tools/test_feedback_live.py --allow-test-uploads --check-backup（项目根目录）。
手机登录推荐在本机执行 python tools/feedback.py login-link --role admin，输出5分钟单次链接。
链接是短期敏感能力，URL片段不会进入普通请求日志，打开后立即清除；不要保存/公开分享。
后台凭据输入不写浏览器存储，所有外部文字通过textContent展示，有CSP/XSS及CSRF保护。
登录需要管理凭据的操作为显式 login-link/mark，普通Codex拉取只使用read。

## 数据表及一致性

0001：feedback(元数据/能力散列/状态/issue指纹/到期/log散列及大小/pending或ready)、quota(触发器计量)、
counters(匿名短期计数)、challenges(用过挑战)、settings、pairings、fix_history(级联删除)。
0002：metrics.accepted_total，只有 pending→ready 首次转换增长，30天清理后只留匿名总数。
状态能力和幂等键随机256bit，仅存SHA256。描述相似不会自动视为相同根因。
堆栈/模块/错误码/通道/版本确定性归组，设备/系统分布用于环境比较；不估算独立用户/设备数。
无异常证据的反馈各自成组。聚合为候选问题，仍需源码/调用链证明根因。

写入先原子预留D1配额，再写R2，最后ready。R2失败最佳努力删文件并回滚；finalize失联时
保留pending，60秒后主动重试会校验对象再恢复ready。2小时未完成记录会清理。
相同幂等键/正文/能力重试返回原编号；冲突409。配额触发器防并发超量。
到期日志先删R2再删D1，失败保留账本；孤立logs对象超过2小时才删，避免干扰进行中上传。
每日最多清理500到期账本，故极端积压物理删除可能晚于30天；API在expires_at后立即拒绝读取。
后台清理故障要告警/人工检查，不能承诺网络故障时准时物理删除。

## 成本与已知边界

默认100上传/日(硬上界500)、256MiB总存储(硬上界1GiB)、最多10k账本。
按日全局挑战2000/提交尝试2000/状态10000/登录500/配对20；同日散列IP小时限流。
PoW默认18bit(16–22)，无APK共享秘密，攻击者伪造客户端也不能绕过服务端配额。
Workers请求和D1拒绝判定本身仍耗配额；应用内限流无法保证任意洪泛下零费用或可用性。
必须核验当前Cloudflare计划/免费额度，平台边缘防护、用量通知及必要时暂停；未配置付费AI。
未修改账号套餐/账单/其他项目。Worker关闭诊断观测日志，代码不输出正文/鉴权/隐私。
上传/挑战输出安全追踪字段，不含正文/头/IP/凭证；有界tail必须用tools/feedback_tail.py过滤。
共享IP新请求120次/小时、通过PoW的新提交30次/小时；已接受同正文/凭证重放60次/键/小时。
具体故障证据、真实CPU与测试边界见 ../docs/FEEDBACK-STABILITY-P0-20261114.md。
首阶段没有Turnstile或额外WAF资源绑定，PoW不是绝对反刷保证。后台登录限流可能被故意耗尽。
未知形态的用户手填秘密无法全自动识别，因此上传前必须预览、确认且按最少数据使用。
