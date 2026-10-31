# 听屿 Android 1.3.60 构建与验证记录

本文件记录本次修复在**本机**实际执行的构建命令与结果，配合
`audits/lsp-rear-lease-and-island-lyrics-v1.3.60.md` 阅读。

## 1. 环境

| 项 | 值 |
| --- | --- |
| JDK | Microsoft OpenJDK 21.0.7（项目 `compileOptions` 与 Kotlin `jvmTarget` 都是 21，JDK 17 编不了） |
| Gradle | 8.14.3（wrapper） |
| AGP | 8.13.0 |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 |
| Node | 22.22（`package.json` 要求 ≥24，`npm ci` 只报警告） |

> 本机项目路径、SDK 路径、`~/.gradle` 都含中文。AGP 会直接拒绝非 ASCII 工程路径；
> 即使加 `-Pandroid.overridePathCheck=true` 绕过，Gradle 8.14.3 的测试 worker 仍会因
> 类路径编码问题失败（`ClassNotFoundException: GradleWorkerMain`）。
> 因此实际构建在 ASCII 镜像路径完成：`C:/tb/tingyu`（源码逐字节一致，
> `node_modules` 用 junction 指回原目录，`GRADLE_USER_HOME=C:/tb/gradlehome`、
> `sdk.dir=C:/tb/sdk` 同样是指向真实目录的 junction）。

## 2. 前置步骤

```bash
npm ci                                   # 前端依赖
npm run build:capacitor                  # 产出 dist/（Capacitor 用 Web 资源）
# 把 dist/ 拷到 android/app/src/main/assets/public/（等价于 cap copy）
```

`android/capacitor.settings.gradle` 里原本是作者机器上的相对路径
（`../../../folia/tingyu-android/node_modules/...`），已改为 `../node_modules/...`，
任何 checkout 都能用。该文件由 `npx cap sync` 生成，若重新生成会覆盖。

## 3. 单元测试

```bash
cd android
./gradlew :app:testDebugUnitTest
```

结果：

```
685 tests, 0 failures, 0 errors   (102 个测试类)
BUILD SUCCESSFUL
```

本次改动涉及的测试类（全部通过）：

| 测试类 | 用例数 | 说明 |
| --- | --- | --- |
| `RootTaskLookupTest` | 9 | 新增 |
| `WindowTreeProbeTest` | 10 | 新增 |
| `RearWindowRenewPolicyTest` | 8 | 新增 |
| `RearPanelRelightGuardTest` | 6 | 新增 |
| `LyricPublishGuardTest` | 12 | 新增 |
| `RearDisplayLeaseTest` | 19 | 由 11 项扩充；原有语义全部保留 |
| `RearTakeoverPolicyTest` | 7 | 重写（旧断言对应已废除的 attempts 语义） |

## 4. APK

```bash
./gradlew :app:assembleDebug :app:assembleRelease
```

```
BUILD SUCCESSFUL in 26m 28s
364 actionable tasks
```

产物（`android/app/build/outputs/apk/`）：

| 文件 | 大小 | 签名 |
| --- | --- | --- |
| `release/app-release.apk` | 38,717,621 B | **官方发布密钥**（`CN=Tingyu, OU=Android, O=huleixin, C=CN`） |

> 早期那版 `app-release-unsigned.apk`（未签名）与 debug 包已被这版取代并清理。

清单校验：

```
package: name='io.github.huleixin.tingyu' versionCode='83' versionName='1.3.60'
sdkVersion:'24'  targetSdkVersion:'36'  compileSdkVersion='36'
```

`apksigner verify`：debug 包通过（`CN=Android Debug`）；release 包
`DOES NOT VERIFY / Missing META-INF/MANIFEST.MF`，符合「没有密钥、未签名」的预期。

### 原版签名出包（已完成）

2026-10-31 取得官方加密备份后，用**原发布密钥**重签了 1.3.60：

