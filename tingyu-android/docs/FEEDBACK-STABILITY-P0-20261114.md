# 反馈上传稳定性专项 · 2026-11-14

交付1.5.44-feedback-test.1测试APK，沿用包名、versionCode259、原Release签名。
package.json保持1.5.44，不更新正式Release或自动更新。下一正式版code须大于259。

## 已确认故障

旧Worker在幂等查找前扣除共享IP的12次/小时尝试额度。因此第一次已成功的反馈，
再提交同一正文、幂等键和查询凭证也可能返回429 rate_limit。主备域名共用计数器。
真实云端合成测试：六种大小新提交均201并落库；达到旧额度后，对一条已接受记录
连续重试7次，全部429，原记录仍ready。部署后同一记录7次重试全部200、同一编号、无重复对象。
成功率须分别解读：新提交修复前6/6、后6/6；受限重试0/7→7/7。
这证明了幂等缺陷修复，不能证明所有手机DNS、TLS、VPN和弱网问题已解决。

## 修改与安全边界

- 先核验随机幂等键/查询凭证和既有记录，再分类限流；已接受的同正文重试无需新PoW。
  每键60次/小时、全局2000尝试/日仍适用。新请求120次/IP/小时，PoW后的新提交30次/IP/小时。
  每日100上传、总存储256MiB、5MiB诊断上限、白名单脱敏和暂停双门保持。
- 区分挑战已使用、并发预留冲突、D1/R2故障；只返回固定安全代码。
  保留D1预留→私有R2写入→ready、回滚、60秒后pending恢复和2小时清理。
- 主动上传最多3次（主、备、主），600/1200ms加0–200ms抖动；复用正文、键、凭证和有效PoW。
  永久4xx、暂停、配额错误立即停止；查询最多2次；挑战/查询15秒、单次上传60秒。
  HTTPS/TLS不变，没有自动后台上传。失败保留IndexedDB正文/日志，允许手动重试。
- 传输进度与等待服务器确认分开；有效成功响应才删除本机正文。
  即时及历史记录支持复制错误详情：时间、域名、字节数、HTTP、Ray、请求ID、阶段、耗时、重试、代码。
  阶段/代码白名单，不复制服务端任意文字；WebView无法细分DNS/TLS/socket时报告未细分网络错误。
- 请求级安全追踪只输出固定字段和D1/R2等待时间，不记录正文、头、IP、凭证或原始异常。

未发现足以支持异步任务队列的证据，保留同步接收/存储/确认。未重构播放内核、增加资源、
迁移数据库、轮换密钥或更改套餐。云端仅JSON，不解压ZIP或使用Base64/multipart。

## 真实云端测试（本机普通网络）

HTTP耗时不含本机PoW。CPU/wall是按请求ID匹配的Wrangler tail毫秒值，D1/R2是应用等待时间。
这些时间含不同范围，不能直接相加。基线CPU未采到对应请求，不补造数据。

|诊断类型|日志字节|修复前HTTP/耗时ms|修复后HTTP/耗时ms|修复后CPU ms|wall ms|D1/R2 ms|
|---|---:|---|---|---:|---:|---|
|无日志|0|201 / 439|201 / 399|6|227|208 / 0|
|约10KB|9027|201 / 701|201 / 713|14|551|229 / 296|
|约100KB|100744|201 / 1014|201 / 923|29|635|204 / 397|
|约500KB|510115|201 / 1426|201 / 1418|54|1062|207 / 819|
|约1MB|1046995|201 / 1206|201 / 1187|186|729|243 / 325|
|白名单大样本|1731508|201 / 1446|201 / 4357|162|3893|238 / 3626|

最后一条R2等待3626ms，有延迟波动但成功并校验通过。本次未观测到1101/1102/5xx、
D1/R2失败或CPU限制终止，不声称排除所有生产异常。重试CPU4–12ms。
tail收集102事件，无异常。历史重叠六小时窗口1138请求/0错误、1296请求/0错误，
不能当作独立前后对比。账号Workers API返回standard=true，未改套餐，不能宣称在免费计划CPU上限内测试。
Cloudflare安全事件查询被authz拒绝，不能完整核验所有WAF/边缘拦截。

其他真实测试：

