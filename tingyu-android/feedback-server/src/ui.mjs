// feedback-server/src/ui.mjs
// 听屿开发者管理中心（TINGYU · Developer Console）冰川主题响应式管理台（支持桌面 >=1200px / 平板 768-1199px / 手机 <768px + PWA）。
// 安全红线：所有外部文本仅通过 textContent / value 赋值渲染，绝不拼接不受信任的标记，绝不把凭据存入持久浏览器存储。

export const adminPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#385B73">
  <title>听屿开发者管理中心 · TINGYU Developer Console</title>
  <link rel="manifest" href="/admin/manifest.webmanifest">
  <link rel="icon" href="/admin/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/admin/icon.svg">
  <link rel="stylesheet" href="/admin/app.css">
</head>
<body>
  <div id="login-wrap" class="login-shell">
    <form id="login" class="card login-card">
      <div class="brand-row">
        <img src="/admin/icon.svg" alt="" width="44" height="44" class="brand-logo">
        <div>
          <h1>听屿开发者管理中心</h1>
          <p class="muted">TINGYU · Developer Console</p>
        </div>
      </div>
      <p class="muted">请输入管理员或只读访问凭据。凭据仅用于换取短期受保护 HttpOnly 会话，不在前端保存。</p>
      <input id="token" type="password" autocomplete="off" aria-label="登录凭据" placeholder="输入访问凭据" required>
      <button type="submit" class="btn-primary full">登录</button>
    </form>
  </div>

  <div id="dashboard" class="console-shell" hidden>
    <aside id="sidebar" class="sidebar" aria-label="主导航">
      <div class="sidebar-brand">
        <img src="/admin/icon.svg" alt="" width="32" height="32" class="brand-logo">
        <div>
          <strong class="brand-cn">听屿管理中心</strong>
          <span class="brand-en">TINGYU · Console</span>
        </div>
      </div>
      <div class="nav-group">
        <div class="nav-group-label">工作台</div>
        <button type="button" class="nav-item active" data-view="overview">数据总览</button>
        <button type="button" class="nav-item" data-view="feedback">用户反馈</button>
        <button type="button" class="nav-item" data-view="logs">诊断日志</button>
        <button type="button" class="nav-item" data-view="issues">问题聚合</button>
        <button type="button" class="nav-item" data-view="analytics">版本分析</button>
      </div>
      <div class="nav-group">
        <div class="nav-group-label">版本与发布</div>
        <button type="button" class="nav-item" data-view="releases">版本管理</button>
        <button type="button" class="nav-item" data-view="publish">版本发布</button>
        <button type="button" class="nav-item" data-view="policy">更新策略</button>
        <button type="button" class="nav-item" data-view="nodes">下载节点</button>
        <button type="button" class="nav-item" data-view="audit">发布记录</button>
      </div>
      <div class="nav-group">
        <div class="nav-group-label">系统管理</div>
        <button type="button" class="nav-item" data-view="ai">AI协作</button>
        <button type="button" class="nav-item" data-view="health">服务状态</button>
        <button type="button" class="nav-item" data-view="security">安全管理</button>
        <button type="button" class="nav-item" data-view="settings">系统设置</button>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div class="topbar-left">
          <img src="/admin/icon.svg" alt="" width="28" height="28" class="brand-logo mobile-only">
          <div>
            <strong id="page-title" class="topbar-title">数据总览</strong>
            <span id="role-badge" class="badge">只读</span>
          </div>
        </div>
        <div class="topbar-actions">
          <select id="theme-mode" aria-label="界面主题" class="compact-select">
            <option value="system">跟随系统</option>
            <option value="light">浅色冰川</option>
            <option value="dark">深色冰川</option>
          </select>
          <button type="button" id="refresh" class="btn-secondary">刷新</button>
          <button type="button" id="logout" class="btn-secondary">退出</button>
        </div>
      </header>

      <div id="mobile-subtabs" class="subtabs mobile-only" role="tablist"></div>
      <p id="message" class="status-banner" role="status" hidden></p>

      <main class="content">
        <!-- 1. 数据总览 + 快捷反馈面板（兼容既有自动化筛选验收并直达核心指标） -->
        <section id="view-overview" class="view-pane">
          <div id="stats" class="kpi-grid"></div>
          <div id="overview-releases" class="split-grid"></div>
          <div class="card">
            <div class="section-head">
              <h2>近期用户反馈与快速筛选</h2>
              <button type="button" id="pause" class="btn-secondary">暂停上传</button>
            </div>
            <form id="filters" class="filter-bar">
              <input name="q" placeholder="编号 / 描述关键词" aria-label="搜索">
              <select name="type" aria-label="问题类型"></select>
              <select name="status" aria-label="处理状态"></select>
              <select name="severity" aria-label="严重程度">
                <option value="">所有优先级</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
              <input name="version" placeholder="应用版本" aria-label="应用版本">
              <input name="model" placeholder="设备型号" aria-label="设备型号">
              <input name="os" placeholder="系统版本" aria-label="系统版本">
              <input name="since" type="datetime-local" aria-label="开始时间">
              <input name="until" type="datetime-local" aria-label="结束时间">
              <button type="submit" class="btn-primary">筛选</button>
            </form>
            <div id="feedback" class="stack-list"></div>
            <button type="button" id="more" class="btn-secondary full" hidden>下一页</button>
          </div>
        </section>

        <!-- 2. 诊断日志 -->
        <section id="view-logs" class="view-pane" hidden>
          <div class="card">
            <h2>诊断日志中心（私有 R2 完整性校验）</h2>
            <p class="muted">仅展示附带脱敏诊断快照的反馈记录，下载与在线预览均在服务端核对字节数与 SHA-256，不含账号 Cookie 或私钥。</p>
            <div id="logs-list" class="stack-list"></div>
          </div>
        </section>

        <!-- 3. 问题聚合 -->
        <section id="view-issues" class="view-pane" hidden>
          <div class="card">
            <h2>问题聚合与修复版本追踪</h2>
            <p class="muted">按确定性异常证据指纹聚合；无法确认同根因的普通文字反馈保持独立分组，绝不强行合并。</p>
            <div id="issues" class="stack-list"></div>
          </div>
        </section>

        <!-- 4. 版本分析 -->
        <section id="view-analytics" class="view-pane" hidden>
          <div class="card">
            <h2>版本、问题类型与设备环境分布</h2>
            <div id="distributions" class="split-grid"></div>
          </div>
        </section>

        <!-- 5. 版本管理 -->
        <section id="view-releases" class="view-pane" hidden>
          <div class="card">
            <div class="section-head">
              <h2>版本库（正式版 / 候选版 / 测试版 / 已撤回）</h2>
              <select id="release-channel-filter" aria-label="版本渠道筛选" class="compact-select">
                <option value="">全部渠道</option>
                <option value="stable">正式渠道 (stable)</option>
                <option value="testing">测试渠道 (testing)</option>
              </select>
            </div>
            <div id="releases-list" class="stack-list"></div>
          </div>
        </section>

        <!-- 6. 版本发布工作台 -->
        <section id="view-publish" class="view-pane" hidden>
          <div id="publish-summary" class="split-grid"></div>
          <div class="card">
            <h2>候选版本录入 / 审核与受控正式发布</h2>
            <p class="muted">日常开发与正式发布严格隔离：先录入或选择已上传 CNB 的候选 APK，核验下载与签名，人工审核绑定摘要后，输入独立发布确认密钥方可正式生效。</p>
            <form id="candidate-form" class="form-grid">
              <label>选择本地 APK 自动计算摘要（可选，不上传机身密钥）
                <input type="file" id="local-apk-file" accept=".apk">
              </label>
              <label>目标渠道
                <select name="channel">
                  <option value="testing">测试渠道 (testing · 联调验证)</option>
                  <option value="stable">正式稳定渠道 (stable · 全量用户)</option>
                </select>
              </label>
              <label>版本名称 (versionName)
                <input name="versionName" placeholder="例如 1.5.78" required>
              </label>
              <label>整数版本号 (versionCode)
                <input name="versionCode" type="number" min="1" placeholder="例如 293" required>
              </label>
              <label>安装包字节大小 (apkSizeBytes)
                <input name="apkSizeBytes" type="number" min="1048576" required>
              </label>
              <label>APK SHA-256 (64位十六进制)
                <input name="sha256" placeholder="64位小写十六进制摘要" required>
              </label>
              <label>源码 Git Commit
                <input name="gitCommit" placeholder="例如 48511843">
              </label>
              <label>CNB Release 标签
                <input name="cnbTag" placeholder="例如 v1.5.78">
              </label>
              <label class="span-full">CNB 国内主节点 HTTPS 下载直链
                <input name="cnbUrl" placeholder="https://cnb.cool/tingyu-2026/releases/-/releases/download/..." required>
              </label>
              <label class="span-full">GitHub 备用节点 HTTPS 下载直链（选填）
                <input name="githubUrl" placeholder="https://github.com/huleixin/folia-rear-lyrics/releases/download/...">
              </label>
              <label>更新方式
                <select name="forceUpdate">
                  <option value="true">强制更新（默认）</option>
                  <option value="false">普通更新（允许稍后提醒）</option>
                </select>
              </label>
              <label>最低允许使用版本 (minSupportedVersionCode)
                <input name="minSupportedVersionCode" type="number" min="1" placeholder="低于该版本号的客户端将触发强制更新" required>
              </label>
              <label class="span-full">更新公告 (releaseNotes)
                <textarea name="releaseNotes" rows="5" placeholder="填写面向用户展示的真实更新内容…" required></textarea>
              </label>
              <div class="span-full action-row">
                <button type="submit" class="btn-primary">保存候选版本记录</button>
              </div>
            </form>
          </div>
          <div id="approval-workbench" class="stack-list"></div>
        </section>

        <!-- 7. 更新策略控制与紧急解除 -->
        <section id="view-policy" class="view-pane" hidden>
          <div id="policy-cards" class="stack-list"></div>
          <div class="card">
            <h2>紧急策略控制（暂停推送 / 紧急解除强制更新）</h2>
            <p class="muted">暂停推送仅停止新版本提示；紧急解除强制更新会立即递增策略序列号 (policyRevision) 并将最低支持版本降回 1，使被拦截的旧版客户端重新检查后立即恢复正常使用。</p>
            <div class="form-grid">
              <label>目标渠道
                <select id="policy-ctl-channel">
                  <option value="testing">测试渠道 (testing)</option>
                  <option value="stable">正式稳定渠道 (stable)</option>
                </select>
              </label>
              <label>操作说明 / 紧急原因
                <input id="policy-ctl-reason" placeholder="记录审计原因（如：发现兼容异常，紧急解除限制）">
              </label>
              <label class="span-full">独立发布确认密钥 (RELEASE_PUBLISH_SECRET)
                <input id="policy-ctl-secret" type="password" autocomplete="off" placeholder="输入独立发布管理密钥以执行签名">
              </label>
              <div class="span-full action-row">
                <button type="button" id="btn-pause-channel" class="btn-secondary">暂停该渠道新版本推送</button>
                <button type="button" id="btn-unlock-channel" class="btn-danger">紧急解除强制更新限制</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 8. 下载节点 -->
        <section id="view-nodes" class="view-pane" hidden>
          <div class="card">
            <h2>下载节点健康度与真实二进制探测</h2>
            <p class="muted">通过 HTTP Range 二进制流与文件长度核对，拒绝把 HTML 登录页或错误页误判为可下载安装包。</p>
            <div id="nodes-list" class="stack-list"></div>
          </div>
        </section>

        <!-- 9. 发布记录（防篡改哈希链审计） -->
        <section id="view-audit" class="view-pane" hidden>
          <div class="card">
            <h2>不可篡改发布与策略审计日志</h2>
            <p class="muted">每条记录包含前序哈希链摘要，并由 D1 数据库触发器禁止修改或删除。</p>
            <div id="audit-list" class="stack-list"></div>
          </div>
        </section>

        <!-- 10. AI协作 -->
        <section id="view-ai" class="view-pane" hidden>
          <div class="card">
            <h2>本地 AI 协作指令中心（Codex / WorkBuddy）</h2>
            <p class="muted">零付费 AI 接口依赖：直接复制标准化指令交给本地 AI 工具完成排查、构建、候选准备与校验，正式发布始终由开发者本人在此确认。</p>
            <div id="ai-commands" class="stack-list"></div>
          </div>
        </section>

        <!-- 11. 服务状态 & 免费额度 -->
        <section id="view-health" class="view-pane" hidden>
          <div id="health-cards" class="split-grid"></div>
        </section>

        <!-- 12. 安全管理（手机一次性配对登录） -->
        <section id="view-security" class="view-pane" hidden>
          <div class="card">
            <h2>安全管理与手机远程一次性登录链接</h2>
            <p class="muted">生成 5 分钟有效、单次消费即销毁的手机端安全登录链接（URL 片段不经过服务器访问日志）。</p>
            <div class="action-row">
              <button type="button" id="btn-make-admin-pairing" class="btn-primary">生成手机管理端 5 分钟登录链接</button>
              <button type="button" id="btn-make-read-pairing" class="btn-secondary">生成只读端 5 分钟登录链接</button>
            </div>
            <pre id="pairing-output" class="code-box" hidden></pre>
          </div>
        </section>

        <!-- 13. 系统设置 -->
        <section id="view-settings" class="view-pane" hidden>
          <div class="card">
            <h2>云端反馈入口与配额保护控制</h2>
            <p class="muted">发生异常流量时可随时一键暂停公开反馈上传，不影响版本检测与后台查阅。</p>
            <div class="action-row">
              <button type="button" id="btn-enable-uploads" class="btn-primary">开启客户端反馈上传</button>
              <button type="button" id="btn-disable-uploads" class="btn-danger">暂停客户端反馈上传</button>
            </div>
          </div>
        </section>
      </main>
    </div>

    <nav class="mobile-bottom-nav mobile-only" aria-label="手机底部导航">
      <button type="button" class="mnav-btn active" data-mgroup="workbench">总览</button>
      <button type="button" class="mnav-btn" data-mgroup="feedback">反馈</button>
      <button type="button" class="mnav-btn" data-mgroup="releases">版本</button>
      <button type="button" class="mnav-btn" data-mgroup="system">管理</button>
    </nav>
  </div>

  <dialog id="detail">
    <div class="dialog-head">
      <strong id="detail-title">详情</strong>
      <button type="button" id="close" class="btn-secondary">关闭</button>
    </div>
    <div id="detailbody" class="dialog-body"></div>
  </dialog>

  <script src="/admin/app.js"></script>
