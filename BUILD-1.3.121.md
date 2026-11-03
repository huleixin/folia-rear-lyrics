# 构建记录 · v1.3.121（versionCode 144）

## 1. 版本

| | 上一版 | 本版 |
| --- | --- | --- |
| versionName | 1.3.120 | **1.3.121** |
| versionCode | 143 | **144** |
| 包名 | `io.github.huleixin.tingyu` | 未变 |

`node dev/build/bumpAndroidVersion.mjs patch` 生成，`package.json` 与 `package-lock.json` 同步。

## 2. 构建

环境（与 1.3.120 相同）：

- JDK 21（Temurin 21.0.13+9，位于工作区 `tools/`，本机自带的 17 不满足 AGP 要求）
- Android SDK 36，build-tools 36.0.0
- Gradle 8.14.3（wrapper）

```bash
# Web 资源
npm run build:capacitor
# 同步到 Android 工程（覆盖式拷贝，避免 stash 层的删除拦截）
rm -f android/app/src/main/assets/public/assets/MinimalStage-*.js \
      android/app/src/main/assets/public/assets/MinimalStage-*.css
cp -rf dist/. android/app/src/main/assets/public/

# 签名 release
cd android
JAVA_HOME=<jdk21> ./gradlew assembleRelease --no-daemon
```

签名配置：`android/keystore.properties`（`.gitignore` 已忽略，未进版本库）指向
`~/Documents/Codex/2026-10-22/.../tingyu-private/tingyu-release.p12`，alias `tingyu-release`。

## 3. 产物

| 文件 | 大小 | 签名 |
| --- | --- | --- |
| `Tingyu-Android-v1.3.121-release.apk` | 68,562,491 B | 官方发布密钥（v2 + v3） |

### SHA-256

```text
d03b76efea4c906da51b42b6bae35bd3346d4c2775aa6e3d4d0b72e31486c7a1  Tingyu-Android-v1.3.121-release.apk
```

### 验签

```text
$ node dev/build/verifyApkSignature.mjs app-release.apk
✓ app-release.apk 由官方发布密钥签名
  证书: CN=Tingyu, OU=Android, O=huleixin, C=CN
  SHA-256: a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d

$ aapt2 dump badging app-release.apk
package: name='io.github.huleixin.tingyu' versionCode='144' versionName='1.3.121'
```

与 1.3.59 以来的所有官方包同一证书，`versionCode 144 > 143`，**可直接覆盖安装，保留用户数据**。

### 包内资源确认

```
assets/public/assets/MinimalStage-BzJ6KLkB.css   19,014 B
assets/public/assets/MinimalStage-HOblBd2U.js    21,112 B
```

样式含本轮的 `min-amb__grain`、`min-cover__ghost`、`min-wave`、`width:min(100%,43vh)`、
`clamp(0,var(--min-pos…))` 等规则（已解压核对）。

## 4. 未做

- 未生成新密钥，未改包名。
- 未做真机安装验证（本机无设备、无模拟器镜像）。
