# 离线缓存与洛雪音源专项测试包校验

本报告记录 2026-11-15 本机检查，源码基线为 `8fa04620`（正式版 1.5.45），叠加当前专项未提交修改。没有创建 GitHub Release 或更新正式渠道。功能、使用步骤和限制见 [专项说明](offline-audio-cache.md)。

## 安装包

| 项目 | 实际结果 |
| --- | --- |
| 版本 | `1.5.45-playback-test.3` |
| versionCode | `26003` |
| 包名 | `io.github.huleixin.tingyu.playbacktest` |
| 应用名称 | 听屿播放测试 |
| 文件大小 | 57,449,472 字节 |
| SHA-256 | `878527d88dbd61ad1fdfeca0b561cb8c11eb1ef61ae51dd8b63eb3461901e7f8` |
| 签名 | APK v2/v3 校验通过，证书与现有正式版 1.5.45 相同 |
| 签名证书 SHA-256 | `a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d` |
| ZIP 校验 | 所有条目 CRC 校验通过 |
| 最低系统 | Android 7.0 / API 24 |
| ABI | arm64-v8a、armeabi-v7a、x86、x86_64 |
| Web 资源标记 | 包名与版本一致；默认使用兼容播放通道 |

输出目录：`C:/Users/DELL/Documents/Codex/2026-11-10/hze/outputs/tingyu-1.5.45-playback-test.3/`。包含 APK、`SHA256SUMS` 与 `verified-build.json`。

测试包使用独立包名，与正式版并存；不会直接读取正式版账号、脚本、歌单和缓存数据。安装后需在测试版重新配置。相同签名不表示相同应用数据目录。

## 本机实际通过

- `npm run typecheck`：TypeScript 和主题生成检查通过。
- `npm run check:android-ui`：18 项代码归属规则检查通过。
- 15 个前端测试文件：129 项通过，覆盖分页入队、重试位置、来源隔离、脚本备用顺序与初始化超时等。
- 11 个原生测试套件：50 项通过，0 失败、0 错误、0 跳过。包括 Robolectric 模拟数据库、任务去重、字节范围缺口、来源匹配与元数据校验。
- `npm run build:playback-test`：Web 测试资源构建通过。
- `:app:assembleRelease -PtingyuPlaybackTest=true`：正式签名测试 APK 构建通过。
- `aapt2 dump badging`、`apksigner verify --verbose --print-certs`、Python `ZipFile.testzip()`：版本、签名、归档完整性通过。
- `git diff --check -- .`：通过。

签名对比使用已存在的 `hze/outputs/tingyu-1.5.45-release/tingyu-1.5.45.apk`。没有修改签名文件或输出密钥。

## 尚未通过实际设备验证

本机没有连接 Android 设备；以下均未宣称已通过：

- 真实平台/LX 音频请求、MediaExtractor 验证、实际完整缓存播放。
- 两个播放通道的断网重启、整单缓存切歌和拖动进度。
- Wi-Fi/移动网络切换、系统省流量模式、锁屏和后台恢复。
- 手机、Pad、经典/冰川主题与深浅色的实际显示。
- 缓存写入期间播放、歌词、背屏稳定性以及功耗测量。

测试顺序建议：先缓存一首并断网重启播放，再测试小歌单、网络切换与锁屏，最后测试备用脚本及跨平台曲目。设置中缓存默认关闭，仅 Wi-Fi 默认开启。

## 变更范围与交付边界

改动覆盖原生私有音频缓存、持久化下载任务、播放数据源接入、原生/前端 LX 路由、歌单缓存操作、存储设置、命令入口、多语言及相关测试。完整变更文件与文件哈希保存在输出目录的 `verified-build.json`；未包含凭据或用户诊断数据。根 README 未修改。

原生匹配基于歌名、全部歌手、版本标记和时长；不能确认时不替换。缓存验证确认字节连续、容器与时长、DRM 标记及首尾样本，未执行逐样本解码，也不鉴定真实 Hi-Res。没有读取其他应用的加密缓存或绕过明确的账号/版权限制。

缓存完整音频可避免再次请求音频，但本地读取和解码仍需要时间；未保存的封面、歌词、搜索和歌单页面仍可能需要网络。更多后台、分页、超时与空间限制见专项说明。