</body>
</html>`;

export const adminStyle = `
:root {
  color-scheme: light dark;
  --bg: #E6EDF5;
  --card: #F5F8FC;
  --fg: #203747;
  --muted: #536D80;
  --accent: #385B73;
  --accent-ink: #FFFFFF;
  --sel: #CEDDE9;
  --line: #D5E0EA;
  --ok: #1E7A50;
  --warn: #9A6312;
  --danger: #B3261E;
  --danger-bg: #FDECEA;
}
html[data-theme="dark"] {
  --bg: #101A23;
  --card: #182633;
  --fg: #E8F0F7;
  --muted: #93ACC0;
  --accent: #527E9F;
  --accent-ink: #FFFFFF;
  --sel: #243B4E;
  --line: #293F52;
  --ok: #6AD29E;
  --warn: #F2BD6B;
  --danger: #FF897D;
  --danger-bg: #3B1D22;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    --bg: #101A23;
    --card: #182633;
    --fg: #E8F0F7;
    --muted: #93ACC0;
    --accent: #527E9F;
    --accent-ink: #FFFFFF;
    --sel: #243B4E;
    --line: #293F52;
    --ok: #6AD29E;
    --warn: #F2BD6B;
    --danger: #FF897D;
    --danger-bg: #3B1D22;
  }
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  max-width: 100%;
  overflow-x: hidden;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
