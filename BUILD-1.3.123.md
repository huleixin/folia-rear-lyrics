# 构建记录 · v1.3.123（versionCode 146）

## 1. 版本

| | 上一版 | 本版 |
| --- | --- | --- |
| versionName | 1.3.122 | **1.3.123** |
| versionCode | 145 | **146** |
| 包名 | `io.github.huleixin.tingyu` | 未变 |

`node dev/build/bumpAndroidVersion.mjs patch` 生成。

## 2. 内容

播放 UI 与导航专项，五件事：自动 AI 主题不再弹全局提示、四种播放模式合成一个按钮、舞台顶栏
独立返回箭头、极简歌词 ↔ 完整舞台改为双向溶解转场、歌词制作信息按字幕权重绘制。
根因与改动清单见 `audits/player-views-unify-v1.3.123.md`。

提交：`2a8c944` / `18db5ee` / `f7731e7` / `e6755bb` / `8d20faa` / `c3dc3b0`。

## 3. 构建

环境与前两版相同（JDK 21 Temurin 21.0.13+9 于 `tools/`、Android SDK 36、Gradle 8.14.3）。

```bash
npm run build:capacitor
node <清理脚本>            # 清掉 assets 里 101 个历史哈希文件 / 2.8MiB
cp -rf dist/. android/app/src/main/assets/public/
cd android && JAVA_HOME=<jdk21> ./gradlew assembleRelease --no-daemon
```

## 4. 产物

| 文件 | 大小 | 签名 |
| --- | --- | --- |
| `Tingyu-Android-v1.3.123-release.apk` | 51,552,199 B | 官方发布密钥（v2 + v3） |

### SHA-256

```text
fcaeb1e8b575c9580c69ecb7728f5b0a1d80bc0323cb20ffd0ec5f9396347e02  Tingyu-Android-v1.3.123-release.apk
```

### 验签

```text
Signer #1 certificate SHA-256: a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d
```

`node dev/build/verifyApkSignature.mjs <apk>` 退出码 0。与 1.3.122 同一张证书，可覆盖安装、保留数据。

## 5. 测试

| 项目 | 结果 |
| --- | --- |
| 全量单测 | 7038 通过 / 12 失败（基线同一批 7 个文件） |
| 极简页浏览器检查 | 35/35 |
| 转场/队列/顶栏检查（新增） | 29/29 |
| 主题提示（新增） | 6/6 |
| 播放模式（重写） | 11/11 |
| 制作信息（新增） | 8/8 |
| 类型检查 | 通过 |
| 模拟器 / 真机 | 未执行（本机均无） |

## 6. 未验证

无设备、无模拟器镜像。Media3 循环与随机的原生同步、后台续播、锁屏恢复、背屏/LSP、灵动岛、
Compose 图层顺序、真实安全区、切歌中进出舞台、功耗，均未在设备上验证。
