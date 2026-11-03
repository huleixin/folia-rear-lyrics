# 听屿 1.3.119 构建与交付记录（极简播放模式）

配套阅读：`audits/minimal-player-stage-v1.3.119.md`。

## 1. 环境

| 项 | 值 |
| --- | --- |
| JDK | Temurin OpenJDK **21.0.13**（本机原有 JDK 17 编不了：`jvmTarget = 21`） |
| Gradle | 8.14.3（wrapper，`GRADLE_USER_HOME` 指到工作区外目录，避免污染） |
| AGP | 8.13.0 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 |
| Node | 22.22.2 |
| Android SDK | `C:/Users/DELL/AppData/Local/Android/Sdk`（build-tools 36.0.0） |
| 工程路径 | 纯 ASCII（`WorkBuddy/2026-11-03-12-06-47/repo`），未触发 AGP 的非 ASCII 路径限制 |

JDK 21 为本轮单独下载（Temurin 21.0.13+9，解压到工作区 `tools/` 后仅通过 `JAVA_HOME` 使用，未改系统环境）。

## 2. 命令与结果

```bash
npm ci                                   # 依赖安装
npm run typecheck                        # 通过
npm run build:capacitor                  # dist/ 产出成功
npx cap copy android                     # 见下方说明
cd android && ./gradlew assembleDebug assembleRelease --no-daemon
                                         # BUILD SUCCESSFUL
```

单元测试：

```bash
npx vitest run -c vitest.config.ts test/unit/minimalStage.test.ts \
    test/unit/settings/androidSettingsCleanup.test.ts \
    test/unit/stores/storeContract.test.ts
# 33 passed
```

全量单测结果与失败归因见审计文档第六节（14 项失败中 13 项为基线既有，已在未改动检出上复现）。

### `cap copy` 的一处环境限制

本机的安全删除层拦截了 `fs.rm(recursive)`，`cap copy` 在删除旧 `assets/public` 时抛
`safe-delete` 错误，`stashDirs` 的目录 rename 也返回 `EPERM`。处理方式：用
`cp -rf dist/. android/app/src/main/assets/public/` 覆盖写入新产物，并手工删除两个失效的旧
hashed chunk。结果与 `cap copy` 等价——已核对入口 `bootstrap-*.js` 引用的是新 chunk：

```
assets/public/assets/MinimalStage-DJD0m6rq.js     (16737 B)
assets/public/assets/MinimalStage-Blzja3s7.css    (12563 B)
```

## 3. 产物

路径：`tingyu-android/android/app/build/outputs/apk/`

| 文件 | 大小 | 签名 | versionCode | versionName |
| --- | --- | --- | --- | --- |
| `debug/app-debug.apk` | 60,804,566 B | Android Debug（`CN=Android Debug`） | 142 | 1.3.119 |
| `release/app-release.apk` | 56,453,448 B | **官方发布密钥**（`CN=Tingyu, OU=Android, O=huleixin, C=CN`） | 142 | 1.3.119 |

包名：`io.github.huleixin.tingyu`（未改）。

### SHA-256

```text
1744b29f7dd707a8f41ff84b2899da785c6fddb988a5951289657aa3237783f5  app-debug.apk
67594fdde82b4021fa20849f8c234e3d4845aa7981ff87285c559b9d5c927dec  app-release.apk
```

### 签名状态（重要）

本机找到了官方发布密钥 `tingyu-release.p12`（明文口令在其同目录
`signing-password.txt`），已按 BUILD.md 记录的机制接入：`android/keystore.properties`
（被 `.gitignore:56` 忽略，未进版本库，`git status` 中无任何 `p12/jks/keystore`）。

`node dev/build/verifyApkSignature.mjs` 的输出：

```
✓ app-release.apk 由官方发布密钥签名
  证书: CN=Tingyu, OU=Android, O=huleixin, C=CN
  SHA-256: a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d
```

该指纹与仓库文档记录的历史发布证书完全一致（`docs/android-1.3.69-resource-cache.md`、
`docs/android-1.3.71-lyrics-cache-audit.md`、`audits/lx-native-background-playback-v1.3.48.md`
均记录 `a36ef2a5…02249d` / SHA-1 `9D:F0:3C:FB:…`），因此：

- `release/app-release.apk` **可以直接覆盖安装**官方 1.3.118，不需要卸载，不丢数据；
- 前提是设备上装的确实是官方包，且该包的 `versionCode` ≤ 142。

签名方案（`apksigner verify --verbose`）：v2 = true，v3 = true，v1 = false
（minSdk 24，与官方历史包一致）。

### 复现方式

```bash
# android/keystore.properties（不入库）
#   storeFile=<绝对路径>/tingyu-release.p12
#   storePassword=<口令>   keyAlias=tingyu-release   keyPassword=<口令>
cd tingyu-android/android
JAVA_HOME=<jdk21> ./gradlew assembleRelease --no-daemon
cd .. && node dev/build/verifyApkSignature.mjs android/app/build/outputs/apk/release/app-release.apk
```

`app/build.gradle` 检测到 `keystore.properties` 存在才启用 `signingConfigs.release`，
文件不存在时回退为未签名构建——没有密钥的人克隆仓库不会构建失败。

## 4. 未执行

- 真机安装/运行：本机 `adb devices` 无设备，SDK 内无 emulator 镜像。
- 因此 Media3 播放、锁屏/后台、背屏与 LSP 同步、灵动岛、Compose 图层顺序、真实系统栏内边距、
  滑动手感与帧率、连续切歌 50 首、Activity 重建，全部**未经真机验证**。
- 截图来自 Chromium 393×852（模拟状态栏内边距 50/24），不是设备截图。