[hidden] { display: none !important; }
h1 { font-size: 24px; margin: 0; font-weight: 700; }
h2 { font-size: 16px; margin: 0 0 10px 0; font-weight: 650; }
h3 { font-size: 15px; margin: 12px 0 6px 0; font-weight: 600; }
p { margin: 6px 0; overflow-wrap: anywhere; }
.muted { color: var(--muted); font-size: 12px; }
.brand-logo { border-radius: 10px; flex-shrink: 0; }
.brand-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }

.login-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.login-card { width: min(440px, 100%); }
.login-card input { width: 100%; margin: 12px 0; }

.console-shell {
  display: flex;
  min-height: 100vh;
  width: 100%;
}
.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--card);
  border-right: 1px solid var(--line);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 12px;
  border-bottom: 1px solid var(--line);
}
.brand-cn { display: block; font-size: 15px; font-weight: 700; }
.brand-en { display: block; font-size: 11px; color: var(--muted); }
.nav-group { display: flex; flex-direction: column; gap: 4px; }
.nav-group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  padding: 4px 10px;
}
.nav-item {
  text-align: left;
  min-height: 40px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg);
  font-size: 14px;
  cursor: pointer;
}
.nav-item:hover { background: var(--sel); }
.nav-item.active {
  background: var(--sel);
  color: var(--accent);
  font-weight: 600;
}

.workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.topbar {
  height: 64px;
  padding: 0 24px;
  background: var(--card);
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 10;
}
.topbar-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.topbar-title { font-size: 20px; font-weight: 700; margin-right: 8px; }
.topbar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.content {
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.view-pane { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 16px;
}
.kpi-card strong {
  display: block;
  font-size: 24px;
  font-weight: 700;
  margin-top: 4px;
  color: var(--fg);
}
.split-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.stack-list { display: flex; flex-direction: column; gap: 12px; }
.row-item {
  min-height: 52px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

input, select, textarea, button {
  font: inherit;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 9px 12px;
  min-height: 44px;
  max-width: 100%;
}
textarea { width: 100%; min-height: 96px; resize: vertical; }
button { cursor: pointer; font-weight: 550; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
}
.btn-secondary {
  background: var(--sel);
  color: var(--fg);
  border-color: var(--line);
}
.btn-danger {
  background: var(--danger-bg);
  color: var(--danger);
  border-color: var(--danger);
}
.compact-select { min-height: 38px; padding: 6px 10px; font-size: 13px; }
.full { width: 100%; }
.action-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 8px; }

.filter-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 550;
  min-width: 0;
}
.span-full { grid-column: 1 / -1; }

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--sel);
  color: var(--fg);
}
.badge-ok { color: var(--ok); }
.badge-warn { color: var(--warn); }
.badge-danger { color: var(--danger); background: var(--danger-bg); }

.status-banner {
  margin: 12px 24px 0;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--sel);
  border: 1px solid var(--line);
  font-size: 13px;
}
.code-box, pre {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 12px;
  max-width: 100%;
  overflow-x: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

dialog {
  width: min(820px, 94vw);
  max-height: 90vh;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--card);
  color: var(--fg);
  padding: 18px;
  overflow-y: auto;
}
dialog::backdrop { background: rgba(10, 22, 32, 0.55); }
.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 12px;
}
.dialog-body { display: flex; flex-direction: column; gap: 10px; }

.mobile-only { display: none; }

/* 平板适配 (768px - 1199px) */
@media (max-width: 1199px) and (min-width: 768px) {
  .sidebar { width: 200px; }
  .content { padding: 18px; }
}

/* 手机端自适应布局 (< 768px)：紧凑 56px 顶栏 + 16px 边距 + 12px 间距 + 14px 圆角 + 安全区底栏 */
@media (max-width: 767px) {
  .sidebar { display: none; }
  .mobile-only { display: flex; }
  .topbar {
    height: 56px;
    padding: 0 16px;
  }
  .topbar-title { font-size: 17px; }
  .subtabs {
    gap: 8px;
    overflow-x: auto;
    padding: 10px 16px 2px;
    scrollbar-width: none;
  }
  .subtab-pill {
    min-height: 36px;
    padding: 6px 14px;
    border-radius: 999px;
    white-space: nowrap;
    font-size: 13px;
    background: var(--card);
    border: 1px solid var(--line);
  }
  .subtab-pill.active {
    background: var(--sel);
    color: var(--accent);
    border-color: var(--accent);
    font-weight: 600;
  }
  .status-banner { margin: 8px 16px 0; }
  .content {
    padding: 12px 16px calc(78px + env(safe-area-inset-bottom, 0px));
    gap: 12px;
  }
  .card { border-radius: 14px; padding: 14px; }
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .split-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .filter-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .form-grid { grid-template-columns: minmax(0, 1fr); }
  .mobile-bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--card);
    border-top: 1px solid var(--line);
    padding: 6px 12px calc(6px + env(safe-area-inset-bottom, 0px));
    justify-content: space-around;
    gap: 6px;
    z-index: 20;
  }
  .mnav-btn {
    flex: 1;
    min-height: 44px;
    border: none;
    border-radius: 12px;
    background: transparent;
    font-size: 13px;
    padding: 6px 4px;
  }
  .mnav-btn.active {
    background: var(--sel);
    color: var(--accent);
    font-weight: 700;
  }
}
`;

export const adminScript = String.raw`
// Tingyu Developer Console runtime: textContent-only DOM construction, zero persistent token storage.
const $ = id => document.getElementById(id);

const TYPES = {
  playback: '播放失败', stutter: '播放卡顿', crash: '闪退', lyrics: '歌词异常',
  display: '界面异常', rear: '背屏异常', pad: 'Pad适配', local: '本地音乐', other: '其他'
};
const STATUSES = {
  pending: '待处理', investigating: '排查中', verification: '待验证',
  fixed: '已修复', unreproduced: '无法复现', closed: '已关闭'
};
const STAGES = {
  new: '新反馈', pending_confirm: '待确认', confirmed: '已确认', fixing: '修复中',
  pending_test: '待测试', tested_ok: '测试通过', published: '已发布',
  verified_resolved: '已验证解决', reopened: '问题复现'
};
const VIEW_TITLES = {
  overview: '数据总览', feedback: '用户反馈', logs: '诊断日志', issues: '问题聚合', analytics: '版本分析',
  releases: '版本管理', publish: '版本发布', policy: '更新策略', nodes: '下载节点', audit: '发布记录',
  ai: 'AI协作', health: '服务状态', security: '安全管理', settings: '系统设置'
};
const MOBILE_GROUPS = {
  workbench: ['overview', 'analytics'],
  feedback: ['feedback', 'logs', 'issues'],
  releases: ['releases', 'publish', 'policy', 'nodes', 'audit'],
  system: ['ai', 'health', 'security', 'settings']
};

