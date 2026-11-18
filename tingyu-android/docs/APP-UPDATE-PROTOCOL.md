# 听屿软件内安全更新协议规范（Schema v1）与紧急解除操作指南

本文档定义听屿正式静态更新配置协议（`Schema v1`）、ECDSA-P256-SHA256 规范化签名算法、多节点优先级裁决规则、过期与离线宽限矩阵，以及暂停更新与紧急解除强制更新的标准作业流程。

---

## 1. 更新配置地址与渠道隔离

| 渠道 (`channel`) | 节点角色 | 真实访问地址 |
| :--- | :--- | :--- |
| **`stable`**（正式用户渠道） | 1. CNB 国内高速静态源 | `https://cnb.cool/tingyu-2026/releases/-/git/raw/main/stable.json` |
| **`stable`**（正式用户渠道） | 2. Cloudflare 实时签名镜像 | `https://feedback.20262000.xyz/api/public/update/stable` |
| **`stable`**（正式用户渠道） | 3. Cloudflare 备用域名镜像 | `https://tingyu-feedback-api.2473297053.workers.dev/api/public/update/stable` |
| **`stable`**（正式用户渠道） | 4. GitHub 静态兜底源 | `https://raw.githubusercontent.com/huleixin/folia-rear-lyrics/feat/library-search-v2/tingyu-android/releases/update-manifests/stable.json` |
| **`testing`**（测试与预演渠道） | CNB / Cloudflare 测试通道 | `https://cnb.cool/tingyu-2026/releases/-/git/raw/main/channels/testing.json`<br>`https://feedback.20262000.xyz/api/public/update/testing` |

> **隔离原则**：开发期的连通性验证文件 `testing.json` 绝不参与正式客户端决策；正式客户端严格固定只认 `channel === "stable"`。

---

## 2. 完整 JSON 字段定义（Schema v1）

```json
{
  "schemaVersion": 1,
  "appId": "io.github.huleixin.tingyu",
  "channel": "stable",
  "policyRevision": 1,
  "policyAction": "normal",
  "updateEnabled": true,
  "latestVersionName": "1.5.79",
  "latestVersionCode": 294,
  "minSupportedVersionCode": 294,
  "releaseId": "rel-stable-1.5.79-294",
  "gitCommit": "48511843",
  "releaseNotes": "1. 新增原生软件内安全更新机制\n2. 优化本地音乐独立子页面体验",
  "publishedAt": "2026-11-18T11:00:00.000Z",
  "publishedAtEpochMs": 1794970800000,
  "policyExpiresAt": "2026-12-18T11:00:00.000Z",
  "policyExpiresAtEpochMs": 1797562800000,
  "offlineGraceHours": 168,
  "apkSizeBytes": 58485998,
  "sha256": "e26b0812b3d6da734c2af0c2f7816ecdaa6a31127618d141a814af164c7d1469",
  "apkCertSha256": "a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d",
  "minSdk": 24,
  "supportedAbis": ["arm64-v8a", "armeabi-v7a"],
  "downloadUrls": [
    {
      "id": "cnb-primary",
      "label": "CNB 国内高速主节点",
      "url": "https://cnb.cool/tingyu-2026/releases/-/releases/download/v1.5.79/tingyu-1.5.79-release.apk",
      "priority": 1
    },
    {
      "id": "github-backup",
      "label": "GitHub 备用节点",
      "url": "https://github.com/huleixin/folia-rear-lyrics/releases/download/v1.5.79/tingyu-1.5.79-release.apk",
      "priority": 2
    }
  ],
  "signatureAlgorithm": "ECDSA-P256-SHA256",
  "keyId": "tingyu-policy-2026-k1",
  "signature": "MEUCIQ..."
}
```

---

## 3. 规范化签名与跨语言验签规则

签名实现位于 `shared/updateProtocol.mjs`（Node / Cloudflare WebCrypto）与 `UpdatePolicy.kt`（Android Java `SHA256withECDSA`），双向字节级一致：

