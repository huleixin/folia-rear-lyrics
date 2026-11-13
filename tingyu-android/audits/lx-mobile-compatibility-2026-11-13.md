# 听屿洛雪移动版兼容性审计与修复（2026-11-13）

## 结论与验证边界

本次基于最新工作区 `7b99ecd1`（听屿 1.5.23 / versionCode 238）继续实施，保留上一会话的歌单滚动、网易试听恢复、锁屏背屏路由和深色菜单修复。完成了宿主协议、网络传输、歌曲身份、音质恢复、管理入口和诊断的针对性修补。**尚未达到“全部兼容、真机验收通过”的结论。**

没有连接 Android 设备，SDK 中也没有可运行的模拟器。本次没有收到用于对照的用户复现脚本、授权歌曲和音质组合；没有运行仓库历史音源去请求会员或第三方解析服务。下面的“通过”严格区分浏览器 WASM、开发机 JVM、Android 构建/单测与真实设备。

## 1. 官方基准与兼容矩阵

基准：

- [官方移动版协议](https://lxmusic.toside.cn/mobile/custom-source)，2026-11-13 阅读。
- 官方默认分支最新克隆：`lyswhut/lx-music-mobile@0669d1b6d419967822ff52ec06e50b9613bfd136`（提交时间 2026-10-30）。
- [移动版 preload](https://github.com/lyswhut/lx-music-mobile/blob/0669d1b6d419967822ff52ec06e50b9613bfd136/android/app/src/main/assets/script/user-api-preload.js)：实际注册/发送事件、回调参数、buffer/crypto、内置对象保护。
- [移动版 HTTP 实现](https://github.com/lyswhut/lx-music-mobile/blob/0669d1b6d419967822ff52ec06e50b9613bfd136/src/core/init/userApi/request.js)：请求和响应行为。
- [歌曲新旧结构转换](https://github.com/lyswhut/lx-music-mobile/blob/0669d1b6d419967822ff52ec06e50b9613bfd136/src/utils/index.ts)、[歌曲类型](https://github.com/lyswhut/lx-music-mobile/blob/0669d1b6d419967822ff52ec06e50b9613bfd136/src/types/music.d.ts)：歌曲 MID、数值 ID、文件 MID、音质元数据分工。
- [官方 AES](https://github.com/lyswhut/lx-music-mobile/blob/0669d1b6d419967822ff52ec06e50b9613bfd136/android/app/src/main/java/cn/toside/music/mobile/crypto/AES.java)、[官方 RSA](https://github.com/lyswhut/lx-music-mobile/blob/0669d1b6d419967822ff52ec06e50b9613bfd136/android/app/src/main/java/cn/toside/music/mobile/crypto/RSA.java)。

| 项目 | 官方移动版实际行为 | 本次结果 / 证据 | 边界 |
|---|---|---|---|
| 元数据 | UTF-8 头注释，名称/作者/版本/描述/主页，rawScript 为原文 | 保留解析与 1 MB 上限；原生补 rawScript、统一元数据裁剪 | 原生设备导入未验证 |
| globalThis.lx | version=2.0.0，env=mobile | 双端共用协议块，逐字一致性测试 | JVM/WASM 已执行 |
| EVENT_NAMES | request / inited / updateAlert | 三事件保留 | 同上 |
| lx.on | 返回 Promise；仅可注册 request；回调 this 为 lx | 修复原先返回 undefined 与 this 不同 | 拒绝非 Promise handler 有实测 |
| lx.send | Promise；初始化仅一次；更新通知每运行一次 | 双端限制次数、拒绝未知事件 | 弹窗权限/一次性提示未在设备测试 |
| 初始化 | 异步初始化；初始化前异常不能被视作成功 | 等待 inited；补原生状态清理；WASM 延迟发布同步执行中的 inited | 有界初始化预算 65 秒；原生仍等待异步宿主任务，完整时序尚未验收 |
| updateAlert | log 字符串与可选 HTTP 更新地址 | 限制长度、次数，导入检查结果显示提示 | 后台原生提示仍主要进入诊断，不是完整的运行时弹窗系统 |
| HTTP 参数 | method / headers / body / form / formData / timeout；实现另支持 binary | Android 两条通道统一用受限 OkHttp；JSON/表单/文本 multipart/60 秒最大请求预算 | 二进制文件 multipart 未支持，明确报错 |
| HTTP 响应 | callback(err, resp, body)，含 statusCode/statusMessage/headers/body | 字段补齐；错误给 null/null；binary 转 Uint8Array | 开发机真实 HTTP 线缆测试通过 |
| 取消 / 超时 | request 返回取消函数 | 原生真实 Call.cancel；Worker 取消跨桥传递；移除迟到回调；超时 0/无效值使用默认值 | 设备弱网与切后台待测 |
| Cookie / Origin | 脚本可自行提供；不应混入应用账号 | 允许脚本显式 Cookie/Origin；独立无 cookie jar 网络客户；跨 origin 剥离凭据 | Host 固定取目标，公网/DNS/响应体限制保留 |
| HTTP 重定向 | 跟随 HTTP 传输语义 | 307 保留方法/体；302 POST→GET；限制五跳，跨 origin 清凭据 | JVM 受控服务器已验证 |
| utils.buffer | from / bufToString，UTF-8 / hex / base64，字节数组 | 保留并用于加密、二进制回调 | 不等同于全局 Node Buffer |
| AES | 字符串按 UTF-8；支持 aes-128-cbc/ecb | 修复把字符串当 Array.from 字符数组的问题；独立 Node 加密向量验证 | 名为 ECB_NoPadding 的 preload 常量实际值为 AES，原有 PKCS 填充不是本次缺陷，不声称修改它 |
| RSA | RSA/ECB/NoPadding，公钥 | 补齐原生 Cipher 与网页公钥运算；同一 SPKI 向量两端通过 | 不提供私钥、任意算法入口 |
| MD5 / randomBytes | 字符串 MD5，随机字节 | 双端验证；随机长度有界 | 保留安全随机实现 |
| zlib / Node / DOM | 移动版未提供 zlib、全局 Node Buffer、浏览器 API | 不伪装为桌面宿主；缺 API 进入诊断分类 | 不适用，不是声称缺失后仍兼容桌面脚本 |
| 内置对象保护 | 现有成员不可改，允许扩展成员，阻止动态代码构造 | 补保护、封闭宿主闭包；扩展成员与 eval/Function 拒绝实测 | 不是形式化安全审计 |
| JS 生命周期 | 独立脚本上下文、错误隔离 | 关闭清能力与请求，换源丢弃旧结果，销毁旧线程，独立导入验证不覆盖活跃源 | 原生 CPU 死循环的硬中断仍是已知缺口，见待办 |
| 普通来源 | kw/kg/tx/wy/mg 只请求 musicUrl | 过滤动作；原生请求再次门控 | 不向普通源强制请求歌词/封面 |
| local 来源 | qualitys=[]；musicUrl type=null；可 lyric/pic | 两端能力接受 local；引擎 null 与歌词对象/封面均实测；本地缺失资源接现有解析器 | 本地文件播放继续原文件，未增加自定义 URL 自动替换入口 |
| musicInfo | 官方调用旧结构；tx.songmid 是 MID，songId 为数值 ID，strMediaMid 为文件 MID | 两端区分三种 ID；补 meta 别名及原生专辑 ID；拒绝来源身份不一致 | 平台目录未携带的音质专属 hash 不能臆造，真实目录覆盖待样本 |
| musicUrl 返回 | Promise 返回 HTTP URL 字符串，最长 2048 | 双端检查；空、非法 URL/对象不给播放器 | 任意 {url,headers} 属非官方扩展，未假装支持 |
| 需要 CDN 头的 URL | 官方返回格式本身不含任意头对象 | 保留 LxAudioProxy / 原生远程音频转发的现有头策略与 Range 链 | 特殊 CDN 实播待有权限资源与设备 |
| 四档音质 | 128k / 320k / flac / flac24bit，以声明为准 | 可配置等档/降级，失败后逐档尝试；拒绝暗中升级；原生 flac24bit 不再归为 flac | 声明/协商不是音频验证；UI 显示“实际未验证” |
| 同平台恢复 | 可重试但不得循环 | 每档 0 或 1 次重试；原生/网页解析阶段总预算 65 秒 | 链接失效后的实际解码恢复待设备 |
| 跨平台换源 | 需重新匹配真实平台条目 | Omni 检索；严格名称、歌手集合与已知时长校验；用候选自身 ID；最多 12 次取流 | 前台实现；原生后台不独立检索跨平台，明确交回前台 |
| 歌词 | lyric/tlyric/rlyric/lxlyric，源码拼写为准 | local 能力门控；翻译/罗马音/逐字轨送既有 AWLRC/LRC 解析器 | 文档个别字段拼写与源码不一致时按源码；设备同步动画未测 |
| 并发切歌 | 迟到结果不能覆盖新身份 | 保留既有播放代次守卫，补源同步串行和换脚本结果门控；预取不写别首当前音质 | Android 原生/兼容通道快速切歌待设备 |

## 2. 原有功能与本次变化

基线扫描分类：

- 已实现：本地文件导入、头部解析、8 源管理、启用/停用/删除、搜索来源选择、Media3/兼容链路、原生诊断导出。
- 部分实现：事件与 Promise、加密工具、HTTP 响应/取消、musicInfo 转换、音质/换源恢复、脚本回收与隔离。
- 缺失：URL 导入、同名原位更新/回退、手动在线版本检查、local 特殊能力、完整的管理策略入口和网页源分阶段诊断。
- 不适用：桌面 Node/DOM、全局 Node Buffer、移动协议未提供的 zlib、复制整个官方 App、更换播放器核心。

| 功能 | 原有情况 | 本次变化 |
|---|---|---|
| 本地导入、头检查、元数据、启用/停用/删除、最多 8 源 | 已有 | 沿用；统一双引擎导入校验 |
| 多音源选择、恢复平台音源、搜索平台选择 | 已有 | 保留；只运行所选脚本 |
| 网络 URL 导入 | 缺失 | 公网 URL 下载、状态/格式检查、同一沙箱校验 |
| 同名更新 | 不同 UUID 导致重复 | 保留原 ID 原位替换，保留一份上一版；写存储失败不改状态 |
| 在线版本检测 | 缺失 | 手动检查导入 URL，显示版本变化后再安装；支持回退；不自动访问主页猜下载地址 |
| 原生同步 | 同步失败提前记为已成功；并发安装可能乱序 | 串行提交、仅按结果去重；失败后可重试；同步策略参数 |
| 音质 | 声明选择已有；失败时无完整降级策略 | 默认音质入口、自动降级开关、失败后逐档尝试、协商质量标为未验证 |
| 来源恢复 | 同脚本一次备用匹配已有 | 手动默认平台、优先级、0/1 重试、有限平台循环、严格匹配 |
| 歌词、封面 | 听屿现有系统已有 | 仅补 local 声明能力的缺失资源回退，保留本地/内嵌/用户选择优先 |
| 管理页面 | 文件导入、列表、测试、删除已有 | 现有弹窗/原生语义设置模型增加管理入口；没有新建风格不同的页面 |
| 诊断导出 | 已有原生与播放器日志 | 增加网页 LX 分阶段诊断，错误分类与双端凭据脱敏；沿用原导出分享流程 |
| 播放器、导航、极简歌词、舞台、封面动画 | 已有 | 保留架构与行为，不重写 Media3 或原生核心 |

## 3. 可证实缺陷与代码位置

以下是本次静态审计、受控向量、HTTP 服务器或回归用例证实的缺陷。**没有把这些缺陷冒称为某个未提供的用户脚本唯一根因。**

1. RSA 直接抛“不支持”，官方 Android 支持；现在实现并对比独立向量。
2. AES 字符串 data/key/iv 被字符数组序列化，再被按数字字节解析，输入实际错误；现在先 UTF-8 编码。
3. lx.on 不返回 Promise、回调 this 不同、send 没有限制重复事件；现在统一事件语义。
4. 原生取消函数为空，HTTP 缺 statusMessage / binary / multipart；现在与 Worker 共用受限传输，真实取消、超时和字段经过线缆测试。
5. local 被能力校验排除；现在接受合法空音质与 lyric/pic 声明，并接入缺失本地资源。
6. 原生 currentScriptInfo 缺 rawScript、失败重启可残留能力、close 未彻底销毁线程；分别补齐/清理。
7. QQ 的歌曲 MID、数值 ID 与文件 MID 在原生构造时混淆，数字被字符串化；现在分别保持，新增测试；并按官方 WY 搜索输出保留安全范围内的数值 songmid。
8. 原生队列只有专辑名但缺专辑 ID；仅在 LX 资源载荷中补源记录专辑 ID，避免把专辑名当 ID。
9. 同名导入重复、更新后旧音频缓存复用；原 ID 替换与持久化修订号隔离缓存。
10. 同步失败后的去重和同时安装乱序；串行队列并按成功结果决定去重。
11. 默认支持选档但无法对实际失败做配置化降级，且请求档位被当成实际质量；补策略与未验证标记。
12. 原生 HTTP 原先只解析对象/数组，JSON 字符串、数值、布尔与 null 类型可能错误；补标量响应解析，同时确认原始 JS 下载正文不被误解析截断。
13. 预取可能更新另一首歌曲的当前音质；仅为仍是当前身份的歌曲更新状态。
14. 恢复原音源与原生脚本清理之间，旧 LX 解析器可能仍认领 ORIGINAL 请求；显式原平台请求跳过 LX 解析器，模拟迟到清理的回归覆盖 QQ/网易/酷狗。
15. 清理未知定时器或已完成 HTTP 请求不应创建宿主取消残留；现在无效 clearTimeout 为 no-op，已完成请求的取消也不会回到宿主。


代码锚点（报告生成时的行号）：

- `src/services/lxSource/protocol.ts:3`
- `src/services/lxSource/contract.ts:17`
- `src/services/lxSource/client.ts:56`
- `src/services/lxSource/playback.ts:14`
- `src/services/lxSource/musicInfo.ts:9`
- `src/services/lxSource/localResources.ts:11`
- `src/services/lxSource/management.ts:17`
- `src/stores/useLxSourceStore.ts:26`
- `src/services/lxNativeScriptSync.ts:35`
- `src/services/nativePlaylistSync.ts:121`
- `src/components/audio-tools/LxManagerControls.tsx:9`
- `src/services/lxSource/diagnostics.ts:4`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxScriptEngine.kt:65`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxHttp.kt:64`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxUtility.kt:137`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxPlatform.kt:94`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxRuntimeHost.kt:154`
- `android/app/src/main/java/io/github/huleixin/tingyu/resolver/LxNativeResolver.java:64`

- `android/app/src/main/java/io/github/huleixin/tingyu/resolver/ResolverRegistry.java:94`：恢复原音源期间排除旧 LX 解析器。

## 4. 实际执行的验证

最终结果由同目录交付验证 JSON 与日志核对，下面不把开发机结果改称真机结果。

- `npm run typecheck`：类型与主题生成一致性检查。
- 定向 Vitest：洛雪协议/导入/缓存/管理存储/匹配/音质恢复、nativeMinimalTools、onlinePlayback、nativePlaylistSync、Android 页面归属、命令注册与翻译契约。
- 受控 `contract.js` 返回 example.com 占位 URL，用于宿主协议测试，不是可听歌的生产音源，不能据此宣称实播通过。
- `gradlew -p tools/lx-probe test compatibility`：13 项真实 HTTP 传输用例，加 13 项真实 QuickJS JVM 引擎断言；加密向量由 Node crypto 独立生成。网络用 MockWebServer 与测试专用 DNS 客户，不请求外部解析服务。
- Playwright：393×852 与 1280×900；现有设置入口→URL 导入→启用→策略→默认来源→在线更新→回退→删除，检查原生语义模型也携带控件；另验证失控 while(true) 脚本在 WASM 中被中断且不覆盖当前音源。浏览器不是 Android Compose 像素实测。
- `npm run cap:sync:android` 后执行 `:app:testDebugUnitTest assembleRelease`；最终打包不使用过期 Web 资源绕行参数。第一次仅原生编译因资源过期检查被阻止，随后正规同步重建；第一次全量单测的字符串空格断言已改成不依赖空格的序列化保护检查。
- `adb devices -l`：设备列表为空；没有可用模拟器。未执行 APK 安装、真实解码、锁屏/后台音频或官方 App 对照。

最终计数/构建状态：类型检查通过；Vitest 152/152（19 文件）；原生全量单测 1315/1315；JVM 引擎 13/13；HTTP 13/13；Playwright 管理全链路与恶意脚本隔离 1/1；Release 构建成功；签名验证通过；APK 内 2035 个 Web 文件逐个与最终 dist 哈希一致。

浏览器观察：没有 pageerror 或框架错误覆盖层；离线测试环境的 Service Worker 拦截、QQ/酷狗未配置、匿名 cookie 请求得到测试页等警告来自既有首页请求，不能视作真实账号或联网功能通过。Browser 插件不可用，使用仓库 Playwright；可安装 Browser 插件以便后续在应用内检查。

## 5. 尚未完成 / 无法验证

### 2026-11-13 后续修订（1.5.24）

- 管理页已按“更新与来源 → 已安装音源 → 播放与换源设置 → 诊断”重新排版；Android 原生页同步采用标准 Switch、中文平台名称和当前音源详情，不再使用整块文字按钮表示开关。
- 本地导入音源现可绑定公网更新地址；检查、安装与回退形成完整流程。下载或校验失败不替换当前版本，内网更新地址被拒绝。脚本 `updateAlert` 仍由现有入口展示，尚无后台系统通知。
- 登录仍分为平台账号与音源专属授权。官方移动版自定义源协议没有统一登录接口；当前继续使用听屿平台账号。需要独立登录的音源必须依据其作者提供的真实认证协议适配，不能把平台 Cookie 自动交给脚本。
- 新增修订的验证：前端/逻辑 154 项，原生 1315 项；Playwright 管理页完整更新与失败保护流程通过。真机验证和已知运行时缺口仍然有效。

- **P1 已知运行时边界：quickjs-kt 1.0.5 没有公开的执行中断接口。原生协程超时不能证明能抢占同步 CPU 死循环。** 没有为了兼容取消隔离；沙箱不暴露文件/Java/Android/应用凭据，保留内存限制；但不能据此声称恶意脚本 CPU 隔离已验收。WASM 的中断已有测试。后续需受控进程隔离或经验证的引擎中断能力，属于单独的原生运行时补强；本次没有在无设备的情况下冒险更换引擎。
- 原生执行器沿用 quickjs-kt 的异步宿主任务等待机制；长定时器、无关的后台 HTTP 任务可能推迟初始化或取流完成，未完成所有官方回调时序的对齐。此项是源码审计发现的待办，不计入 13 项受控断言的通过范围。
- 原生后台独立跨平台检索/匹配尚未实现：按策略进行同平台降级；默认指定别的平台时明确交回前台，绝不把旧 ID 塞给另一平台。前台换源已实现与测试。
- 二进制文件 multipart、完整后台 updateAlert 用户弹窗、local.musicUrl 的本地文件自动 URL 替换入口未实现；没有伪报这些能力完整。
- 没有用户复现样本：还需同脚本、同歌曲、同音质与官方 Android App 对照，尤其是复杂混淆脚本、平台质量专属 hash、特殊 CDN 请求头。
- 未验证：URL 的实际 Media3/兼容通道播放；暂停/恢复/拖动；连续切歌信息一致性；链接过期/解码失败后的降级与恢复；FLAC/24bit 真实采样/编码；歌词舞台、封面动画、后台/锁屏与账户源实机回归。
- 不把音源声明或 URL 扩展名当作真实音质；当前显示的是已协商档位与“实际未验证”。

建议设备验收使用本次受控源和自有 WAV/FLAC 服务器，再提供有权限的真实脚本样本。用户可在现有洛雪管理页导出完整诊断。已确认缺口与无设备项均不计为通过。

## 6. 修改文件与交付

构建产物、摘要、日志与截图放在独立交付目录，不上传微盘或未知服务。本次未修改播放器核心、底栏导航动画、极简歌词绘制、舞台或 QQ/网易/本地 provider 实现。既有 LxAudioProxy / Media3 传递链保留。

修改 / 新增文件（不含生成的 Android Web 资产与本地日志，共 63 个）：

- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxBootstrap.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxHttp.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxPlatform.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxRedaction.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxRuntimeHost.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxScriptEngine.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/lx/LxUtility.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/minimal/ui/MinimalToolsSheets.kt`
- `android/app/src/main/java/io/github/huleixin/tingyu/playback/TingyuPlaybackPlugin.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/resolver/LxNativeResolver.java`
- `android/app/src/main/java/io/github/huleixin/tingyu/resolver/ResolverRegistry.java`
- `android/app/src/test/java/io/github/huleixin/tingyu/lx/LxEngineTest.java`
- `android/app/src/test/java/io/github/huleixin/tingyu/lx/LxHttpMappingTest.java`
- `android/app/src/test/java/io/github/huleixin/tingyu/resolver/AllSourcesRoutingTest.java`
- `audits/lx-mobile-compatibility-2026-11-13.md`
- `src/components/audio-tools/LxManagerControls.tsx`
- `src/components/audio-tools/LxSourceDialog.tsx`
- `src/components/audio-tools/QualityDialog.tsx`
- `src/components/audio-tools/audioTools.css`
- `src/components/command-palette/commands/playbackCommands.ts`
- `src/hooks/useAudioQualitySwitch.ts`
- `src/hooks/useLibraryPlaybackController.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/in.ts`
- `src/i18n/locales/zh-CN.ts`
- `src/services/lxNativeScriptSync.ts`
- `src/services/lxSource/bootstrap.ts`
- `src/services/lxSource/catalogMatch.ts`
- `src/services/lxSource/client.ts`
- `src/services/lxSource/contract.ts`
- `src/services/lxSource/diagnostics.ts`
- `src/services/lxSource/http.ts`
- `src/services/lxSource/localResources.ts`
- `src/services/lxSource/management.ts`
- `src/services/lxSource/musicInfo.ts`
- `src/services/lxSource/playback.ts`
- `src/services/lxSource/protocol.ts`
- `src/services/lxSource/rsa.ts`
- `src/services/lxSource/runtime.worker.ts`
- `src/services/lxSource/session.ts`
- `src/services/lxSource/utilities.ts`
- `src/services/nativeMinimalTools.ts`
- `src/services/nativePlaylistSync.ts`
- `src/services/onlineMusic/resourceKeys.ts`
- `src/services/onlinePlayback.ts`
- `src/stores/useAudioToolsStore.ts`
- `src/stores/useLxSourceStore.ts`
- `src/types/onlineMusic.ts`
- `src/utils/buildDiagnosticReport.ts`
- `test/component/lxSourceManager.spec.ts`
- `test/fixtures/lx-mobile/contract.js`
- `test/fixtures/lx-mobile/vectors.json`
- `test/unit/command-palette/__snapshots__/commandRegistryContract.test.ts.snap`
- `test/unit/services/lxHttp.test.ts`
- `test/unit/services/lxLocalResources.test.ts`
- `test/unit/services/lxMobileConformance.test.ts`
- `test/unit/services/lxMusicInfo.test.ts`
- `test/unit/services/lxNativeScriptSync.test.ts`
- `test/unit/services/lxPlaybackPolicy.test.ts`
- `test/unit/services/lxSourceStore.test.ts`
- `tools/lx-probe/build.gradle`
- `tools/lx-probe/src/main/kotlin/io/github/huleixin/tingyu/probe/LxCompatibility.kt`
- `tools/lx-probe/src/test/kotlin/io/github/huleixin/tingyu/lx/LxHttpProtocolTest.kt`

最终审阅 APK：`Tingyu-1.5.23-lx-review.apk`，56973274 字节，SHA-256 `f3e1c5317982b28c3473ad587d8b8c5e146073ce2d3d73a645d542fe91ce5ac3`。应用版本仍为 1.5.23 / 238，与原发布包通过文件名和哈希区分；本次没有发布新的稳定版本。

交付目录：`C:\Users\DELL\Documents\Codex\2026-11-10\hze\outputs\lx-compat-20261113`。包括 APK、修改源码归档、验证 JSON、SHA256SUMS、原始验证日志，以及 `lx-mobile-manager.png` / `lx-desktop-manager.png` 两张截图。