let role = 'read';
let remotePublishReady = false;
let currentView = 'overview';
let cursor = null;
let query = '';
let latestOverview = null;
let latestReleases = [];
let latestIssues = [];

function el(tag, text, parent, cls) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  if (parent) parent.append(n);
  return n;
}

function fillSelect(select, map, includeAll) {
  select.replaceChildren();
  if (includeAll) el('option', '全部', select).value = '';
  for (const [k, v] of Object.entries(map)) {
    el('option', v, select).value = k;
  }
}

fillSelect(document.querySelector('[name=type]'), TYPES, true);
fillSelect(document.querySelector('[name=status]'), STATUSES, true);

function showMessage(text) {
  const box = $('message');
  if (!text) { box.hidden = true; box.textContent = ''; return; }
  box.textContent = text;
  box.hidden = false;
}

function guarded(fn) {
  return async e => {
    e?.preventDefault();
    try { await fn(e); } catch (err) { showMessage(err?.message || '操作失败'); }
  };
}

function randomNonce() {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function fmtTime(ms) {
  if (!ms) return '暂无记录';
  return new Date(ms).toLocaleString();
}

async function api(path, options = {}) {
  const r = await fetch('/api/admin/' + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!r.ok) {
    let code = '';
    try { code = (await r.json()).error || ''; } catch {}
    if (r.status === 401) throw Error('登录已过期或凭据无效，请重新登录');
    if (code === 'publish_signing_not_configured') throw Error('云端尚未配置独立发布签名密钥，远程正式发布暂不可用');
    if (code === 'publish_secret_invalid') throw Error('独立发布确认密钥验证失败');
    if (code === 'candidate_not_approved') throw Error('候选版本尚未完成审核确认，禁止直接发布');
    if (code === 'approval_digest_mismatch_reapproval_required') throw Error('候选内容在审核后发生变更，请重新审核确认');
    if (code === 'download_nodes_unreachable_abort_publish') throw Error('远程安装包下载校验未通过，已自动中止正式发布以保护线上用户');
    throw Error('请求失败 (' + r.status + (code ? ': ' + code : '') + ')');
  }
  return r.json();
}

function switchView(view) {
  // 'feedback' shares the filterable #feedback card inside view-overview so filters & items stay unified
  currentView = view;
  $('page-title').textContent = VIEW_TITLES[view] || '工作台';
  for (const btn of document.querySelectorAll('.nav-item')) {
    btn.classList.toggle('active', btn.dataset.view === view);
  }
  const activePaneId = view === 'feedback' ? 'view-overview' : 'view-' + view;
  for (const pane of document.querySelectorAll('.view-pane')) {
    pane.hidden = pane.id !== activePaneId;
  }
  $('stats').hidden = view === 'feedback';
  $('overview-releases').hidden = view === 'feedback';

  // Sync mobile bottom nav & subtabs
  let matchedGroup = 'workbench';
  for (const [g, list] of Object.entries(MOBILE_GROUPS)) {
    if (list.includes(view)) { matchedGroup = g; break; }
  }
  for (const mbtn of document.querySelectorAll('.mnav-btn')) {
    mbtn.classList.toggle('active', mbtn.dataset.mgroup === matchedGroup);
  }
  const sub = $('mobile-subtabs');
  sub.replaceChildren();
  for (const subView of MOBILE_GROUPS[matchedGroup]) {
    const pill = el('button', VIEW_TITLES[subView], sub, 'subtab-pill' + (subView === view ? ' active' : ''));
    pill.type = 'button';
    pill.onclick = () => switchView(subView);
  }
}

for (const btn of document.querySelectorAll('.nav-item')) {
  btn.onclick = () => switchView(btn.dataset.view);
}
for (const mbtn of document.querySelectorAll('.mnav-btn')) {
  mbtn.onclick = () => {
    const list = MOBILE_GROUPS[mbtn.dataset.mgroup] || ['overview'];
    switchView(list[0]);
  };
}

$('theme-mode').onchange = e => {
  const v = e.target.value;
  if (v === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
  try { sessionStorage.setItem('ty_console_theme', v); } catch {}
};
try {
  const savedTheme = sessionStorage.getItem('ty_console_theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    $('theme-mode').value = savedTheme;
    document.documentElement.dataset.theme = savedTheme;
  }
} catch {}

// Local APK file browser-side SHA-256 & size auto-reader (zero private key upload)
$('local-apk-file').onchange = guarded(async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  showMessage('正在浏览器本地计算 APK SHA-256 摘要，请稍候…');
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const sha = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  const form = $('candidate-form');
  form.elements.apkSizeBytes.value = String(file.size);
  form.elements.sha256.value = sha;
  const verMatch = /tingyu-([0-9]+\.[0-9]+\.[0-9]+)-release\.apk/i.exec(file.name);
  if (verMatch && !form.elements.versionName.value) {
    form.elements.versionName.value = verMatch[1];
    form.elements.cnbTag.value = 'v' + verMatch[1];
  }
  showMessage('已读取本地 APK：大小 ' + fmtBytes(file.size) + '，SHA-256 为 ' + sha.slice(0, 16) + '…');
});

function renderOverview(ov) {
  latestOverview = ov;
  const statsBox = $('stats');
  statsBox.replaceChildren();
  const fb = ov.feedbackStats || {};
  const stable = ov.stableRelease;
  const cand = ov.candidateRelease || ov.testingCandidate;
  const cnbNode = (ov.nodes || []).find(n => n.node_type === 'cnb');
  const ghNode = (ov.nodes || []).find(n => n.node_type === 'github');

  const kpis = [
    ['待处理反馈', fb.pendingFeedback ?? 0],
    ['待修复问题', fb.pendingIssues ?? 0],
    ['已解决问题', fb.resolvedIssues ?? 0],
    ['累计接收反馈', fb.lifetime ?? 0],
    ['当前正式版本', stable ? ('v' + stable.version_name + ' (' + stable.version_code + ')') : '暂无记录'],
    ['当前候选版本', cand ? ('v' + cand.version_name + ' · ' + cand.status) : '暂无候选'],
    ['CNB 国内节点', cnbNode ? (cnbNode.accessible ? '正常 (' + cnbNode.latency_ms + 'ms)' : '异常') : '待检测'],
    ['GitHub 备用节点', ghNode ? (ghNode.accessible ? '正常 (' + ghNode.latency_ms + 'ms)' : '异常') : '待检测'],
  ];
  for (const [label, val] of kpis) {
    const c = el('div', undefined, statsBox, 'card kpi-card');
    el('span', label, c, 'muted');
    el('strong', val, c);
  }

  const split = $('overview-releases');
  split.replaceChildren();

  // Active policies summary card
  const polCard = el('div', undefined, split, 'card');
  el('h2', '当前更新策略与发布概览', polCard);
  if (!ov.policies || !ov.policies.length) {
    el('p', '暂无已签发的线上更新策略（默认未启用更新推送）。', polCard, 'muted');
  } else {
    for (const p of ov.policies) {
      const item = el('div', undefined, polCard, 'row-item');
      const top = el('div', undefined, item, 'row-top');
      el('strong', '渠道：' + p.channel + ' · 序列号 #' + p.policyRevision, top);
      el('span', p.updateEnabled ? (p.latestVersionCode <= p.minSupportedVersionCode ? '强制更新生效中' : '普通更新生效中') : ('未启用 (' + p.policyAction + ')'), top, 'badge');
      el('p', '最新版本 v' + p.latestVersionName + ' (' + p.latestVersionCode + ') · 最低允许版本 ' + p.minSupportedVersionCode + ' · 更新于 ' + fmtTime(p.updatedAt), item, 'muted');
    }
  }

  // 7-day trend & recent release audit
  const trendCard = el('div', undefined, split, 'card');
  el('h2', '近 7 日反馈趋势与最近发布动作', trendCard);
  if (fb.trend?.length) {
    const line = fb.trend.map(t => new Date(t.day_bucket).toISOString().slice(5, 10) + ': ' + t.count + '条').join('  |  ');
    el('p', line, trendCard, 'muted');
  } else {
    el('p', '近 7 日暂无新增反馈记录。', trendCard, 'muted');
  }
  if (ov.recentAudits?.length) {
    for (const a of ov.recentAudits.slice(0, 4)) {
      el('p', fmtTime(a.at) + ' · [' + a.channel + '] ' + a.action + ' ' + (a.version_name ? 'v' + a.version_name : '') + ' · ' + a.result, trendCard, 'muted');
    }
  } else {
    el('p', '暂无发布操作记录。', trendCard, 'muted');
  }

  // Publish summary banner
  const pubSum = $('publish-summary');
  pubSum.replaceChildren();
  const sCard = el('div', undefined, pubSum, 'card');
  el('h2', '线上正式版本基线', sCard);
  el('p', stable ? ('当前正式版：v' + stable.version_name + ' (versionCode ' + stable.version_code + ') · 发布于 ' + fmtTime(stable.published_at)) : '当前尚未发布正式线上更新版本（客户端保持静默无更新）。', sCard);
  const permCard = el('div', undefined, pubSum, 'card');
  el('h2', '远程发布安全签名状态', permCard);
  el('p', ov.serviceHealth?.remotePublishReady ? '云端独立策略签名服务已就绪：审核通过后可通过电脑或手机远程确认正式发布、暂停推送或紧急解除强制更新。' : '当前未配置云端独立签名密钥：仅开放远程查看与审核，正式发布暂不可用。', permCard, ov.serviceHealth?.remotePublishReady ? '' : 'muted');

  // Health & Quota view
  const hBox = $('health-cards');
  hBox.replaceChildren();
  const h1 = el('div', undefined, hBox, 'card');
  el('h2', 'Cloudflare Worker / D1 / 私有 R2 状态', h1);
  el('p', '反馈接收总开关：' + (ov.serviceHealth?.uploadsEnabled ? '正常运行中' : '已暂停'), h1);
  el('p', '私有 R2 诊断日志占用：' + fmtBytes(ov.serviceHealth?.r2UsedBytes || 0) + ' / 配额上限 ' + fmtBytes(ov.serviceHealth?.r2LimitBytes || 268435456), h1);
  el('p', '零新增固定成本约束：复用既有免费额度，未开通任何付费对象存储、付费 CDN 或付费 AI 接口。', h1, 'muted');
  const h2 = el('div', undefined, hBox, 'card');
  el('h2', 'CNB 与 GitHub 资源入口', h2);
  el('p', 'CNB 正式发布仓：https://cnb.cool/tingyu-2026/releases', h2);
  el('p', 'GitHub 源码与备用仓：https://github.com/huleixin/folia-rear-lyrics', h2);
  el('p', '说明：平台不提供免鉴权实时账单 API 时不伪造用量，完整配额请直接核验官方控制台。', h2, 'muted');

  // Policy cards
  const polList = $('policy-cards');
  polList.replaceChildren();
  for (const ch of ['stable', 'testing']) {
    const found = (ov.policies || []).find(x => x.channel === ch);
    const card = el('div', undefined, polList, 'card');
    el('h2', (ch === 'stable' ? '正式渠道 (stable)' : '内部联调渠道 (testing)') + ' 当前生效策略', card);
    if (!found) {
      el('p', '当前渠道暂无已签发策略记录。', card, 'muted');
    } else {
      el('p', '策略序列号 (policyRevision)：#' + found.policyRevision + '  |  动作：' + found.policyAction + '  |  推送开启：' + (found.updateEnabled ? '是' : '否'), card);
      el('p', '最新版本：v' + found.latestVersionName + ' (' + found.latestVersionCode + ')  |  最低允许使用版本 (minSupportedVersionCode)：' + found.minSupportedVersionCode, card);
      el('p', '受强制更新影响范围：' + (found.updateEnabled && found.minSupportedVersionCode > 1 ? ('versionCode < ' + found.minSupportedVersionCode + ' 的旧版客户端') : '无（当前不拦截任何旧版本）'), card, 'muted');
      el('pre', JSON.stringify(found.nodeSync || {}, null, 2), card);
    }
  }

  // Nodes list
  const nBox = $('nodes-list');
  nBox.replaceChildren();
  if (!ov.nodes?.length) {
    el('p', '暂无节点检测记录。可在版本管理中对候选或正式版本执行节点检测。', nBox, 'muted');
  } else {
    for (const n of ov.nodes) {
      const row = el('div', undefined, nBox, 'row-item');
      const top = el('div', undefined, row, 'row-top');
      el('strong', n.label + ' (' + n.release_id + ')', top);
      el('span', n.accessible ? ('可下载 · HTTP ' + n.http_status + ' · ' + n.latency_ms + 'ms') : ('不可用 · ' + n.detail), top, 'badge ' + (n.accessible ? 'badge-ok' : 'badge-danger'));
      el('p', n.url, row, 'muted');
      el('p', '核验大小：' + fmtBytes(n.verified_size_bytes) + ' · SHA-256 完整下载核验：' + (n.integrity_ok ? '已通过' : '仅流探活/待完整核验') + ' · 检测时间：' + fmtTime(n.last_checked_at), row, 'muted');
    }
  }
}

function renderReleases(items) {
  latestReleases = items || [];
  const filterCh = $('release-channel-filter').value;
  const list = $('releases-list');
  list.replaceChildren();
  const filtered = filterCh ? latestReleases.filter(r => r.channel === filterCh) : latestReleases;
  if (!filtered.length) {
    el('p', '暂无版本记录。', list, 'muted');
  }
  for (const r of filtered) {
    const card = el('div', undefined, list, 'row-item');
    const top = el('div', undefined, card, 'row-top');
    el('strong', '[' + r.channel + '] v' + r.version_name + ' (versionCode ' + r.version_code + ')', top);
    el('span', '状态：' + r.status + (r.force_update ? ' · 强制更新' : ' · 普通更新'), top, 'badge');
    el('p', '大小：' + fmtBytes(r.apk_size_bytes) + ' · 最低允许版本：' + r.min_supported_version_code + ' · Commit：' + (r.git_commit || '未记录') + ' · SHA-256：' + r.sha256.slice(0, 16) + '…', card, 'muted');
    el('p', r.release_notes || '无更新公告', card);
    if (role === 'admin') {
      const acts = el('div', undefined, card, 'action-row');
      const probeBtn = el('button', '实时探测下载节点', acts, 'btn-secondary');
      probeBtn.type = 'button';
      probeBtn.onclick = guarded(async () => {
        const res = await api('nodes/probe', { method: 'POST', body: JSON.stringify({ releaseId: r.id }) });
        showMessage('节点探测完成：' + res.items.map(i => i.label + '=' + (i.accessible ? '正常' : i.detail)).join('，'));
        await loadAll();
      });
      if (r.status !== 'published' && r.status !== 'withdrawn') {
        const testOkBtn = el('button', '标记真机测试通过', acts, 'btn-secondary');
        testOkBtn.type = 'button';
        testOkBtn.onclick = guarded(async () => {
          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'mark_tested' }) });
          showMessage('已标记 v' + r.version_name + ' 测试通过');
          await loadAll();
        });
        const approveBtn = el('button', '审核确认候选版本', acts, 'btn-primary');
        approveBtn.type = 'button';
        approveBtn.onclick = guarded(async () => {
          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'approve' }) });
          showMessage('已完成审核并绑定 APK SHA-256 摘要，现在可在「版本发布」面板确认正式发布。');
          await loadAll();
        });
        const withdrawBtn = el('button', '撤回候选', acts, 'btn-danger');
        withdrawBtn.type = 'button';
        withdrawBtn.onclick = guarded(async () => {
          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'withdraw' }) });
          showMessage('已撤回候选版本 ' + r.id);
          await loadAll();
        });
      }
    }
  }

  // Render approval & formal publish workbench
  const wb = $('approval-workbench');
  wb.replaceChildren();
  const candidates = latestReleases.filter(r => r.status !== 'published' && r.status !== 'withdrawn');
  for (const c of candidates) {
    const card = el('div', undefined, wb, 'card');
    el('h2', '待发布候选：[' + c.channel + '] v' + c.version_name + ' (' + c.version_code + ') · 当前状态：' + c.status, card);
    const affectedText = c.force_update
      ? ('强制更新影响范围：所有 versionCode < ' + c.min_supported_version_code + ' 的旧版客户端将被要求更新')
      : ('普通更新：允许用户稍后提醒（仅 versionCode < ' + c.min_supported_version_code + ' 受最低版本限制）');
    el('p', affectedText, card, 'badge badge-warn');
    el('p', '绑定 SHA-256：' + c.sha256, card, 'muted');
    el('p', '审批摘要 (approved_digest)：' + (c.approved_digest || '尚未审核确认（请先点击下方「1. 审核确认候选」绑定当前参数与安装包）'), card, 'muted');
    el('pre', c.release_notes, card);

    if (role === 'admin') {
      const row = el('div', undefined, card, 'form-grid');
      const secLabel = el('label', '独立发布确认密钥 (RELEASE_PUBLISH_SECRET)', row, 'span-full');
      const secInput = el('input', undefined, secLabel);
      secInput.type = 'password';
      secInput.autocomplete = 'off';
      secInput.placeholder = '审核通过后，输入独立发布确认密钥以签发正式配置';

      const acts = el('div', undefined, card, 'action-row');
      const btnApprove = el('button', '1. 审核确认候选', acts, 'btn-secondary');
      btnApprove.type = 'button';
      btnApprove.onclick = guarded(async () => {
        await api('releases/' + c.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'approve' }) });
        showMessage('候选版本已审核锁定摘要！');
        await loadAll();
      });

      const btnPublish = el('button', '2. 确认正式发布（签名并推送策略）', acts, 'btn-primary');
      btnPublish.type = 'button';
      btnPublish.disabled = c.status !== 'approved' || !remotePublishReady;
      btnPublish.onclick = guarded(async () => {
        const secret = secInput.value.trim();
        if (!secret) throw Error('请输入独立发布确认密钥');
        secInput.value = '';
        await api('releases/' + c.id + '/publish', {
          method: 'POST',
          headers: { 'X-Publish-Secret': secret },
          body: JSON.stringify({
            confirmNonce: randomNonce(),
            expectedDigest: c.approved_digest,
            expectedSha256: c.sha256
          })
        });
        showMessage('正式发布成功：[' + c.channel + '] v' + c.version_name + ' 签名更新策略已生效！');
        await loadAll();
      });
    }
  }
}

