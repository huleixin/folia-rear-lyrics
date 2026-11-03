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
| `release/app-release-unsigned.apk` | 56,175,497 B | **未签名** | 142 | 1.3.119 |

包名：`io.github.huleixin.tingyu`（未改）。

### SHA-256

```text
1744b29f7dd707a8f41ff84b2899da785c6fddb988a5951289657aa3237783f5  app-debug.apk
597a2fa8c0bd5f8092b538559be5717ff69320cb5ac1c4416af753726df776a7  app-release-unsigned.apk
```

### 签名状态（重要）

`apksigner verify`：

```
debug/app-debug.apk            → 通过，证书 CN=Android Debug
                                  SHA-256 8c1740d699242f6c540ec8b4e54d45fa127858b900db632e8d2224bebced13ae
release/app-release-unsigned.apk → DOES NOT VERIFY / Missing META-INF/MANIFEST.MF
```

本机**没有**原发布密钥（`tingyu-release.p12`，证书 `CN=Tingyu, OU=Android, O=huleixin, C=CN`）。
因此：

- 这两个包**都不能覆盖安装**已安装的官方 1.3.118（签名不同）；
- 它们是可安装、可测试的构建产物，不是可直接分发的更新包。

要得到可覆盖安装的包，请用官方密钥对 `app-release-unsigned.apk` 重签（与 BUILD.md 记录的流程一致）：

```bash
apksigner sign --ks tingyu-release.p12 --ks-key-alias tingyu-release \
  --ks-pass pass:<口令> --key-pass pass:<口令> \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --out Tingyu-Android-v1.3.119.apk app-release-unsigned.apk
```

我没有生成任何新密钥，也没有把 debug 包描述成可覆盖安装的更新。

## 4. 未执行

- 真机安装/运行：本机 `adb devices` 无设备，SDK 内无 emulator 镜像。
- 因此 Media3 播放、锁屏/后台、背屏与 LSP 同步、灵动岛、Compose 图层顺序、真实系统栏内边距、
  滑动手感与帧率、连续切歌 50 首、Activity 重建，全部**未经真机验证**。
- 截图来自 Chromium 393×852（模拟状态栏内边距 50/24），不是设备截图。