1. **剥离与保留字段**：复制待签名对象，仅删除顶层 `signature` 字段；**保留 `signatureAlgorithm` 与 `keyId`** 参与签名，杜绝算法降级或密钥 ID 替换攻击。
2. **递归字典序规范化**：对所有对象键按 UTF-16 码元升序递归排序，数组保持原始顺序，输出无空白 UTF-8 JSON 字符串。
3. **ECDSA-P256-SHA256 编码**：
   - WebCrypto 默认产出 64 字节 IEEE P1363 (`r || s`)，由 `p1363ToDer()` 编码为标准 **ASN.1 DER** 后进行 Base64 编码写入 `signature`；
   - Android 客户端通过 `KeyFactory.getInstance("EC")` 加载内置 SPKI 公钥（`UpdateTrustAnchors.kt`），调用标准 `Signature.getInstance("SHA256withECDSA")` 直接验证 DER 签名；任何字段被篡改 1 比特即刻拒绝。

---

## 4. 多节点裁决、防重放、过期与离线宽限矩阵

客户端 `UpdateApi.kt` 与 `UpdatePolicy.kt` 执行如下确定性裁决：

1. **多节点择新与防重放**：并发请求配置源，丢弃任何 HTTP 异常、HTML 响应、JSON 损坏、签名无效、`channel` 不匹配、`policyExpiresAtEpochMs <= now` 或 `policyRevision < 本地已记录最高序列号` 的响应；在所有合法响应中选择 **`policyRevision` 最大**的一份作为唯一权威策略。
2. **版本判断统一基于整数 `versionCode`**：`versionName` 仅用于界面展示，彻底避免字符串比较歧义。
3. **过期与离线宽限规则矩阵**：

| 场景 | 客户端行为 | 设计目的 |
| :--- | :--- | :--- |
| 首次安装离线启动（无本地缓存策略） | **正常进入全部功能** | 绝不因断网误锁新用户 |
| `currentVersionCode < minSupportedVersionCode` 且距上次联网验签 `<= offlineGraceHours` (默认 168h) | **激活强制更新门 (`FORCE_UPDATE`)** | 保障默认强制更新策略严格生效 |
| 曾命中强制更新，但设备连续离线超过 `offlineGraceHours` | **自动降级为可关闭的普通提醒 (`OPTIONAL_UPDATE`)** | 防止飞机/偏远无网环境永久锁死播放器 |
| 策略自然超过 `policyExpiresAtEpochMs`（默认 30 天）且未拉取到新策略 | **策略自动失效 (`NONE`)** | 防止陈旧缓存策略无限期拦截用户 |

---

## 5. 「暂停更新推送」与「紧急解除强制更新」的区别及操作指南

### 5.1 核心语义对比

| 操作名称 | `policyAction` | `updateEnabled` | `minSupportedVersionCode` | 对客户端的实际效果 |
| :--- | :--- | :--- | :--- | :--- |
| **暂停更新推送 (`pause`)** | `"pause"` | `false` | 保持原值 | 尚未触发强更的用户不再收到新版本弹窗；适合发现非致命小瑕疵、先停止继续放量。 |
| **紧急解除强制更新 (`unlock`)** | `"emergency_unlock"` | `false` | **立即降回 `1`** | **递增 `policyRevision`**，所有已被强更弹窗拦截的旧版用户点击弹窗内「重新检查更新」或重启 App 后，**立即解除拦截恢复正常听歌**，无需重新打包发版！ |

### 5.2 手机端 30 秒紧急解除操作步骤（无需电脑在场）

1. 在手机浏览器或已安装的「听屿管理」PWA 打开 `https://feedback.20262000.xyz/admin` 并登录管理员会话。
2. 点击底部导航 **「版本」** -> 顶部子标签 **「更新策略」**。
3. 目标渠道选择 **`正式稳定渠道 (stable)`**，填写紧急原因，输入独立发布确认密钥（`RELEASE_PUBLISH_SECRET`）。
4. 点击红色按钮 **「紧急解除强制更新限制」**。
5. 云端立即签发更高 `policyRevision` 的 `emergency_unlock` 策略，所有客户端实时拉取生效；后续回到电脑旁可再运行 `node tools/release-cli.mjs sync-manifests` 将相同签名文件镜像至 CNB 静态分支。