function renderAuditLogs(items) {
  const box = $('audit-list');
  box.replaceChildren();
  if (!items?.length) {
    el('p', '暂无发布与策略操作记录。', box, 'muted');
    return;
  }
  for (const a of items) {
    const row = el('div', undefined, box, 'row-item');
    const top = el('div', undefined, row, 'row-top');
    el('strong', '#' + a.seq + ' · [' + a.channel + '] ' + a.action + (a.version_name ? (' · v' + a.version_name + ' (' + a.version_code + ')') : ''), top);
    el('span', a.result + ' · 角色 ' + a.actor_role + (a.policy_revision ? (' · 策略 #' + a.policy_revision) : ''), top, 'badge');
    el('p', '时间：' + fmtTime(a.at) + ' · 链哈希：' + a.entry_hash.slice(0, 20) + '… (前序 ' + a.prev_hash.slice(0, 12) + '…)', row, 'muted');
  }
}

function renderAiCollaboration() {
  const box = $('ai-commands');
  box.replaceChildren();
  const cmds = [
    ['打包一个测试版（仅本地构建，不上传不推送）', 'node tools/release-cli.mjs build'],
    ['准备发布新版本（自动汇总 Git 提交与关联反馈生成候选公告）', 'node tools/release-cli.mjs prepare --channel stable'],
    ['上传候选版本至 CNB 并完整下载回验 SHA-256（不触发正式更新）', 'node tools/release-cli.mjs upload --channel testing && node tools/release-cli.mjs verify --channel testing'],
    ['只读检查线上发布与节点状态', 'node tools/release-cli.mjs status'],
    ['将云端已签发策略镜像同步至 CNB 与 GitHub 静态仓库文件', 'node tools/release-cli.mjs sync-manifests'],
    ['拉取近期云端用户反馈与脱敏诊断摘要', 'python tools/feedback.py pull --hours 72 && python tools/feedback.py summary'],
  ];
  for (const [title, cmd] of cmds) {
    const item = el('div', undefined, box, 'row-item');
    const top = el('div', undefined, item, 'row-top');
    el('strong', title, top);
    const copyBtn = el('button', '复制命令', top, 'btn-secondary');
    copyBtn.type = 'button';
    copyBtn.onclick = guarded(async () => {
      await navigator.clipboard.writeText(cmd);
      showMessage('已复制命令：' + cmd);
    });
    el('pre', cmd, item);
  }
}

