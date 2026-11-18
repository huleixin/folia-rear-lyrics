# CNB 发布工具链与本地 AI 标准化发布协作说明

本文档说明听屿基于 CNB 官方 CLI + `tools/release-cli.mjs` 的标准化构建、候选准备、预发布上传、完整性回验与多节点同步流程，以及面向本地 AI 工具（Codex / WorkBuddy）的自然语言指令映射与硬安全边界。

---

## 1. 前置环境核查

开发者电脑需保持以下本地工具就绪（均不涉及云端付费资源）：

- **CNB CLI 登录态**：运行 `cnb status` 应显示 `✅ 已登录`（凭据仅存本机 `~/.cnb/token`，`release-cli.mjs` 通过 `git -c credential.helper="!cnb git-credential"` 在内存调用，永不写入仓库配置）。
- **系统安全凭据库 (DPAPI)**：运行 `python tools/release_credentials.py --status` 确认 `read`、`admin`、`release_prepare`、`release_publish`、`policy_signing_k1`、`policy_signing_k2_backup` 六个槽位均为 `true`。
- **JDK 21 与 Android SDK Build-Tools**：用于 Gradle Release 构建及 `apksigner` / `aapt2` 二进制核验。

---

## 2. `tools/release-cli.mjs` 命令参考

在 `tingyu-android/` 目录下执行：

```bash
# 1. 仅本地打包正式签名 APK（不升版本号、不上传、不改任何线上配置）
node tools/release-cli.mjs build

# 2. 解析本地 APK 七项元信息 + 最近 Git 提交，生成候选草稿并登记至后台待审池
node tools/release-cli.mjs prepare --channel stable --register

# 3. 将候选 APK 上传至 CNB (tingyu-2026/releases) 预发布附件（--prerelease，不触发用户更新）
node tools/release-cli.mjs upload --channel testing

# 4. 从远程 CNB 下载直链完整拉取整个 APK 文件，核验非 HTML 二进制流、字节大小与完整 SHA-256
node tools/release-cli.mjs verify --channel testing

# 5. 只读查看线上服务状态、反馈统计、各渠道当前策略版本与节点同步状态
node tools/release-cli.mjs status

# 6. 只读查看防篡改哈希链发布审计历史
node tools/release-cli.mjs history

# 7. 将云端已验签的最新渠道策略同步镜像至 CNB 静态分支与本地备份目录
node tools/release-cli.mjs sync-manifests
```

### 高权限管理员受控命令（AI 默认禁止自动执行）

以下命令必须由开发者本人明确授权并显式附带 `--confirm`，内部读取独立 `release_publish` 槽位完成二次鉴权：

```bash
# 正式发布已在后台完成审核确认（状态为 approved）的候选版本
node tools/release-cli.mjs publish --id rel-stable-1.5.79-294 --confirm

# 暂停指定渠道新版本更新推送
node tools/release-cli.mjs pause --channel stable --confirm --reason "暂停放量观察"

# 紧急解除指定渠道的强制更新拦截
node tools/release-cli.mjs unlock --channel stable --confirm --reason "紧急解除旧版本拦截"
```

---

## 3. AI 标准化自然语言指令对照表

在 Codex 或 WorkBuddy 中，开发者可直接发送以下自然语言指令：

| 开发者口头指令 | AI 标准执行动作 | 是否会影响正式线上用户 |
| :--- | :--- | :--- |
| **「帮我打包一个测试版」** | 升版本号（如需要）或运行 `node tools/release-cli.mjs build`，输出本地 APK 路径、体积与 SHA-256 | **否**（纯本地构建） |
| **「准备发布新版本」** | 运行 `prepare --channel stable --register`、`upload --channel stable`（仅预发布附件）及 `verify --channel stable`，生成完整候选报告供开发者去后台审核 | **否**（`stable.json` 保持原状，未审核确认不可发布） |
| **「上传候选版本但不要正式推送」** | 运行 `upload --channel testing && verify --channel testing` | **否** |
| **「检查线上发布和节点状态」** | 运行 `node tools/release-cli.mjs status` 与 `history` | **否**（纯只读） |
| **「检查最近的用户反馈并准备修复计划」** | 运行 `python tools/feedback.py pull --hours 48 && python tools/feedback.py summary`，结合源码调用链给出修复方案 | **否**（纯只读排查） |
| **「把云端最新策略同步到 CNB 静态文件」** | 运行 `node tools/release-cli.mjs sync-manifests`（自动先做本地 ECDSA 公钥验签） | 仅镜像管理员已签发的合法策略 |

---

## 4. AI 自动化六条硬安全红线

1. **绝不越权推正式版**：无论代码测试多么顺利，AI 不得在未获开发者针对该具体版本号明确发布指令的情况下执行 `publish --confirm`。
2. **绝不跳过远程完整回验**：上传 CNB 后必须执行 `verify` 完整下载二进制流核对 `size` 与 `sha256`，严禁仅凭网页返回 200 就宣布下载源可用。
3. **绝不混用反馈状态**：AI 完成源码修改并通过单测后，后台状态最多更新至 `verification`（待验证）/ `pending_test`（待测试），严禁直接改成 `fixed` / `verified_resolved`。
4. **绝不泄露任何凭据**：禁止读取或输出 `C:\Users\DELL\AppData\Local\TingyuFeedback\*.dpapi` 解密内容、`~/.cnb/token` 或 `private/signing/` 签名口令。
