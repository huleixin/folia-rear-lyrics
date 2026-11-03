# 构建记录 · v1.3.122（versionCode 145）

## 1. 版本

| | 上一版 | 本版 |
| --- | --- | --- |
| versionName | 1.3.121 | **1.3.122** |
| versionCode | 144 | **145** |
| 包名 | `io.github.huleixin.tingyu` | 未变 |

`node dev/build/bumpAndroidVersion.mjs patch` 生成，`package.json` 与 `package-lock.json` 同步。

## 2. 修的是什么

左右滑动切页、以及刚展开播放页时的闪屏。两条原因都在绘制成本上：背景颗粒用了 `mix-blend-mode`
（整屏混合组），滑动位置用外壳上的 `--min-pos` 广播（每帧重算整棵 DOM 的样式，且圆点每帧改宽度）。
另外补了封面首帧（位图未解码就 `opacity: 1`）和首开时的懒加载空窗。

详细诊断、测量与改动清单见 `audits/minimal-player-flicker-v1.3.122.md`。

## 3. 构建

环境（与前两版相同）：

- JDK 21（Temurin 21.0.13+9，位于工作区 `tools/`，本机自带的 17 不满足 AGP 要求）
- Android SDK 36，build-tools 36.0.0
- Gradle 8.14.3（wrapper）

```bash
# Web 资源
npm run build:capacitor

# 同步到 Android 工程（先清旧哈希产物，再覆盖式拷贝）
node <清理脚本>            # 649 个历史哈希文件 / 14.9MiB
cp -rf dist/. android/app/src/main/assets/public/

# 签名 release
cd android
JAVA_HOME=<jdk21> ./gradlew assembleRelease --no-daemon
```

本机 `android/local.properties` 缺失导致首次 `assembleRelease` 报 `SDK location not found`，
补写 `sdk.dir` 后通过（该文件在 `android/.gitignore` 内，未进版本库）。

签名配置：`android/keystore.properties`（`.gitignore` 已忽略，未进版本库）指向
`tingyu-release.p12`，alias `tingyu-release`。

## 4. 产物

| 文件 | 大小 | 签名 |
| --- | --- | --- |
| `Tingyu-Android-v1.3.122-release.apk` | 51,547,111 B | 官方发布密钥（v2 + v3） |

体积从 68,562,491 B 降到 51,547,111 B。原因不是这次的功能改动，而是 `android/app/src/main/assets/public`
里积了 649 个历史构建的哈希文件（14.9MiB，每次覆盖式同步都不删旧文件）。这些文件没有入口引用，
已清理；`cordova.js` / `cordova_plugins.js` 保留。

### SHA-256

```text
af2206e70b75308d45584637f2b687bf401f8909180cbe422f958bc46d0b9d73  Tingyu-Android-v1.3.122-release.apk
```

### 验签

```text
Signer #1 certificate DN: CN=Tingyu, OU=Android, O=huleixin, C=CN
Signer #1 certificate SHA-256 digest: a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d
```

`node dev/build/verifyApkSignature.mjs <apk>` 退出码 0。与 1.3.121 同一张证书，可直接覆盖安装、保留数据。

## 5. 测试

| 项目 | 结果 |
| --- | --- |
| 极简页浏览器行为检查 | 35/35 |
| 极简页单元测试 | 27/27 |
| 全量单测 | 7030 通过 / 12 失败（与基线同一批文件） |
| 逐帧闪烁检测（6 场景） | 无单帧白屏 / 黑屏 / 亮度突变 |
| 新旧截图像素对比 | 平均差 1.0–2.1 / 255 |

## 6. 未验证

没有真机、也没有模拟器镜像。Media3 播放、锁屏与后台、背屏与 LSP、Compose 图层顺序、真实安全区、
手势手感与帧率、功耗、长列表连播、Activity 重建，均未在设备上验证。所有截图与逐帧录像来自 Chromium
harness（注入 40/24 的安全区），不是设备证据。