async function showFeedbackDetail(id) {
  const r = await api('feedback/' + id);
  const body = $('detailbody');
  body.replaceChildren();
  $('detail-title').textContent = '反馈详情 · ' + r.id;
  el('p', (TYPES[r.category] || r.category) + ' · ' + (STATUSES[r.status] || r.status) + ' · 版本 ' + r.version + ' (' + r.version_code + ') · 设备 ' + r.model + ' / Android ' + r.os, body, 'muted');
  el('p', r.description, body);
  if (r.steps) {
    el('h3', '复现步骤', body);
    el('p', r.steps, body);
  }
  el('h3', '环境元数据', body);
  el('pre', JSON.stringify(JSON.parse(r.metadata || '{}'), null, 2), body);
  el('p', '提交源码：' + (r.git_commit || '-') + ' · 修复源码：' + (r.fix_commit || '-'), body, 'muted');
  if (r.fix_note) el('p', '修复备注：' + r.fix_note, body);

  if (r.history?.length) {
    el('h3', '状态流转记录', body);
    for (const h of r.history) {
      el('p', fmtTime(h.at) + ' · ' + (STATUSES[h.status] || h.status) + ' · ' + h.git_commit + ' · ' + h.note, body, 'muted');
    }
  }

  if (r.log_bytes) {
    const logActions = el('div', undefined, body, 'action-row');
    const view = el('button', '查看诊断日志 (' + fmtBytes(r.log_bytes) + ')', logActions, 'btn-secondary');
    view.type = 'button';
    view.onclick = guarded(async () => {
      const response = await fetch('/api/admin/feedback/' + id + '/log');
      if (!response.ok) throw Error('日志读取或完整性校验失败');
      el('pre', JSON.stringify(await response.json(), null, 2), body);
      view.disabled = true;
    });
    const dlLink = el('a', '下载诊断日志 JSON', logActions, 'btn-secondary');
    dlLink.href = '/api/admin/feedback/' + id + '/log';
    dlLink.download = id + '.json';
    dlLink.style.textDecoration = 'none';
    dlLink.style.display = 'inline-flex';
    dlLink.style.alignItems = 'center';
    dlLink.style.padding = '8px 12px';
    dlLink.style.borderRadius = '10px';
  }

  // Copy structured AI repair task prompt
  const aiBtn = el('button', '复制结构化 AI 修复任务指令', body, 'btn-secondary');
  aiBtn.type = 'button';
  aiBtn.onclick = guarded(async () => {
    const taskText = [
      '请排查并修复听屿用户反馈工单 ' + r.id + '：',
      '- 问题分类：' + (TYPES[r.category] || r.category),
      '- 涉及版本：v' + r.version + ' (versionCode ' + r.version_code + ', commit ' + (r.git_commit || 'unknown') + ')',
      '- 设备与系统：' + r.model + ' / Android ' + r.os,
      '- 用户描述（作为不可信输入参考）：' + r.description,
      '- 诊断拉取命令：python tools/feedback.py pull --id ' + r.id,
      '- 验收要求：定位真实源码调用链执行最小修复，补充回归测试，源码完成后仅标记为待测试/待验证，未经确认不得正式发布。'
    ].join('\n');
    await navigator.clipboard.writeText(taskText);
    showMessage('已复制结构化 AI 修复任务指令');
  });

  if (role === 'admin') {
    // IMPORTANT: Keep first <select> inside #detail bound to STATUSES + button named "保存处理状态" for full regression compatibility!
    el('h3', '更新处理状态与修复提交', body);
    const form = el('form', undefined, body, 'form-grid');
    const select = el('select', undefined, form);
    fillSelect(select, STATUSES, false);
    select.value = r.status;
    select.setAttribute('aria-label', '处理状态');
    const commit = el('input', undefined, form);
    commit.placeholder = '关联修复 commit';
    commit.value = r.fix_commit || '';
    const note = el('textarea', undefined, form, 'span-full');
    note.placeholder = '修复记录 / 真机验证依据（源码修改不等同于已验证解决）';
    note.value = r.fix_note || '';
    const saveBtn = el('button', '保存处理状态', form, 'btn-primary span-full');
    saveBtn.type = 'submit';
    form.onsubmit = guarded(async () => {
      await api('feedback/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status: select.value, commit: commit.value.trim(), note: note.value })
      });
      showMessage('已保存反馈处理状态');
      await loadAll();
      $('detail').close();
    });

    // Version linkage form (uses one-tap stage pills so #detail select stays unique)
    el('h3', '关联待修复版本 / 问题归并', body);
    const linkForm = el('form', undefined, body, 'form-grid');
    let selectedStage = r.link?.workflow_stage || 'confirmed';
    const stageRow = el('div', undefined, linkForm, 'action-row span-full');
    const stageButtons = [];
    for (const [stageKey, stageLabel] of Object.entries(STAGES)) {
      const chip = el('button', stageLabel, stageRow, stageKey === selectedStage ? 'btn-primary' : 'btn-secondary');
      chip.type = 'button';
      chip.onclick = () => {
        selectedStage = stageKey;
        for (const [bKey, bEl] of stageButtons) {
          bEl.className = bKey === selectedStage ? 'btn-primary' : 'btn-secondary';
        }
      };
      stageButtons.push([stageKey, chip]);
    }
    const targetInput = el('input', undefined, linkForm);
    targetInput.placeholder = '计划修复版本（如 1.5.79）';
    targetInput.value = r.link?.target_version || '';
    const fixedInput = el('input', undefined, linkForm);
    fixedInput.placeholder = '实际已修复版本';
    fixedInput.value = r.link?.fixed_version || '';
    const mergeInput = el('input', undefined, linkForm);
    mergeInput.placeholder = '合并至目标 Issue ID（可选）';
    mergeInput.value = r.link?.merged_issue_id || '';
    const linkBtn = el('button', '保存版本关联', linkForm, 'btn-secondary span-full');
    linkBtn.type = 'submit';
    linkForm.onsubmit = guarded(async () => {
      await api('feedback/' + id + '/link', {
        method: 'PATCH',
        body: JSON.stringify({
          workflowStage: selectedStage,
          targetVersion: targetInput.value.trim(),
          fixedVersion: fixedInput.value.trim(),
          mergedIssueId: mergeInput.value.trim()
        })
      });
      showMessage('已更新反馈与版本关联关系');
      await loadAll();
    });
  }
  $('detail').showModal();
}