| 项 | 值 |
| --- | --- |
| 密钥库 | `tingyu-release.p12`（PKCS12，1 个 `PrivateKeyEntry`，别名 `tingyu-release`） |
| 证书 DN | `CN=Tingyu, OU=Android, O=huleixin, C=CN` |
| 证书 SHA-256 | `a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d`（与 1.3.39 / 1.3.59 官方包逐位一致） |
| 签名方案 | v2 = true，v3 = true，v1 = false —— 与官方包同构 |
| APK（1.3.60） | `app-release.apk`，38,717,621 B，`versionCode=83 / versionName=1.3.60` |
| APK SHA-256（1.3.60） | `909c450e07ab462742961cd6fd02b3559fd914cad21efe11790d0100ee51ca0a` |
| APK（1.3.61） | 39,404,219 B，`versionCode=84 / versionName=1.3.61` |
| APK SHA-256（1.3.61） | `8c95f68e149cd3e7bb82598ae6f01b62778bb9fc745e908e3ea09ef77981c55e` |
| APK（1.3.62） | 39,420,627 B，`versionCode=85 / versionName=1.3.62` |
| APK SHA-256（1.3.62） | `744726b9e75468054bfd60b7a676cc154e4d237fc6893d5b7493b49656700a7f` |
| APK（1.3.63） | 39,420,621 B，`versionCode=86 / versionName=1.3.63` |
| APK SHA-256（1.3.63） | `b6a7851156146cb9f05dafba6007fb2c87433798d8e199c5e0dd287e13c5cd6e` |
| APK（1.3.64） | 39,420,637 B，`versionCode=87 / versionName=1.3.64` |
| APK SHA-256（1.3.64） | `8593f731c2e4d226dba9fe637234c4a02003aa1891ea4561f1c0f1a7c3575aa5` |
| APK（1.3.65） | 38,731,425 B，`versionCode=88 / versionName=1.3.65` |
| APK SHA-256（1.3.65） | `ef4e6fa99fedf7172f7b5d68bbb895796667b89c80f4d8ba74138ebc768c8565` |

1.3.61~1.3.65 用同一把密钥重签，`verifyApkSignature.mjs` 判定同样通过；六版证书指纹一致，
因此 1.3.65 可以直接覆盖安装 1.3.60 ~ 1.3.64，不需要卸载。

校验关输出（1.3.60）：

```
✓ Tingyu-Android-v1.3.60.apk 由官方发布密钥签名
  证书: CN=Tingyu, OU=Android, O=huleixin, C=CN
  SHA-256: a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d
```

包名相同、`versionCode` 83 > 82、证书相同 —— **可以直接覆盖安装官方 1.3.59，不需要卸载**。

#### 踩到的一个坑（写下来备查）

`keystore.properties` 由 `Properties.load(InputStream)` 按 **ISO-8859-1** 解析，`storeFile` 里带中文
路径会被读成乱码：

```
Keystore file 'C://Users//ä¸­å..." not found for signing config 'release'.
```

解决办法是把非 ASCII 字符写成 `\uXXXX` 转义（`C:/Users/\u4e1c\u5317\u5927\u599e/...`），
Java 的 Properties 会还原成正确路径。密钥库本身不必搬到 ASCII 目录。

#### 密钥材料的存放与善后

解密产物（明文，均在仓库**之外**的 `relkeys/`）：

```
relkeys/unpacked/tingyu-release.p12          私钥库
relkeys/unpacked/signing-password.txt        明文口令（48 位）
relkeys/tingyu-release-key-backup.zip        解密后的明文压缩包（内容同上）
relkeys/unpacked/README.txt                  原始说明
```

- `android/keystore.properties` 指向上述 `.p12`，已被 `android/.gitignore:56` 忽略；
  `git status` 中不含任何 `p12 / jks / keystore` 文件，仓库内没有私钥；
- 建议把 `.p12` 移进你的密码库或加密盘，再删掉 `relkeys/` 下的明文副本；
  需要我清理请直接说 —— 我不会主动删除密钥材料。