- 两并发约10KB/100KB：201，655/1019ms，CPU12/22ms，落库/校验通过。
- 备用域名新10KB：201，756ms，校验通过；tail已结束，此请求CPU无样本。
- 3MiB/近5MiB未知padding字段：400 unsafe_or_unknown_fields，922/850ms；超请求上限：
  400 body_too_large，1370ms；ZIP：400 json_only_archives_rejected，299ms。
  CPU分别70/71/52/3ms，均未落库。这是拒绝测试，不是合法大日志上传成功测试。
  当前500事件/10崩溃/256帧/64K堆栈白名单大样本约1.73MB，未伪造3/5MB合法成功记录。
- 每条成功合成记录D1 ready、R2大小/SHA256、鉴权下载及Codex拉取通过。
  检查时ready30条、quota和关联日志均7293882字节、pending0、拒绝版本0条。
  仅关闭合成记录，未修改真实用户反馈状态。
- 新旧health、未授权401、只读管理写入403、同源/Android CORS、不可信来源拒绝通过。
  未反复切换生产暂停门；暂停/全局配额在本地用例覆盖。
- 真实后台在桌面Chromium的390×844浅色只读/深色管理、1024×768管理视口通过登录、
  筛选、详情、角色、CSRF拒绝、完整管理、宽度及无JS异常检查。
  Cookie保持host-only/HttpOnly/Secure/SameSite Strict。这不是实体手机浏览器测试。
- 本机只读pull --hours 24成功拉取30份记录；系统加密凭据未变，日志只在Git忽略目录。

## 本地结果与缺口

服务端15用例、前端反馈20用例、Android页面归属18用例、Python工具11用例、typecheck通过。
Android Debug JVM崩溃隐私/事件/通道/手机Pad反馈布局17用例通过，Release APK构建通过。
曾尝试Release JVM布局，两例因Robolectric无法解析测试ComponentActivity失败；
未当作产品故障或通过结果，随后Debug JVM验证布局。JVM不代替实体设备。
实际编译Web Worker/IndexedDB/XHR与本地服务器测试通过丢成功响应、三次重试、证明复用、
草稿保留、手动恢复、暂停、状态回退及隐私。末轮首次发送794ms，主线程计时40次；不是播放听测。

实体手机尚需：无VPN/有VPN、VPN开关、Wi-Fi/移动网络切换、弱网、超时后重试、
重启草稿恢复及上传期间持续播放。歌词、背屏、本地/在线音乐未在设备回归。
用户此前国内无VPN的health实测不等同于本机普通网络上传测试。
未测长期高并发/任意洪泛，应用限流不能保证零成本，未擅自开通付费防护。

## 部署、文件和复测

生产Worker版本3b39900f-c9de-439c-98c2-13df1dd6882c，主入口https://feedback.20262000.xyz。
保留workers.dev，核验原Worker/私有R2/D1与域名绑定。没有迁移或修改其他项目。

修改：feedback-server/src/{feedback,index,security,trace}.mjs；
src/services/feedback/{client.ts,endpoints.mjs,feedback.worker.mjs,transport.mjs}；
src/components/modal/feedback/{CloudFeedbackSection.tsx,useCloudFeedbackFlow.ts}、src/i18n/cloudFeedbackCopy.ts；
android/app/build.gradle、vite.config.ts、dev/build/buildFeedbackTest.mjs；
feedback-server/test/{system.test,transport.test,size-fixtures,client-worker,live-browser}.mjs；
tools/{feedback_tail,test_feedback_stability}.py及本报告/维护说明。

构建：node dev/build/buildFeedbackTest.mjs，随后android目录运行
./gradlew.bat assembleRelease -PtingyuFeedbackTest=true。测试标识/资产门控防误发正式版。
发布前核验签名、包名、版本、非debuggable、ZIP完整性、网页资产与dist逐文件相同。
凭据、缓存、真实日志和原始测试记录不提交。

日常只读仍用python tools/feedback.py list / pull --hours 24 / summary。
已授权生产运行调查才用python tools/feedback_tail.py --seconds 180 --output .feedback-cache/p0/tail.jsonl，
最多600秒，先过滤后写出。普通读取不调用Wrangler或管理凭据。
tools/test_feedback_stability.py需显式--allow-test-uploads，固定合成样本，最多8次/2并发；不是日常健康探针。

手机覆盖安装后，在播放中分别无VPN/有VPN主动提交一条反馈并确认编号。
失败时保留草稿、复制“提交错误详情”、主动重试，并提供网络切换步骤。
通过Ray/请求ID匹配服务端证据；证据不足不推测根因。不要填写账号、密码或私人内容。