async function loadAll(append = false) {
  const [s, f, i, ov, rels, audits] = await Promise.all([
    api('stats'),
    api('feedback?' + query + (append && cursor ? '&cursor=' + encodeURIComponent(cursor) : '')),
    api('issues?' + query),
    api('overview'),
    api('releases'),
    api('audit?limit=40'),
  ]);

  renderOverview(ov);
  renderReleases(rels.items || []);
  renderAuditLogs(audits.items || []);
  renderAiCollaboration();

  // Distributions
  const distBox = $('distributions');
  distBox.replaceChildren();
  for (const [key, rows] of Object.entries(s.distributions || {})) {
    const box = el('div', undefined, distBox, 'card');
    el('h2', '维度：' + key, box);
    if (!rows.length) el('p', '暂无记录', box, 'muted');
    for (const r of rows) el('p', r.label + ' · ' + r.count + ' 条', box);
  }

  // Feedback list & Logs list
  if (!append) {
    $('feedback').replaceChildren();
    $('logs-list').replaceChildren();
  }
  if (!append && !f.items.length) {
    el('p', '暂无匹配的反馈记录。', $('feedback'), 'muted');
  }
  for (const r of f.items) {
    const card = el('article', undefined, $('feedback'), 'row-item');
    const top = el('div', undefined, card, 'row-top');
    el('strong', (TYPES[r.category] || r.category) + ' · ' + (STATUSES[r.status] || r.status) + (r.workflow_stage ? (' · ' + (STAGES[r.workflow_stage] || r.workflow_stage)) : ''), top);
    if (r.target_version || r.fixed_version) {
      el('span', (r.fixed_version ? ('已修复于 v' + r.fixed_version) : ('待修复 v' + r.target_version)), top, 'badge');
    }
    el('p', r.description, card);
    el('p', 'v' + r.version + ' / ' + r.model + ' / Android ' + r.os + ' · ' + fmtTime(r.created_at) + (r.log_bytes ? (' · 诊断日志 ' + fmtBytes(r.log_bytes)) : ''), card, 'muted');
    const b = el('button', r.id, card, 'btn-secondary');
    b.type = 'button';
    b.onclick = guarded(() => showFeedbackDetail(r.id));

    if (r.log_bytes > 0) {
      const lcard = el('article', undefined, $('logs-list'), 'row-item');
      const ltop = el('div', undefined, lcard, 'row-top');
      el('strong', r.id + ' · ' + (TYPES[r.category] || r.category) + ' (' + fmtBytes(r.log_bytes) + ')', ltop);
      const lb = el('button', '打开日志详情', ltop, 'btn-secondary');
      lb.type = 'button';
      lb.onclick = guarded(() => showFeedbackDetail(r.id));
      el('p', '版本 v' + r.version + ' · 设备 ' + r.model + ' · ' + r.description, lcard, 'muted');
    }
  }
  if (!$('logs-list').children.length) {
    el('p', '当前筛选范围内暂无附带诊断日志的记录。', $('logs-list'), 'muted');
  }
  cursor = f.nextCursor;
  $('more').hidden = !cursor;

  // Aggregated Issues
  latestIssues = i.items || [];
  const issBox = $('issues');
  issBox.replaceChildren();
  if (!latestIssues.length) {
    el('p', '暂无聚合问题记录。', issBox, 'muted');
  }
  for (const r of latestIssues) {
    const card = el('article', undefined, issBox, 'row-item');
    const top = el('div', undefined, card, 'row-top');
    let feature = '';
    try { feature = JSON.parse(r.example_metadata || '{}').feature || ''; } catch {}
    el('strong', (r.note_title || ((TYPES[r.category] || r.category) + (feature ? ' · ' + feature : ''))) + ' · ' + r.feedback_count + ' 条反馈', top);
    el('span', (r.workflow_stage ? (STAGES[r.workflow_stage] || r.workflow_stage) : ('待处理 ' + r.pending + ' 条')) + (r.target_version ? (' · 目标 v' + r.target_version) : ''), top, 'badge');
    el('p', '涉及版本：' + r.versions + ' · 环境组合数：' + r.environment_count + ' · 最近出现：' + fmtTime(r.last_seen), card, 'muted');
    if (r.sample_description) el('p', '代表性描述：' + r.sample_description, card);
    const acts = el('div', undefined, card, 'action-row');
    const copyCmd = el('button', '复制 AI 排查修复任务', acts, 'btn-secondary');
    copyCmd.type = 'button';
    copyCmd.onclick = guarded(async () => {
      await navigator.clipboard.writeText(
        '检查听屿聚合问题 ' + r.issue_id + '（涉及版本 ' + r.versions + '，共 ' + r.feedback_count + ' 条真实反馈）。先运行 python tools/feedback.py pull --issue ' + r.issue_id + '，仅依据真实栈与调用链执行最小修复并补充回归测试，源码完成后标记为待测试，禁止自动发布正式版。'
      );
      showMessage('已复制聚合问题 AI 排查指令');
    });
  }
}

$('candidate-form').onsubmit = guarded(async e => {
  if (role !== 'admin') throw Error('需要管理员权限');
  const fd = new FormData(e.target);
  const cnbUrl = String(fd.get('cnbUrl') || '').trim();
  const githubUrl = String(fd.get('githubUrl') || '').trim();
  const downloadUrls = [{ id: 'cnb', label: 'CNB 国内高速节点', url: cnbUrl, priority: 1 }];
  if (githubUrl) downloadUrls.push({ id: 'github', label: 'GitHub 备用节点', url: githubUrl, priority: 2 });

  const payload = {
    channel: String(fd.get('channel') || 'testing'),
    versionName: String(fd.get('versionName') || '').trim(),
    versionCode: Number(fd.get('versionCode')),
    apkSizeBytes: Number(fd.get('apkSizeBytes')),
    sha256: String(fd.get('sha256') || '').trim().toLowerCase(),
    gitCommit: String(fd.get('gitCommit') || '').trim(),
    cnbTag: String(fd.get('cnbTag') || '').trim(),
    forceUpdate: fd.get('forceUpdate') === 'true',
    minSupportedVersionCode: Number(fd.get('minSupportedVersionCode')),
    releaseNotes: String(fd.get('releaseNotes') || ''),
    downloadUrls,
  };
  await api('releases/candidates', { method: 'POST', body: JSON.stringify(payload) });
  showMessage('候选版本已保存，请前往下方工作台执行节点探测与人工审核确认。');
  await loadAll();
});

$('release-channel-filter').onchange = () => renderReleases(latestReleases);

$('btn-pause-channel').onclick = guarded(async () => {
  const ch = $('policy-ctl-channel').value;
  const secret = $('policy-ctl-secret').value.trim();
  if (!secret) throw Error('请输入独立发布确认密钥');
  $('policy-ctl-secret').value = '';
  await api('policy/' + ch + '/pause', {
    method: 'POST',
    headers: { 'X-Publish-Secret': secret },
    body: JSON.stringify({ confirmNonce: randomNonce(), reason: $('policy-ctl-reason').value.trim() })
  });
  showMessage('已暂停渠道 [' + ch + '] 的新版本更新推送。');
  await loadAll();
});

$('btn-unlock-channel').onclick = guarded(async () => {
  const ch = $('policy-ctl-channel').value;
  const secret = $('policy-ctl-secret').value.trim();
  if (!secret) throw Error('请输入独立发布确认密钥');
  $('policy-ctl-secret').value = '';
  await api('policy/' + ch + '/unlock', {
    method: 'POST',
    headers: { 'X-Publish-Secret': secret },
    body: JSON.stringify({ confirmNonce: randomNonce(), safeMinVersionCode: 1, reason: $('policy-ctl-reason').value.trim() || '管理员紧急解除强制更新限制' })
  });
  showMessage('已签发紧急解除策略：渠道 [' + ch + '] 所有旧版本客户端重新检查后将立即解除强制更新拦截！');
  await loadAll();
});

async function makePairing(targetRole) {
  const res = await api('pairings', { method: 'POST', body: JSON.stringify({ role: targetRole }) });
  const out = $('pairing-output');
  out.textContent = '单次 5 分钟安全登录链接（打开即销毁，请勿公开分享）：\n' + res.url;
  out.hidden = false;
  try { await navigator.clipboard.writeText(res.url); showMessage('已生成并复制手机端 5 分钟一次性登录链接'); }
  catch { showMessage('已生成一次性登录链接'); }
}
$('btn-make-admin-pairing').onclick = guarded(() => makePairing('admin'));
$('btn-make-read-pairing').onclick = guarded(() => makePairing('read'));

$('btn-enable-uploads').onclick = guarded(async () => {
  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: true }) });
  showMessage('已开启客户端云端反馈上传。');
  await loadAll();
});
$('btn-disable-uploads').onclick = guarded(async () => {
  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: false }) });
  showMessage('已暂停客户端云端反馈上传；既有数据仍可正常浏览。');
  await loadAll();
});

async function enterConsole() {
  const s = await api('session');
  role = s.role;
  remotePublishReady = Boolean(s.remotePublishReady);
  $('login-wrap').hidden = true;
  $('dashboard').hidden = false;
  $('role-badge').textContent = role === 'admin' ? '管理员 (Admin)' : '只读 (Read)';
  $('pause').hidden = role !== 'admin';
  switchView('overview');
  await loadAll();
}

$('login').onsubmit = guarded(async () => {
  const token = $('token').value;
  $('token').value = '';
  await api('login', { method: 'POST', body: JSON.stringify({ token }) });
  await enterConsole();
  showMessage('欢迎进入听屿开发者管理中心');
});

$('logout').onclick = guarded(async () => {
  await api('logout', { method: 'POST' });
  location.reload();
});
$('close').onclick = () => $('detail').close();
$('refresh').onclick = guarded(() => loadAll());
$('more').onclick = guarded(() => loadAll(true));
$('filters').onsubmit = guarded(async () => {
  const p = new URLSearchParams();
  for (const [k, v] of new FormData($('filters'))) {
    if (v) p.set(k, ['since', 'until'].includes(k) ? String(new Date(v).getTime()) : v);
  }
  query = p.toString();
  await loadAll();
});
$('pause').onclick = guarded(async () => {
  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: false }) });
  showMessage('上传已暂停；既有反馈仍可查看。');
  await loadAll();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin' }).catch(() => {});
}

const pairing = new URLSearchParams(location.hash.slice(1)).get('pairing');
history.replaceState(null, '', '/admin');
if (pairing) {
  api('login', { method: 'POST', body: JSON.stringify({ pairing }) })
    .then(enterConsole)
    .catch(() => showMessage('一次性登录链接已使用或过期，请重新生成。'));
} else {
  enterConsole().catch(() => {});
}
`;
