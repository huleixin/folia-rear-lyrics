// feedback-server/src/ui.mjs
// 听屿开发者管理中心（TINGYU · Developer Console）冰川主题响应式管理台（支持桌面 >=1200px / 平板 768-1199px / 手机 <768px + PWA）。
// 安全红线：所有外部文本仅通过 textContent / value 赋值渲染，SVG 仅通过 createElementNS 构造几何图形，绝不拼接不受信任的标记，绝不把凭据存入持久浏览器存储。

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
        <button type="button" class="nav-item" data-view="operations">运营统计</button>
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
        <!-- 1. 数据总览（四大清晰分区：运营数据 / 数据趋势 / 用户反馈 / 版本发布及服务状态） -->
        <section id="view-overview" class="view-pane">
          <!-- 第一区域：运营数据（核心 6 卡片） -->
          <div id="overview-zone-ops" class="zone-block">
            <div class="zone-header">
              <div>
                <h2 class="zone-title">运营数据</h2>
                <p id="overview-ops-note" class="muted">匿名使用统计默认关闭，仅统计主动授权开启的设备；官方下载计数来自公开 Release 附件统计。</p>
              </div>
              <button type="button" id="btn-goto-operations" class="btn-secondary compact-btn">进入详细运营统计</button>
            </div>
            <div id="overview-ops-kpis" class="kpi-grid kpi-grid-6"></div>
          </div>

          <!-- 第二区域：数据趋势与分布 -->
          <div id="overview-zone-trends" class="card zone-card">
            <div class="section-head">
              <div>
                <h2>数据趋势与版本分布</h2>
                <p class="muted">支持按时间窗口查看活跃增长、官方下载快照、版本使用占比与系统机型分布，无历史记录的日期绝不伪造曲线。</p>
              </div>
              <div class="range-bar">
                <button type="button" class="range-pill active" data-range="7d">近7天</button>
                <button type="button" class="range-pill" data-range="today">今日</button>
                <button type="button" class="range-pill" data-range="30d">近30天</button>
                <button type="button" class="range-pill" data-range="custom">自定义</button>
              </div>
            </div>
            <div id="custom-range-row" class="custom-range-row" hidden>
              <input type="date" id="range-since" aria-label="起始日期">
              <span class="muted">至</span>
              <input type="date" id="range-until" aria-label="结束日期">
              <button type="button" id="btn-apply-range" class="btn-primary compact-btn">应用日期</button>
            </div>
            <div id="overview-charts-grid" class="charts-grid"></div>
            <div id="overview-downloads-table-wrap" class="sub-section"></div>
          </div>

          <!-- 第三区域：用户反馈（紧凑摘要 + 快速筛选工单） -->
          <div id="overview-zone-feedback" class="card zone-card">
            <div class="section-head">
              <div>
                <h2 id="feedback-section-title">用户反馈摘要与近期工单</h2>
                <p class="muted">快速预览与筛选线上真实反馈，支持直达问题聚合与私有 R2 诊断日志。</p>
              </div>
              <div class="action-row no-margin">
                <button type="button" id="btn-goto-issues" class="btn-secondary compact-btn">问题聚合</button>
                <button type="button" id="btn-goto-logs" class="btn-secondary compact-btn">诊断日志</button>
                <button type="button" id="pause" class="btn-secondary compact-btn">暂停上传</button>
              </div>
            </div>
            <div id="stats" class="kpi-grid kpi-grid-4 compact-bottom"></div>
            <form id="filters" class="filter-bar">
              <input name="q" placeholder="编号 / 描述关键词" aria-label="搜索">
              <select name="type" aria-label="问题类型"></select>
              <select name="status" aria-label="处理状态"></select>
              <select name="severity" aria-label="严重程度">
                <option value="">所有优先级</option>
                <option value="high">高优先级</option>
                <option value="medium">中优先级</option>
                <option value="low">低优先级</option>
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

          <!-- 第四区域：版本发布及服务状态 -->
          <div id="overview-releases" class="zone-block"></div>
        </section>

        <!-- 1B. 运营统计（新增独立一级导航视图） -->
        <section id="view-operations" class="view-pane" hidden>
          <div class="card">
            <div class="section-head">
              <div>
                <h2>运营数据与软件内更新效果统计</h2>
                <p id="ops-scope-banner" class="muted">正在加载统计口径说明…</p>
              </div>
              <div class="action-row no-margin">
                <button type="button" id="btn-sync-downloads" class="btn-secondary compact-btn">立即同步官方下载计数</button>
              </div>
            </div>
            <div id="ops-full-kpis" class="kpi-grid"></div>
          </div>

          <div class="split-grid" id="ops-funnel-and-mirrors"></div>

          <div class="card">
            <h2>版本下载排行榜与各渠道明细</h2>
            <p class="muted">下载次数来自官方 Release .apk 附件累计值及应用内更新完成计数（已排除源码包等无关附件；下载次数 ≠ 安装人数 ≠ 独立用户数）。</p>
            <div id="ops-downloads-detail"></div>
          </div>

          <div class="card">
            <h2>版本健康与用户反馈交叉对照</h2>
            <p class="muted">按版本并列展示已授权匿名活跃设备数与全量用户反馈/闪退/播放异常情况；因活跃统计仅覆盖开启开关的设备而反馈面向全量用户，系统严格并列展示真实计数，不混算虚假百分比故障率。</p>
            <div id="ops-version-health"></div>
          </div>

          <div class="card" id="ops-quota-card"></div>
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
            <h2>反馈版本、问题类型与设备环境分布</h2>
            <div id="distributions" class="split-grid"></div>
          </div>
        </section>

        <!-- 5. 版本管理 -->
        <section id="view-releases" class="view-pane" hidden>
          <div class="card">
            <div class="section-head">
              <h2>版本库（正式版 / 测试版 / 候选版 / 已撤回）</h2>
              <select id="release-channel-filter" aria-label="版本渠道筛选" class="compact-select">
                <option value="">全部渠道</option>
                <option value="stable">正式稳定通道</option>
                <option value="testing">测试验证通道</option>
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
                  <option value="testing">测试验证通道（联调验证）</option>
                  <option value="stable">正式稳定通道（全量用户）</option>
                </select>
              </label>
              <label>版本名称
                <input name="versionName" placeholder="例如 1.5.82" required>
              </label>
              <label>整数版本号 (versionCode)
                <input name="versionCode" type="number" min="1" placeholder="例如 298" required>
              </label>
              <label>安装包字节大小
                <input name="apkSizeBytes" type="number" min="1048576" required>
              </label>
              <label>APK SHA-256（64位十六进制）
                <input name="sha256" placeholder="64位小写十六进制摘要" required>
              </label>
              <label>源码 Git Commit
                <input name="gitCommit" placeholder="例如 4483a935">
              </label>
              <label>Release 标签
                <input name="cnbTag" placeholder="例如 v1.5.82">
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
                  <option value="false">可选更新（允许稍后提醒）</option>
                </select>
              </label>
              <label>最低允许使用版本 (minSupportedVersionCode)
                <input name="minSupportedVersionCode" type="number" min="1" placeholder="低于该版本号的客户端将触发强制更新" required>
              </label>
              <label class="span-full">更新公告
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
            <p class="muted">暂停推送仅停止新版本提示；紧急解除强制更新会立即递增策略序列号并将最低支持版本降回 1，使被拦截的旧版客户端重新检查后立即恢复正常使用。</p>
            <div class="form-grid">
              <label>目标渠道
                <select id="policy-ctl-channel">
                  <option value="testing">测试验证通道</option>
                  <option value="stable">正式稳定通道</option>
                </select>
              </label>
              <label>操作说明 / 紧急原因
                <input id="policy-ctl-reason" placeholder="记录审计原因（如：发现兼容异常，紧急解除限制）">
              </label>
              <label class="span-full">独立发布确认密钥
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
            <div class="section-head">
              <div>
                <h2>下载节点健康度与真实二进制探测</h2>
                <p class="muted">每 30 分钟自动巡检 + 新版本发布即时探测；通过 HTTP Range: bytes=0-0 验证非网页直链、状态码与字节长度。</p>
              </div>
              <button type="button" id="btn-probe-all-nodes" class="btn-primary compact-btn">立即检测全部活跃节点</button>
            </div>
            <div id="nodes-summary-cards" class="split-grid compact-bottom"></div>
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
            <h2>本地 AI 协作指令中心</h2>
            <p class="muted">零付费 AI 接口依赖：直接复制标准化指令交给本地 AI 工具完成排查、构建、候选准备与校验，正式发布始终由开发者本人确认。</p>
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
      <button type="button" class="mnav-btn active" data-mgroup="workbench">工作台</button>
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
  --card-sub: #ECF2F8;
  --fg: #203747;
  --muted: #536D80;
  --accent: #385B73;
  --accent-2: #2A8562;
  --accent-3: #6C7D94;
  --accent-ink: #FFFFFF;
  --sel: #CEDDE9;
  --line: #D5E0EA;
  --ok: #1E7A50;
  --ok-bg: #E3F5EC;
  --warn: #9A6312;
  --warn-bg: #FDF3E1;
  --danger: #B3261E;
  --danger-bg: #FDECEA;
}
html[data-theme="dark"] {
  --bg: #101A23;
  --card: #182633;
  --card-sub: #13202B;
  --fg: #E8F0F7;
  --muted: #93ACC0;
  --accent: #527E9F;
  --accent-2: #58C294;
  --accent-3: #8CA6BE;
  --accent-ink: #FFFFFF;
  --sel: #243B4E;
  --line: #293F52;
  --ok: #6AD29E;
  --ok-bg: #163327;
  --warn: #F2BD6B;
  --warn-bg: #362915;
  --danger: #FF897D;
  --danger-bg: #3B1D22;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) {
    --bg: #101A23;
    --card: #182633;
    --card-sub: #13202B;
    --fg: #E8F0F7;
    --muted: #93ACC0;
    --accent: #527E9F;
    --accent-2: #58C294;
    --accent-3: #8CA6BE;
    --accent-ink: #FFFFFF;
    --sel: #243B4E;
    --line: #293F52;
    --ok: #6AD29E;
    --ok-bg: #163327;
    --warn: #F2BD6B;
    --warn-bg: #362915;
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
h2 { font-size: 16px; margin: 0 0 6px 0; font-weight: 650; }
h3 { font-size: 14px; margin: 10px 0 6px 0; font-weight: 620; }
p { margin: 4px 0; overflow-wrap: anywhere; }
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
  width: 236px;
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
  height: 62px;
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
.topbar-title { font-size: 19px; font-weight: 700; margin-right: 8px; }
.topbar-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.content {
  width: 100%;
  max-width: 1360px;
  margin: 0 auto;
  padding: 20px 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.view-pane { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.zone-block { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.zone-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.zone-title { font-size: 17px; font-weight: 700; margin: 0; }

.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.sub-card {
  background: var(--card-sub);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sub-section { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); min-width: 0; }
.compact-bottom { margin-bottom: 14px; }
.no-margin { margin-top: 0 !important; }

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  gap: 14px;
}
.kpi-grid-6 {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.kpi-grid-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.kpi-card {
  padding: 15px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 4px;
}
.kpi-card strong {
  display: block;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  margin-top: 2px;
  color: var(--fg);
}
.kpi-sub {
  font-size: 11.5px;
  color: var(--muted);
  margin-top: 2px;
}

.split-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}
.triple-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.stack-list { display: flex; flex-direction: column; gap: 10px; }
.row-item {
  min-height: 50px;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  gap: 5px;
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
  padding: 8px 12px;
  min-height: 42px;
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
.compact-select { min-height: 36px; padding: 5px 10px; font-size: 13px; }
.compact-btn { min-height: 36px; padding: 6px 12px; font-size: 13px; }
.full { width: 100%; }
.action-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }

.range-bar {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  background: var(--bg);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--line);
}
.range-pill {
  min-height: 32px;
  padding: 4px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  font-size: 12.5px;
  color: var(--muted);
}
.range-pill.active {
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.custom-range-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.svg-chart {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}
.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
}
.legend-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 5px;
  vertical-align: middle;
}
.donut-layout {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.donut-svg {
  width: 132px;
  height: 132px;
  flex-shrink: 0;
}
.bar-list { display: flex; flex-direction: column; gap: 7px; width: 100%; }
.bar-row { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.bar-track {
  width: 100%;
  height: 8px;
  background: var(--bg);
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid var(--line);
}
.bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
}
.bar-fill-alt { background: var(--accent-2); }

.table-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 560px;
}
.data-table th, .data-table td {
  padding: 9px 12px;
  text-align: left;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.data-table th {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
  background: var(--card-sub);
}
.data-table tr:last-child td { border-bottom: none; }

.filter-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
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
  white-space: nowrap;
}
.badge-ok { color: var(--ok); background: var(--ok-bg); }
.badge-warn { color: var(--warn); background: var(--warn-bg); }
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
  .sidebar { width: 196px; }
  .content { padding: 16px; }
  .kpi-grid-6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .triple-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .charts-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 手机端自适应布局 (< 768px)：零横向溢出 + 紧凑栅格 + 安全区底栏 */
@media (max-width: 767px) {
  .sidebar { display: none; }
  .mobile-only { display: flex; }
  .topbar {
    height: 56px;
    padding: 0 14px;
  }
  .topbar-title { font-size: 16px; }
  .topbar-actions { gap: 6px; }
  .topbar-actions button, .topbar-actions select {
    padding: 5px 8px;
    min-height: 34px;
    font-size: 12px;
  }
  .subtabs {
    gap: 8px;
    overflow-x: auto;
    padding: 10px 14px 2px;
    scrollbar-width: none;
  }
  .subtab-pill {
    min-height: 34px;
    padding: 5px 13px;
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
  .status-banner { margin: 8px 14px 0; }
  .content {
    padding: 12px 14px calc(78px + env(safe-area-inset-bottom, 0px));
    gap: 14px;
  }
  .card { border-radius: 14px; padding: 14px; }
  .sub-card { padding: 12px; }
  .kpi-grid, .kpi-grid-6, .kpi-grid-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .kpi-card { padding: 12px; }
  .kpi-card strong { font-size: 20px; }
  .split-grid, .triple-grid, .charts-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .filter-bar { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .form-grid { grid-template-columns: minmax(0, 1fr); }
  .donut-svg { width: 112px; height: 112px; }
  .mobile-bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--card);
    border-top: 1px solid var(--line);
    padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px));
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

export const adminScript = "\n// Tingyu Developer Console runtime: textContent + createElementNS SVG only, zero persistent token storage.\nconst $ = id => document.getElementById(id);\nconst SVG_NS = 'http://www.w3.org/2000/svg';\n\nconst TYPES = {\n  playback: '播放失败', stutter: '播放卡顿', crash: '闪退', lyrics: '歌词异常',\n  display: '界面异常', rear: '背屏异常', pad: '平板适配', local: '本地音乐', other: '其他'\n};\nconst STATUSES = {\n  pending: '待处理', investigating: '排查中', verification: '待验证',\n  fixed: '已修复', unreproduced: '无法复现', closed: '已关闭'\n};\nconst STAGES = {\n  new: '新反馈', pending_confirm: '待确认', confirmed: '已确认', fixing: '修复中',\n  pending_test: '待测试', tested_ok: '测试通过', published: '已发布',\n  verified_resolved: '已验证解决', reopened: '问题复现'\n};\nconst CHANNEL_ZH = {\n  stable: '正式稳定通道',\n  testing: '测试验证通道',\n  archive: '历史归档版本'\n};\nconst POLICY_ACTION_ZH = {\n  normal: '正常推送',\n  pause: '已暂停推送',\n  emergency_unlock: '紧急解除强制更新'\n};\nconst AUDIT_ACTION_ZH = {\n  prepare_candidate: '准备候选版本',\n  update_draft: '修改候选配置',\n  mark_tested: '标记测试通过',\n  approve_candidate: '审核锁定候选',\n  withdraw: '撤回候选版本',\n  verify_node: '检测下载节点',\n  publish_release: '签发版本推送',\n  pause_updates: '暂停渠道推送',\n  emergency_unlock: '紧急解除强制更新',\n  update_policy: '调整更新策略',\n  sync_static_nodes: '同步静态镜像节点'\n};\nconst DIST_KEY_ZH = {\n  categories: '问题类型分布',\n  statuses: '处理状态分布',\n  versions: '反馈来源版本',\n  os: 'Android 系统分布',\n  models: '反馈设备型号'\n};\nconst VIEW_TITLES = {\n  overview: '数据总览', operations: '运营统计', feedback: '用户反馈', logs: '诊断日志', issues: '问题聚合', analytics: '版本分析',\n  releases: '版本管理', publish: '版本发布', policy: '更新策略', nodes: '下载节点', audit: '发布记录',\n  ai: 'AI协作', health: '服务状态', security: '安全管理', settings: '系统设置'\n};\nconst MOBILE_GROUPS = {\n  workbench: ['overview', 'operations', 'analytics'],\n  feedback: ['feedback', 'logs', 'issues'],\n  releases: ['releases', 'publish', 'policy', 'nodes', 'audit'],\n  system: ['ai', 'health', 'security', 'settings']\n};\n\nlet role = 'read';\nlet remotePublishReady = false;\nlet currentView = 'overview';\nlet cursor = null;\nlet query = '';\nlet trendRange = '7d';\nlet customSince = '';\nlet customUntil = '';\nlet latestOverview = null;\nlet latestTelemetry = null;\nlet latestReleases = [];\nlet latestIssues = [];\n\nfunction formatReleaseStatusZh(rel) {\n  if (!rel) return '暂无记录';\n  const s = rel.status;\n  if (s === 'draft') return '待上传';\n  if (s === 'candidate') return '待校验';\n  if (s === 'testing_passed') return '待审核';\n  if (s === 'approved') return '待发布（已审核）';\n  if (s === 'published') return rel.channel === 'testing' ? '测试版已发布' : '正式版已发布';\n  if (s === 'paused') return '已暂停';\n  if (s === 'withdrawn') return '已撤回';\n  if (s === 'failed') return '发布失败';\n  return '待审核';\n}\n\nfunction nodeBadgeClass(stateCode) {\n  if (stateCode === 'healthy') return 'badge badge-ok';\n  if (stateCode === 'abnormal') return 'badge badge-danger';\n  if (stateCode === 'stale') return 'badge badge-warn';\n  return 'badge';\n}\n\nfunction el(tag, text, parent, cls) {\n  const n = document.createElement(tag);\n  if (cls) n.className = cls;\n  if (text !== undefined && text !== null) n.textContent = String(text);\n  if (parent) parent.append(n);\n  return n;\n}\n\nfunction svgEl(tag, attrs = {}, parent = null) {\n  const n = document.createElementNS(SVG_NS, tag);\n  for (const [k, v] of Object.entries(attrs)) {\n    n.setAttribute(k, String(v));\n  }\n  if (parent) parent.append(n);\n  return n;\n}\n\nfunction fillSelect(select, map, includeAll) {\n  select.replaceChildren();\n  if (includeAll) el('option', '全部', select).value = '';\n  for (const [k, v] of Object.entries(map)) {\n    el('option', v, select).value = k;\n  }\n}\n\nfillSelect(document.querySelector('[name=type]'), TYPES, true);\nfillSelect(document.querySelector('[name=status]'), STATUSES, true);\n\nfunction showMessage(text) {\n  const box = $('message');\n  if (!text) { box.hidden = true; box.textContent = ''; return; }\n  box.textContent = text;\n  box.hidden = false;\n}\n\nfunction guarded(fn) {\n  return async e => {\n    e?.preventDefault();\n    try { await fn(e); } catch (err) { showMessage(err?.message || '操作失败'); }\n  };\n}\n\nfunction randomNonce() {\n  const arr = new Uint8Array(18);\n  crypto.getRandomValues(arr);\n  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');\n}\n\nfunction fmtBytes(bytes) {\n  if (!bytes || bytes <= 0) return '0 B';\n  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';\n  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';\n  return bytes + ' B';\n}\n\nfunction fmtTime(ms) {\n  if (!ms) return '暂无记录';\n  return new Date(ms).toLocaleString('zh-CN', { hour12: false });\n}\n\nfunction fmtPct(val, emptyText = '暂无足够数据') {\n  if (val === null || val === undefined || Number.isNaN(Number(val))) return emptyText;\n  return Number(val).toFixed(1) + '%';\n}\n\nasync function api(path, options = {}) {\n  const r = await fetch('/api/admin/' + path, {\n    ...options,\n    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }\n  });\n  if (!r.ok) {\n    let code = '';\n    try { code = (await r.json()).error || ''; } catch {}\n    if (r.status === 401) throw Error('登录已过期或凭据无效，请重新登录');\n    if (code === 'publish_signing_not_configured') throw Error('云端尚未配置独立发布签名密钥，远程正式发布暂不可用');\n    if (code === 'publish_secret_invalid') throw Error('独立发布确认密钥验证失败');\n    if (code === 'candidate_not_approved') throw Error('候选版本尚未完成审核确认，禁止直接发布');\n    if (code === 'approval_digest_mismatch_reapproval_required') throw Error('候选内容在审核后发生变更，请重新审核确认');\n    if (code === 'download_nodes_unreachable_abort_publish') throw Error('远程安装包下载校验未通过，已自动中止正式发布以保护线上用户');\n    throw Error('请求失败 (' + r.status + (code ? ': ' + code : '') + ')');\n  }\n  return r.json();\n}\n\nfunction switchView(view) {\n  // 'feedback' 复用 #view-overview 中的可筛选工单卡片，其余区域在 'feedback' 视图下自动隐藏\n  currentView = view;\n  $('page-title').textContent = VIEW_TITLES[view] || '工作台';\n  for (const btn of document.querySelectorAll('.nav-item')) {\n    btn.classList.toggle('active', btn.dataset.view === view);\n  }\n  const activePaneId = view === 'feedback' ? 'view-overview' : 'view-' + view;\n  for (const pane of document.querySelectorAll('.view-pane')) {\n    pane.hidden = pane.id !== activePaneId;\n  }\n  const isFeedbackOnly = view === 'feedback';\n  $('overview-zone-ops').hidden = isFeedbackOnly;\n  $('overview-zone-trends').hidden = isFeedbackOnly;\n  $('overview-releases').hidden = isFeedbackOnly;\n  $('stats').hidden = isFeedbackOnly;\n  $('feedback-section-title').textContent = isFeedbackOnly ? '全部用户反馈与多维筛选' : '用户反馈摘要与近期工单';\n\n  let matchedGroup = 'workbench';\n  for (const [g, list] of Object.entries(MOBILE_GROUPS)) {\n    if (list.includes(view)) { matchedGroup = g; break; }\n  }\n  for (const mbtn of document.querySelectorAll('.mnav-btn')) {\n    mbtn.classList.toggle('active', mbtn.dataset.mgroup === matchedGroup);\n  }\n  const sub = $('mobile-subtabs');\n  sub.replaceChildren();\n  for (const subView of MOBILE_GROUPS[matchedGroup]) {\n    const pill = el('button', VIEW_TITLES[subView], sub, 'subtab-pill' + (subView === view ? ' active' : ''));\n    pill.type = 'button';\n    pill.onclick = () => switchView(subView);\n  }\n}\n\nfor (const btn of document.querySelectorAll('.nav-item')) {\n  btn.onclick = () => switchView(btn.dataset.view);\n}\nfor (const mbtn of document.querySelectorAll('.mnav-btn')) {\n  mbtn.onclick = () => {\n    const list = MOBILE_GROUPS[mbtn.dataset.mgroup] || ['overview'];\n    switchView(list[0]);\n  };\n}\n$('btn-goto-operations').onclick = () => switchView('operations');\n$('btn-goto-issues').onclick = () => switchView('issues');\n$('btn-goto-logs').onclick = () => switchView('logs');\n\n// 时间范围选择器联动\nfor (const pill of document.querySelectorAll('.range-pill')) {\n  pill.onclick = guarded(async () => {\n    const nextRange = pill.dataset.range;\n    for (const p of document.querySelectorAll('.range-pill')) {\n      p.classList.toggle('active', p === pill);\n    }\n    if (nextRange === 'custom') {\n      $('custom-range-row').hidden = false;\n      return;\n    }\n    $('custom-range-row').hidden = true;\n    trendRange = nextRange;\n    await loadTelemetryOnly();\n  });\n}\n$('btn-apply-range').onclick = guarded(async () => {\n  customSince = $('range-since').value;\n  customUntil = $('range-until').value;\n  if (!customSince || !customUntil) throw Error('请选择完整的起始与结束日期');\n  trendRange = 'custom';\n  await loadTelemetryOnly();\n});\n\n$('theme-mode').onchange = e => {\n  const v = e.target.value;\n  if (v === 'system') delete document.documentElement.dataset.theme;\n  else document.documentElement.dataset.theme = v;\n  try { sessionStorage.setItem('ty_console_theme', v); } catch {}\n};\ntry {\n  const savedTheme = sessionStorage.getItem('ty_console_theme');\n  if (savedTheme === 'light' || savedTheme === 'dark') {\n    $('theme-mode').value = savedTheme;\n    document.documentElement.dataset.theme = savedTheme;\n  }\n} catch {}\n\n$('local-apk-file').onchange = guarded(async e => {\n  const file = e.target.files?.[0];\n  if (!file) return;\n  showMessage('正在浏览器本地计算 APK SHA-256 摘要，请稍候…');\n  const buf = await file.arrayBuffer();\n  const digest = await crypto.subtle.digest('SHA-256', buf);\n  const sha = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');\n  const form = $('candidate-form');\n  form.elements.apkSizeBytes.value = String(file.size);\n  form.elements.sha256.value = sha;\n  const verMatch = /tingyu-([0-9]+\\.[0-9]+\\.[0-9]+)-release\\.apk/i.exec(file.name);\n  if (verMatch && !form.elements.versionName.value) {\n    form.elements.versionName.value = verMatch[1];\n    form.elements.cnbTag.value = 'v' + verMatch[1];\n  }\n  showMessage('已读取本地 APK：大小 ' + fmtBytes(file.size) + '，SHA-256 为 ' + sha.slice(0, 16) + '…');\n});\n\nfunction buildLineChartSvg(container, seriesList, emptyText) {\n  const w = 480, h = 156, padL = 34, padR = 14, padT = 14, padB = 26;\n  const innerW = w - padL - padR;\n  const innerH = h - padT - padB;\n  const primary = seriesList[0]?.points || [];\n  if (!primary.length) {\n    el('p', emptyText, container, 'muted');\n    return;\n  }\n  let maxVal = 1;\n  for (const s of seriesList) {\n    for (const pt of s.points) {\n      if (pt.y !== null && pt.y > maxVal) maxVal = pt.y;\n    }\n  }\n  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'svg-chart', role: 'img' }, container);\n  for (let i = 0; i <= 3; i++) {\n    const gy = padT + (innerH * i) / 3;\n    svgEl('line', { x1: padL, y1: gy, x2: w - padR, y2: gy, stroke: 'var(--line)', 'stroke-dasharray': i === 3 ? '' : '3 3', 'stroke-width': 1 }, svg);\n    const tickVal = Math.round(maxVal * (1 - i / 3));\n    const lbl = svgEl('text', { x: padL - 6, y: gy + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 10 }, svg);\n    lbl.textContent = String(tickVal);\n  }\n\n  for (const s of seriesList) {\n    const valid = s.points.map((pt, idx) => ({ ...pt, idx })).filter(pt => pt.y !== null);\n    if (!valid.length) continue;\n    const xAt = idx => primary.length === 1 ? padL + innerW / 2 : padL + (idx / (primary.length - 1)) * innerW;\n    const yAt = val => padT + innerH - (val / maxVal) * innerH;\n\n    if (valid.length >= 2 && s.area) {\n      const areaPts = [\n        `${xAt(valid[0].idx)},${padT + innerH}`,\n        ...valid.map(p => `${xAt(p.idx)},${yAt(p.y)}`),\n        `${xAt(valid[valid.length - 1].idx)},${padT + innerH}`\n      ].join(' ');\n      svgEl('polygon', { points: areaPts, fill: s.color, opacity: '0.12' }, svg);\n    }\n    if (valid.length >= 2) {\n      const linePts = valid.map(p => `${xAt(p.idx)},${yAt(p.y)}`).join(' ');\n      svgEl('polyline', { points: linePts, fill: 'none', stroke: s.color, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);\n    }\n    for (const p of valid) {\n      svgEl('circle', { cx: xAt(p.idx), cy: yAt(p.y), r: 3.4, fill: s.color }, svg);\n    }\n  }\n\n  const labelIdx = primary.length <= 5\n    ? primary.map((_, idx) => idx)\n    : [0, Math.floor((primary.length - 1) / 2), primary.length - 1];\n  for (const idx of [...new Set(labelIdx)]) {\n    const x = primary.length === 1 ? padL + innerW / 2 : padL + (idx / (primary.length - 1)) * innerW;\n    const t = svgEl('text', { x, y: h - 6, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 10 }, svg);\n    t.textContent = String(primary[idx].x || '').slice(5);\n  }\n}\n\nfunction buildDonutChartSvg(container, items) {\n  const wrap = el('div', undefined, container, 'donut-layout');\n  const svg = svgEl('svg', { viewBox: '0 0 120 120', class: 'donut-svg', role: 'img' }, wrap);\n  const cx = 60, cy = 60, r = 42, circ = 2 * Math.PI * r;\n  const palette = ['#385B73', '#2A8562', '#6C8EAD', '#C98A2C', '#7C6A96', '#4E9DA6'];\n  svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': 16 }, svg);\n\n  const total = items.reduce((s, x) => s + Number(x.value || 0), 0);\n  const legend = el('div', undefined, wrap, 'stack-list');\n  legend.style.flex = '1';\n  legend.style.gap = '4px';\n\n  if (total <= 0) {\n    const center = svgEl('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, svg);\n    center.textContent = '暂无样本';\n    el('p', '等待 v1.5.82 及以上客户端开启「匿名使用统计」后自动生成版本占比。', legend, 'muted');\n    return;\n  }\n\n  let offset = 0;\n  items.slice(0, 6).forEach((it, idx) => {\n    const frac = Number(it.value || 0) / total;\n    const dash = frac * circ;\n    const color = palette[idx % palette.length];\n    svgEl('circle', {\n      cx, cy, r,\n      fill: 'none',\n      stroke: color,\n      'stroke-width': 16,\n      'stroke-dasharray': `${dash} ${circ - dash}`,\n      'stroke-dashoffset': String(-offset),\n      transform: `rotate(-90 ${cx} ${cy})`\n    }, svg);\n    offset += dash;\n\n    const row = el('div', undefined, legend, 'muted');\n    const dot = el('span', '', row, 'legend-dot');\n    dot.style.background = color;\n    row.append(document.createTextNode(`${it.label} · ${it.value} 台 (${(frac * 100).toFixed(1)}%)`));\n  });\n\n  const centerNum = svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', fill: 'var(--fg)', 'font-size': 14, 'font-weight': '700' }, svg);\n  centerNum.textContent = String(total);\n  const centerSub = svgEl('text', { x: cx, y: cy + 13, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 9.5 }, svg);\n  centerSub.textContent = '30日活跃设备';\n}\n\nfunction renderHorizontalBars(container, rows, emptyText, altColor = false) {\n  if (!rows?.length) {\n    el('p', emptyText, container, 'muted');\n    return;\n  }\n  const maxVal = Math.max(1, ...rows.map(r => Number(r.devices ?? r.value ?? 0)));\n  const list = el('div', undefined, container, 'bar-list');\n  for (const r of rows.slice(0, 5)) {\n    const val = Number(r.devices ?? r.value ?? 0);\n    const item = el('div', undefined, list, 'bar-row');\n    const top = el('div', undefined, item, 'row-top');\n    el('span', r.label, top);\n    el('span', `${val}`, top, 'muted');\n    const track = el('div', undefined, item, 'bar-track');\n    const fill = el('div', undefined, track, 'bar-fill' + (altColor ? ' bar-fill-alt' : ''));\n    fill.style.width = `${Math.max(4, Math.round((val / maxVal) * 100))}%`;\n  }\n}\n\nfunction renderDownloadsTable(container, downloads, maxRows = 12) {\n  container.replaceChildren();\n  const versions = (downloads?.versions || []).slice(0, maxRows);\n  if (!versions.length) {\n    el('p', '暂无版本下载统计记录。可点击「同步官方下载计数」拉取最新 Release 附件统计。', container, 'muted');\n    return;\n  }\n  const scroll = el('div', undefined, container, 'table-scroll');\n  const tbl = el('table', undefined, scroll, 'data-table');\n  const thead = el('thead', undefined, tbl);\n  const hr = el('tr', undefined, thead);\n  for (const h of ['版本号', '版本类型', 'APK 安装包附件', 'GitHub 官方下载', 'CNB 官方下载', '应用内更新完成', '已知累计下载']) {\n    el('th', h, hr);\n  }\n  const tbody = el('tbody', undefined, tbl);\n  for (const v of versions) {\n    const tr = el('tr', undefined, tbody);\n    el('td', 'v' + v.versionName + (v.versionCode ? ` (${v.versionCode})` : ''), tr);\n    const chTd = el('td', undefined, tr);\n    el('span', CHANNEL_ZH[v.channel] || '正式版本', chTd, 'badge');\n    el('td', v.assetName || '-', tr, 'muted');\n    el('td', v.githubDownloads === null || v.githubDownloads === undefined ? '暂无统计数据' : String(v.githubDownloads), tr);\n    const cnbTd = el('td', undefined, tr);\n    if (v.cnbDownloads === null || v.cnbDownloads === undefined) {\n      el('span', '暂无统计数据', cnbTd, 'muted');\n    } else {\n      cnbTd.textContent = String(v.cnbDownloads);\n    }\n    const inAppSum = Number(v.inAppCnbDownloads || 0) + Number(v.inAppGithubDownloads || 0);\n    el('td', inAppSum > 0 ? `${inAppSum} (CNB ${v.inAppCnbDownloads || 0} / GH ${v.inAppGithubDownloads || 0})` : '0', tr);\n    const totalTd = el('td', undefined, tr);\n    el('strong', String(v.totalDownloads ?? 0), totalTd);\n  }\n}\n\nfunction renderTelemetrySections(tel) {\n  latestTelemetry = tel;\n  const k = tel?.kpis || {};\n  const meta = tel?.coverageMeta || {};\n  const dl = tel?.downloads || {};\n  const winMin = meta.activeWindowMinutes || 15;\n\n  $('overview-ops-note').textContent = meta.scopeNote || '仅统计主动开启「匿名使用统计」的设备；下载次数来自官方 Release 附件统计。';\n\n  // 第一区域：核心 6 张运营数据卡片\n  const opsKpiBox = $('overview-ops-kpis');\n  opsKpiBox.replaceChildren();\n  const top6 = [\n    [`近${winMin}分钟活跃设备`, String(k.activeRecentDevices ?? 0), '近期有效心跳 · 匿名估算'],\n    ['今日活跃设备', String(k.dauToday ?? 0), `昨日活跃 ${k.dauYesterday ?? 0} 台`],\n    ['今日新增设备', String(k.newToday ?? 0), `昨日新增 ${k.newYesterday ?? 0} 台`],\n    ['累计观测设备', String(k.totalObservedDevices ?? 0), '开启统计的安装 ID 去重'],\n    ['累计下载次数', String(dl.totalCumulativeDownloads ?? 0), `GitHub 官方 ${dl.githubOfficialTotalDownloads ?? 0} 次 · CNB ${dl.cnbOfficialTotalDownloads === null ? '暂无官方计数' : dl.cnbOfficialTotalDownloads}`],\n    [\n      '最新正式版本使用率',\n      k.latestStableSharePercent !== null && k.latestStableSharePercent !== undefined ? (k.latestStableSharePercent + '%') : '暂无活跃样本',\n      k.latestStableVersionName ? `正式版 v${k.latestStableVersionName} 活跃占比` : '等待正式版活跃样本'\n    ],\n  ];\n  for (const [title, val, sub] of top6) {\n    const c = el('div', undefined, opsKpiBox, 'card kpi-card');\n    el('span', title, c, 'muted');\n    el('strong', val, c);\n    el('span', sub, c, 'kpi-sub');\n  }\n\n  // 第二区域：2x2 趋势与分布图表\n  const chartsGrid = $('overview-charts-grid');\n  chartsGrid.replaceChildren();\n\n  // 图1：活跃与新增趋势折线图\n  const c1 = el('div', undefined, chartsGrid, 'sub-card');\n  const c1Head = el('div', undefined, c1, 'row-top');\n  el('strong', '活跃与新增设备趋势', c1Head);\n  const leg1 = el('div', undefined, c1Head, 'chart-legend');\n  const d1 = el('span', '', leg1, 'legend-dot'); d1.style.background = '#385B73'; leg1.append(document.createTextNode('日活跃 '));\n  const d2 = el('span', '', leg1, 'legend-dot'); d2.style.background = '#2A8562'; leg1.append(document.createTextNode('日新增'));\n  const activePts = (tel?.trends?.dailyActiveAndNew || []);\n  buildLineChartSvg(\n    c1,\n    [\n      { color: '#385B73', area: true, points: activePts.map(r => ({ x: r.day, y: Number(r.dau || 0) })) },\n      { color: '#2A8562', area: false, points: activePts.map(r => ({ x: r.day, y: Number(r.newDevices || 0) })) },\n    ],\n    '当前选定时间窗口暂无已上报的匿名活跃设备记录（不伪造启用前历史数据）。'\n  );\n  el('p', meta.startedDay ? `统计生效起点：${meta.startedDay}（此前日期无历史采集，不补造数据）` : '尚未收到首台开启「匿名使用统计」的客户端心跳上报。', c1, 'muted');\n\n  // 图2：官方下载快照趋势与节点占比对比\n  const c2 = el('div', undefined, chartsGrid, 'sub-card');\n  const c2Head = el('div', undefined, c2, 'row-top');\n  el('strong', '安装包下载趋势与节点对比', c2Head);\n  el('span', dl.todayNewDownloads === null || dl.todayNewDownloads === undefined ? '今日增量：首日建立快照基线中' : `今日新增下载：${dl.todayNewDownloads}`, c2Head, 'badge');\n  const dlPts = (dl.dailyTrend || []);\n  buildLineChartSvg(\n    c2,\n    [{ color: '#385B73', area: true, points: dlPts.map(r => ({ x: r.day, y: Number(r.cumulativeDownloads || 0) })) }],\n    '每日下载快照将在首次同步官方 Release 后自动生成趋势点。'\n  );\n  const nodeCompare = el('div', undefined, c2, 'bar-list');\n  const ghCount = Number(dl.githubOfficialTotalDownloads || 0);\n  const inAppCnb = Number(dl.inAppNodeDownloads?.cnbPrimary || 0);\n  const inAppGh = Number(dl.inAppNodeDownloads?.githubBackup || 0);\n  const rRow1 = el('div', undefined, nodeCompare, 'row-top muted');\n  el('span', `GitHub 官方 Release 累计：${ghCount} 次`, rRow1);\n  el('span', `CNB 官方 Release 统计：${dl.cnbOfficialTotalDownloads === null || dl.cnbOfficialTotalDownloads === undefined ? '暂无统计数据' : (dl.cnbOfficialTotalDownloads + ' 次')}`, rRow1);\n  const rRow2 = el('div', undefined, nodeCompare, 'row-top muted');\n  el('span', `软件内更新节点实测完成：CNB 国内节点 ${inAppCnb} 次 · GitHub 备用节点 ${inAppGh} 次`, rRow2);\n  if (dl.cnbStatusNote) el('p', dl.cnbStatusNote, c2, 'muted');\n\n  // 图3：各版本活跃占比环形图\n  const c3 = el('div', undefined, chartsGrid, 'sub-card');\n  el('strong', '各版本活跃设备占比（近30日）', c3);\n  const verItems = (tel?.distributions?.byVersion || []).map(v => ({\n    label: `v${v.versionName} (${v.channel === 'testing' ? '测试' : '正式'})`,\n    value: v.devices\n  }));\n  buildDonutChartSvg(c3, verItems);\n\n  // 图4：Android 系统与设备型号分布\n  const c4 = el('div', undefined, chartsGrid, 'sub-card');\n  el('strong', 'Android 系统版本与机型分布（近30日）', c4);\n  const sysSplit = el('div', undefined, c4, 'split-grid');\n  sysSplit.style.gridTemplateColumns = 'repeat(auto-fit, minmax(170px, 1fr))';\n  const sysCol = el('div', undefined, sysSplit);\n  el('p', 'Android 系统版本', sysCol, 'muted');\n  renderHorizontalBars(sysCol, tel?.distributions?.byAndroidVersion || [], '暂无系统版本样本', false);\n  const modCol = el('div', undefined, sysSplit);\n  el('p', '设备型号前五', modCol, 'muted');\n  renderHorizontalBars(modCol, tel?.distributions?.byDeviceModel || [], '暂无设备型号样本', true);\n\n  // 总览下方各版本下载次数简表\n  const dlWrap = $('overview-downloads-table-wrap');\n  dlWrap.replaceChildren();\n  const dlHead = el('div', undefined, dlWrap, 'row-top');\n  el('h3', '各版本官方 APK 下载次数统计（前 8 个版本）', dlHead);\n  el('span', `正式版下载 ${dl.stableDownloads ?? 0} 次 · 测试版下载 ${dl.testingDownloads ?? 0} 次 · 最近同步 ${fmtTime(dl.lastSyncedAt)}`, dlHead, 'muted');\n  const dlTableMount = el('div', undefined, dlWrap);\n  renderDownloadsTable(dlTableMount, dl, 8);\n\n  // 渲染独立一级导航「运营统计」视图\n  renderDedicatedOperationsView(tel);\n}\n\nfunction renderDedicatedOperationsView(tel) {\n  const k = tel?.kpis || {};\n  const meta = tel?.coverageMeta || {};\n  const ret = tel?.retention || {};\n  const funnel = tel?.updateFunnel || {};\n  const dl = tel?.downloads || {};\n  const winMin = meta.activeWindowMinutes || 15;\n\n  $('ops-scope-banner').textContent = (meta.scopeNote || '') + ' 同时明确区分：Release 附件下载次数 ≠ 实际安装人数 ≠ 独立活跃用户数。';\n\n  const fullBox = $('ops-full-kpis');\n  fullBox.replaceChildren();\n  const latestMau = tel?.trends?.monthlyActive?.length\n    ? tel.trends.monthlyActive[tel.trends.monthlyActive.length - 1].mau\n    : k.active30d ?? 0;\n  const cards = [\n    [`近${winMin}分钟活跃`, String(k.activeRecentDevices ?? 0), '近期有效心跳设备'],\n    ['今日活跃 (DAU)', String(k.dauToday ?? 0), `昨日活跃 ${k.dauYesterday ?? 0} 台`],\n    ['近7日活跃设备', String(k.active7d ?? 0), '7日内去重匿名安装 ID'],\n    ['近30日活跃 / MAU', `${k.active30d ?? 0} / ${latestMau}`, '近30日滚动 / 当月自然月'],\n    ['今日新增设备', String(k.newToday ?? 0), `昨日新增 ${k.newYesterday ?? 0} 台`],\n    ['次日留存率', fmtPct(ret.day1?.ratePercent, '暂无足够数据'), ret.day1?.cohortDay ? `样本日 ${ret.day1.cohortDay} (${ret.day1.retained}/${ret.day1.cohortSize})` : '需满完整次日观察窗口'],\n    ['7日留存率', fmtPct(ret.day7?.ratePercent, '暂无足够数据'), ret.day7?.cohortDay ? `样本日 ${ret.day7.cohortDay} (${ret.day7.retained}/${ret.day7.cohortSize})` : '需满完整7日观察窗口'],\n    ['测试版本使用占比', fmtPct(k.testingSharePercent, '暂无活跃样本'), 'testing 通道近30日占比'],\n  ];\n  for (const [title, val, sub] of cards) {\n    const c = el('div', undefined, fullBox, 'sub-card kpi-card');\n    el('span', title, c, 'muted');\n    el('strong', val, c);\n    el('span', sub, c, 'kpi-sub');\n  }\n\n  // 更新效果与节点实测分流\n  const fmBox = $('ops-funnel-and-mirrors');\n  fmBox.replaceChildren();\n  const fCard = el('div', undefined, fmBox, 'card');\n  el('h2', '软件内更新全链路漏斗（选定时间窗口）', fCard);\n  const fRows = [\n    ['发起更新下载次数', String(funnel.downloadStarted ?? 0)],\n    ['安装包下载成功次数', `${funnel.downloadSucceeded ?? 0}（成功率：${fmtPct(funnel.downloadSuccessRatePercent, '暂无下载记录')}）`],\n    ['安装包下载失败次数', `${funnel.downloadFailed ?? 0}（失败率：${fmtPct(funnel.downloadFailureRatePercent, '暂无下载记录')}）`],\n    ['SHA-256 / 签名校验失败次数', String(funnel.verifyFailed ?? 0)],\n    ['覆盖升级后新版首次启动确认', `${funnel.installConfirmed ?? 0} 台`],\n    ['最新正式版活跃覆盖率', fmtPct(funnel.newVersionCoveragePercent, '暂无活跃样本')],\n  ];\n  for (const [lbl, v] of fRows) {\n    const r = el('div', undefined, fCard, 'row-item');\n    const top = el('div', undefined, r, 'row-top');\n    el('span', lbl, top);\n    el('strong', v, top);\n  }\n  if (funnel.installConfirmNote) el('p', funnel.installConfirmNote, fCard, 'muted');\n\n  const mCard = el('div', undefined, fmBox, 'card');\n  el('h2', '客户端下载节点实测使用明细', mCard);\n  const mirrors = funnel.byMirror || [];\n  if (!mirrors.length) {\n    el('p', '选定时间范围内暂无客户端上报的软件内更新节点事件。', mCard, 'muted');\n  } else {\n    for (const m of mirrors) {\n      const r = el('div', undefined, mCard, 'row-item');\n      const top = el('div', undefined, r, 'row-top');\n      const mName = m.mirrorId === 'cnb-primary' ? 'CNB 国内主节点' : m.mirrorId === 'github-backup' ? 'GitHub 备用节点' : m.mirrorId;\n      el('strong', mName, top);\n      const term = (m.succeeded || 0) + (m.failed || 0);\n      el('span', term > 0 ? `成功率 ${((m.succeeded / term) * 100).toFixed(1)}%` : '下载进行中', top, 'badge');\n      el('p', `发起 ${m.started || 0} 次 · 成功 ${m.succeeded || 0} 次 · 失败 ${m.failed || 0} 次`, r, 'muted');\n    }\n  }\n\n  // 全量版本下载统计表\n  renderDownloadsTable($('ops-downloads-detail'), dl, 40);\n\n  // 版本健康交叉矩阵\n  const vhBox = $('ops-version-health');\n  vhBox.replaceChildren();\n  const matrix = tel?.versionHealthMatrix || [];\n  if (!matrix.length) {\n    el('p', '暂无版本健康对照记录。', vhBox, 'muted');\n  } else {\n    const scroll = el('div', undefined, vhBox, 'table-scroll');\n    const tbl = el('table', undefined, scroll, 'data-table');\n    const thead = el('thead', undefined, tbl);\n    const hr = el('tr', undefined, thead);\n    for (const h of ['版本号', '已观测活跃设备', '反馈总数', '闪退反馈', '播放/卡顿反馈', '已修复项', '待处理项']) {\n      el('th', h, hr);\n    }\n    const tbody = el('tbody', undefined, tbl);\n    for (const row of matrix) {\n      const tr = el('tr', undefined, tbody);\n      el('td', 'v' + row.versionName, tr);\n      el('td', row.observedActiveDevices === null ? '未覆盖/0' : `${row.observedActiveDevices} 台`, tr, 'muted');\n      el('td', String(row.totalFeedback || 0), tr);\n      el('td', String(row.crashFeedback || 0), tr, row.crashFeedback > 0 ? 'badge-danger' : '');\n      el('td', String(row.playbackFeedback || 0), tr);\n      el('td', String(row.resolvedItems || 0), tr);\n      el('td', String(row.openItems || 0), tr);\n    }\n  }\n\n  // 免费额度与降频保护卡\n  const qCard = $('ops-quota-card');\n  qCard.replaceChildren();\n  el('h2', 'Cloudflare 免费额度预算与统计保护控制', qCard);\n  const used = Number(meta.dailyWritesUsed || 0);\n  const budget = Math.max(1, Number(meta.dailyWriteBudget || 40000));\n  const modeZh = meta.throttleMode === 'disabled_by_admin'\n    ? '管理员已关闭接收'\n    : meta.throttleMode === 'paused_quota_guard'\n      ? '已触发 90% 预算熔断暂停'\n      : meta.throttleMode === 'throttled_quota_guard'\n        ? '已触发 70% 预算自动降频（30分钟/次）'\n        : '正常运行（低频心跳去重）';\n  const qTop = el('div', undefined, qCard, 'row-top');\n  el('span', `今日统计 D1 写入用量：${used} / ${budget} 次（保留充足额度给软件内更新与用户反馈）`, qTop);\n  el('span', modeZh, qTop, meta.throttleMode === 'normal' ? 'badge badge-ok' : 'badge badge-warn');\n  const track = el('div', undefined, qCard, 'bar-track');\n  track.style.marginTop = '8px';\n  const fill = el('div', undefined, track, 'bar-fill');\n  fill.style.width = `${Math.min(100, Math.max(2, Math.round((used / budget) * 100)))}%`;\n\n  if (role === 'admin') {\n    const form = el('form', undefined, qCard, 'form-grid');\n    const l1 = el('label', '云端匿名统计接收开关', form);\n    const selEn = el('select', undefined, l1);\n    el('option', '开启接收（默认）', selEn).value = 'true';\n    el('option', '暂停接收一切统计上报', selEn).value = 'false';\n    selEn.value = String(meta.telemetryEnabled !== false);\n\n    const l2 = el('label', '客户端心跳上报周期（秒，300~7200）', form);\n    const inpSec = el('input', undefined, l2);\n    inpSec.type = 'number'; inpSec.min = '300'; inpSec.max = '7200';\n    inpSec.value = String(meta.baseIntervalSec || 600);\n\n    const l3 = el('label', '每日统计 D1 写入预算上限（1000~90000）', form);\n    const inpBudget = el('input', undefined, l3);\n    inpBudget.type = 'number'; inpBudget.min = '1000'; inpBudget.max = '90000';\n    inpBudget.value = String(budget);\n\n    const btnSave = el('button', '保存统计保护配置', form, 'btn-primary span-full');\n    btnSave.type = 'submit';\n    form.onsubmit = guarded(async () => {\n      await api('telemetry/config', {\n        method: 'PATCH',\n        body: JSON.stringify({\n          telemetryEnabled: selEn.value === 'true',\n          intervalSec: Number(inpSec.value),\n          dailyWriteBudget: Number(inpBudget.value),\n        }),\n      });\n      showMessage('已更新云端统计保护与心跳降频配置');\n      await loadTelemetryOnly(true);\n    });\n  }\n}\n\nfunction renderNodeCard(parent, nodeInfo) {\n  const card = el('div', undefined, parent, 'card');\n  const top = el('div', undefined, card, 'row-top');\n  el('strong', nodeInfo.label || '下载节点', top);\n  const badge = el('span', nodeInfo.stateLabel || '待配置', top, nodeBadgeClass(nodeInfo.stateCode));\n  if (nodeInfo.versionName) {\n    el('p', `关联版本：v${nodeInfo.versionName}（${CHANNEL_ZH[nodeInfo.channel] || nodeInfo.channel}）`, card, 'muted');\n  }\n  const metrics = nodeInfo.lastCheckedAt\n    ? `HTTP ${nodeInfo.httpStatus || '-'} · 耗时 ${nodeInfo.latencyMs || 0} ms · 文件大小 ${fmtBytes(nodeInfo.sizeBytes)} · SHA-256 ${nodeInfo.sha256Verified ? '完整校验通过' : 'Range 字节流校验'}`\n    : '尚未产生探测指标';\n  el('p', metrics, card, 'muted');\n  el('p', `检测说明：${nodeInfo.reason || '-'}`, card);\n  el('p', `最近检测：${fmtTime(nodeInfo.lastCheckedAt)}`, card, 'muted');\n  return { card, badge };\n}\n\nasync function triggerProbeAllNodes(triggerBtn) {\n  if (triggerBtn) {\n    triggerBtn.disabled = true;\n    triggerBtn.textContent = '检测中…';\n  }\n  try {\n    showMessage('正在实时检测 CNB 与 GitHub 下载节点并同步官方下载计数…');\n    await api('nodes/probe-all', { method: 'POST', body: '{}' });\n    await loadAll();\n    showMessage('下载节点实时检测与官方下载计数同步已完成！');\n  } finally {\n    if (triggerBtn) {\n      triggerBtn.disabled = false;\n      triggerBtn.textContent = '立即检测全部下载节点';\n    }\n  }\n}\n\nfunction renderOverview(ov) {\n  latestOverview = ov;\n  const statsBox = $('stats');\n  statsBox.replaceChildren();\n  const fb = ov.feedbackStats || {};\n  const stable = ov.stableRelease;\n  const testingRel = ov.testingRelease;\n  const cand = ov.candidateRelease;\n  const ns = ov.nodeSummary || {};\n\n  // 第三区域内部：用户反馈紧凑 4 卡\n  const fbKpis = [\n    ['待处理反馈', fb.pendingFeedback ?? 0, `今日新增 ${fb.today ?? 0} 条`],\n    ['待修复问题', fb.pendingIssues ?? 0, `高优先级 ${fb.highPriority ?? 0} 项`],\n    ['已解决问题', fb.resolvedIssues ?? 0, '关联版本已修复归档'],\n    ['累计接收反馈', fb.lifetime ?? 0, `当前保留期内 ${fb.total ?? 0} 条`],\n  ];\n  for (const [label, val, sub] of fbKpis) {\n    const c = el('div', undefined, statsBox, 'sub-card kpi-card');\n    el('span', label, c, 'muted');\n    el('strong', val, c);\n    el('span', sub, c, 'kpi-sub');\n  }\n\n  // 第四区域：版本发布及服务状态\n  const relZone = $('overview-releases');\n  relZone.replaceChildren();\n  const zHead = el('div', undefined, relZone, 'zone-header');\n  const zTitleWrap = el('div', undefined, zHead);\n  el('h2', '版本发布及服务状态', zTitleWrap, 'zone-title');\n  el('p', '严格区分线上正式版、内部测试版与待发候选版；下载节点每 30 分钟自动巡检并支持手动即时检测。', zTitleWrap, 'muted');\n  if (role === 'admin') {\n    const probeBtn = el('button', '立即检测全部下载节点', zHead, 'btn-secondary compact-btn');\n    probeBtn.type = 'button';\n    probeBtn.onclick = guarded(() => triggerProbeAllNodes(probeBtn));\n  }\n\n  // 4.1 正式版 / 测试版 / 候选版 三卡清晰并列（彻底消除测试版被显示为候选版英文状态的混淆）\n  const verGrid = el('div', undefined, relZone, 'triple-grid');\n  const stCard = el('div', undefined, verGrid, 'card');\n  const stTop = el('div', undefined, stCard, 'row-top');\n  el('span', '当前正式版本', stTop, 'muted');\n  el('span', stable ? formatReleaseStatusZh(stable) : '待发布', stTop, stable ? 'badge badge-ok' : 'badge');\n  el('strong', stable ? `v${stable.version_name} (Build ${stable.version_code})` : '暂无正式版记录', stCard).style.fontSize = '19px';\n  el('p', stable ? `发布时间：${fmtTime(stable.published_at)} · Commit ${stable.git_commit || '-'}` : '正式稳定通道尚未发布版本', stCard, 'muted');\n\n  const tsCard = el('div', undefined, verGrid, 'card');\n  const tsTop = el('div', undefined, tsCard, 'row-top');\n  el('span', '当前测试版本', tsTop, 'muted');\n  el('span', testingRel ? formatReleaseStatusZh(testingRel) : '暂无记录', tsTop, testingRel ? 'badge' : 'badge');\n  el('strong', testingRel ? `v${testingRel.version_name} (Build ${testingRel.version_code})` : '暂无测试版记录', tsCard).style.fontSize = '19px';\n  el('p', testingRel ? `发布时间：${fmtTime(testingRel.published_at)} · 仅测试通道可见` : '内部测试验证通道暂无已发布记录', tsCard, 'muted');\n\n  const cdCard = el('div', undefined, verGrid, 'card');\n  const cdTop = el('div', undefined, cdCard, 'row-top');\n  el('span', '待发候选版本', cdTop, 'muted');\n  el('span', cand ? formatReleaseStatusZh(cand) : '无待审候选', cdTop, cand ? 'badge badge-warn' : 'badge');\n  el('strong', cand ? `v${cand.version_name} (${CHANNEL_ZH[cand.channel] || cand.channel})` : '当前无待发候选', cdCard).style.fontSize = '19px';\n  el('p', cand ? `更新方式：${cand.force_update ? '强制更新' : '可选更新'} · 更新于 ${fmtTime(cand.updated_at)}` : '新构建上传候选后将在此进入待校验/待审核流程', cdCard, 'muted');\n\n  // 4.2 下载节点双卡（CNB 国内主节点 + GitHub 备用节点）\n  const nodeGrid = el('div', undefined, relZone, 'split-grid');\n  const cnbSummary = ns.cnbPrimary || { label: 'CNB 国内主节点', stateCode: 'unconfigured', stateLabel: '待配置', reason: '尚未配置下载节点' };\n  const ghSummary = ns.githubBackup || { label: 'GitHub 备用节点', stateCode: 'unconfigured', stateLabel: '待配置', reason: '尚未配置下载节点' };\n  renderNodeCard(nodeGrid, cnbSummary);\n  renderNodeCard(nodeGrid, ghSummary);\n  if (ns.probeNote) {\n    el('p', ns.probeNote, relZone, 'muted');\n  }\n\n  // 4.3 更新策略与最近发布动作双栏\n  const bottomSplit = el('div', undefined, relZone, 'split-grid');\n  const polCard = el('div', undefined, bottomSplit, 'card');\n  el('h2', '当前生效更新策略与强制更新状态', polCard);\n  if (!ov.policies || !ov.policies.length) {\n    el('p', '暂无已签发的线上更新策略（默认未启用更新推送）。', polCard, 'muted');\n  } else {\n    for (const p of ov.policies) {\n      const item = el('div', undefined, polCard, 'row-item');\n      const top = el('div', undefined, item, 'row-top');\n      el('strong', `${CHANNEL_ZH[p.channel] || p.channel} · 策略序列号 #${p.policyRevision}`, top);\n      const isForce = p.updateEnabled && p.latestVersionCode <= p.minSupportedVersionCode;\n      const badgeLabel = p.updateEnabled\n        ? (isForce ? '强制更新生效中' : '可选更新生效中')\n        : (POLICY_ACTION_ZH[p.policyAction] || '已暂停推送');\n      el('span', badgeLabel, top, p.updateEnabled ? (isForce ? 'badge badge-warn' : 'badge badge-ok') : 'badge');\n      el('p', `最新版本 v${p.latestVersionName} (${p.latestVersionCode}) · 最低允许版本 ${p.minSupportedVersionCode} · 更新于 ${fmtTime(p.updatedAt)}`, item, 'muted');\n    }\n  }\n\n  const auditCard = el('div', undefined, bottomSplit, 'card');\n  el('h2', '最近版本发布记录与服务健康', auditCard);\n  el('p', `云端反馈上传：${ov.serviceHealth?.uploadsEnabled ? '正常开启' : '已暂停'} · 私有 R2 日志占用：${fmtBytes(ov.serviceHealth?.r2UsedBytes || 0)} / ${fmtBytes(ov.serviceHealth?.r2LimitBytes || 268435456)} · 独立发布签名：${ov.serviceHealth?.remotePublishReady ? '已就绪' : '未配置'}`, auditCard, 'muted');\n  if (ov.recentAudits?.length) {\n    for (const a of ov.recentAudits.slice(0, 5)) {\n      const r = el('div', undefined, auditCard, 'row-item');\n      const top = el('div', undefined, r, 'row-top');\n      el('strong', `[${CHANNEL_ZH[a.channel] || a.channel}] ${AUDIT_ACTION_ZH[a.action] || a.action}${a.version_name ? ' · v' + a.version_name : ''}`, top);\n      el('span', a.result === 'ok' ? '成功' : '失败', top, a.result === 'ok' ? 'badge badge-ok' : 'badge badge-danger');\n      el('p', fmtTime(a.at) + (a.policy_revision ? ` · 策略序列号 #${a.policy_revision}` : ''), r, 'muted');\n    }\n  } else {\n    el('p', '暂无发布操作记录。', auditCard, 'muted');\n  }\n\n  // 版本发布页顶部基线摘要\n  const pubSum = $('publish-summary');\n  pubSum.replaceChildren();\n  const sCard = el('div', undefined, pubSum, 'card');\n  el('h2', '线上正式版本基线', sCard);\n  el('p', stable ? `当前正式版：v${stable.version_name} (Build ${stable.version_code}) · 状态：${formatReleaseStatusZh(stable)} · 发布于 ${fmtTime(stable.published_at)}` : '当前尚未发布正式线上更新版本。', sCard);\n  const permCard = el('div', undefined, pubSum, 'card');\n  el('h2', '远程发布安全签名状态', permCard);\n  el('p', ov.serviceHealth?.remotePublishReady ? '云端独立策略签名服务已就绪：审核通过后可通过电脑或手机远程确认正式发布、暂停推送或紧急解除强制更新。' : '当前未配置云端独立签名密钥：仅开放远程查看与审核，正式发布暂不可用。', permCard, ov.serviceHealth?.remotePublishReady ? '' : 'muted');\n\n  // 服务状态与免费额度页\n  const hBox = $('health-cards');\n  hBox.replaceChildren();\n  const h1 = el('div', undefined, hBox, 'card');\n  el('h2', 'Cloudflare Worker / D1 / 私有 R2 状态', h1);\n  el('p', '反馈接收总开关：' + (ov.serviceHealth?.uploadsEnabled ? '正常运行中' : '已暂停'), h1);\n  el('p', '私有 R2 诊断日志占用：' + fmtBytes(ov.serviceHealth?.r2UsedBytes || 0) + ' / 配额上限 ' + fmtBytes(ov.serviceHealth?.r2LimitBytes || 268435456), h1);\n  el('p', '零新增固定成本约束：完全运行于 Cloudflare 免费计划、CNB 公开仓库与 GitHub 仓库，未绑定任何付费资源。', h1, 'muted');\n  const h2 = el('div', undefined, hBox, 'card');\n  el('h2', 'CNB 与 GitHub 发布节点入口', h2);\n  el('p', 'CNB 国内主发布仓：https://cnb.cool/tingyu-2026/releases', h2);\n  el('p', 'GitHub 源码与备用发布仓：https://github.com/huleixin/folia-rear-lyrics', h2);\n  el('p', '自动巡检机制：Worker 每 30 分钟执行一次轻量字节流探活并同步官方下载统计，拒绝伪造不存在的账单或下载计数。', h2, 'muted');\n\n  // 更新策略页\n  const polList = $('policy-cards');\n  polList.replaceChildren();\n  for (const ch of ['stable', 'testing']) {\n    const found = (ov.policies || []).find(x => x.channel === ch);\n    const card = el('div', undefined, polList, 'card');\n    el('h2', `${CHANNEL_ZH[ch]} 当前生效策略`, card);\n    if (!found) {\n      el('p', '当前渠道暂无已签发策略记录。', card, 'muted');\n    } else {\n      el('p', `策略序列号：#${found.policyRevision}  |  当前动作：${POLICY_ACTION_ZH[found.policyAction] || found.policyAction}  |  推送开启：${found.updateEnabled ? '是' : '否'}`, card);\n      el('p', `最新版本：v${found.latestVersionName} (${found.latestVersionCode})  |  最低允许使用版本：${found.minSupportedVersionCode}`, card);\n      el('p', '受强制更新影响范围：' + (found.updateEnabled && found.minSupportedVersionCode > 1 ? `versionCode < ${found.minSupportedVersionCode} 的旧版客户端` : '无（当前不拦截任何旧版本）'), card, 'muted');\n      el('pre', JSON.stringify(found.nodeSync || {}, null, 2), card);\n    }\n  }\n\n  // 下载节点专页\n  const nsCards = $('nodes-summary-cards');\n  nsCards.replaceChildren();\n  renderNodeCard(nsCards, cnbSummary);\n  renderNodeCard(nsCards, ghSummary);\n\n  const nBox = $('nodes-list');\n  nBox.replaceChildren();\n  if (!ov.nodes?.length) {\n    el('p', '暂无节点历史检测记录。可点击右上角「立即检测全部活跃节点」执行探测。', nBox, 'muted');\n  } else {\n    for (const n of ov.nodes) {\n      const row = el('div', undefined, nBox, 'row-item');\n      const top = el('div', undefined, row, 'row-top');\n      el('strong', `${n.label}（${n.release_id}）`, top);\n      const stateLabel = !n.last_checked_at ? '检测中' : !n.accessible ? '异常' : (Date.now() - n.last_checked_at > 7200_000 ? '数据过期' : '正常');\n      el('span', `${stateLabel} · HTTP ${n.http_status || 0} · ${n.latency_ms || 0}ms`, top, n.accessible ? 'badge badge-ok' : 'badge badge-danger');\n      el('p', n.url, row, 'muted');\n      el('p', `核验大小：${fmtBytes(n.verified_size_bytes)} · SHA-256 完整核验：${n.integrity_ok ? '已通过' : 'Range 字节探活'} · 说明：${n.reason_zh || n.detail} · 检测时间：${fmtTime(n.last_checked_at)}`, row, 'muted');\n    }\n  }\n}\n\n$('btn-probe-all-nodes').onclick = guarded(function () {\n  return triggerProbeAllNodes($('btn-probe-all-nodes'));\n});\n$('btn-sync-downloads').onclick = guarded(async () => {\n  const btn = $('btn-sync-downloads');\n  btn.disabled = true;\n  try {\n    showMessage('正在从官方 Release 接口同步各版本 APK 下载次数…');\n    await api('downloads/sync', { method: 'POST', body: '{}' });\n    await loadTelemetryOnly(true);\n    showMessage('官方下载次数与每日快照已同步更新！');\n  } finally {\n    btn.disabled = false;\n  }\n});\n\nfunction renderReleases(items) {\n  latestReleases = items || [];\n  const filterCh = $('release-channel-filter').value;\n  const list = $('releases-list');\n  list.replaceChildren();\n  const filtered = filterCh ? latestReleases.filter(r => r.channel === filterCh) : latestReleases;\n  if (!filtered.length) {\n    el('p', '暂无版本记录。', list, 'muted');\n  }\n  for (const r of filtered) {\n    const card = el('div', undefined, list, 'row-item');\n    const top = el('div', undefined, card, 'row-top');\n    el('strong', `[${CHANNEL_ZH[r.channel] || r.channel}] v${r.version_name} (Build ${r.version_code})`, top);\n    el('span', `${formatReleaseStatusZh(r)} · ${r.force_update ? '强制更新' : '可选更新'}`, top, r.status === 'published' ? 'badge badge-ok' : 'badge');\n    el('p', `大小：${fmtBytes(r.apk_size_bytes)} · 最低允许版本：${r.min_supported_version_code} · Commit：${r.git_commit || '未记录'} · SHA-256：${r.sha256.slice(0, 16)}…`, card, 'muted');\n    el('p', r.release_notes || '无更新公告', card);\n    if (role === 'admin') {\n      const acts = el('div', undefined, card, 'action-row');\n      const probeBtn = el('button', '实时探测该版本节点', acts, 'btn-secondary compact-btn');\n      probeBtn.type = 'button';\n      probeBtn.onclick = guarded(async () => {\n        probeBtn.disabled = true;\n        try {\n          const res = await api('nodes/probe', { method: 'POST', body: JSON.stringify({ releaseId: r.id }) });\n          showMessage('节点探测完成：' + res.items.map(i => i.label + '=' + (i.accessible ? `正常 (${i.latencyMs}ms)` : i.detail)).join('，'));\n          await loadAll();\n        } finally {\n          probeBtn.disabled = false;\n        }\n      });\n      if (r.status !== 'published' && r.status !== 'withdrawn') {\n        const testOkBtn = el('button', '标记真机测试通过', acts, 'btn-secondary compact-btn');\n        testOkBtn.type = 'button';\n        testOkBtn.onclick = guarded(async () => {\n          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'mark_tested' }) });\n          showMessage('已标记 v' + r.version_name + ' 测试通过');\n          await loadAll();\n        });\n        const approveBtn = el('button', '审核确认候选版本', acts, 'btn-primary compact-btn');\n        approveBtn.type = 'button';\n        approveBtn.onclick = guarded(async () => {\n          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'approve' }) });\n          showMessage('已完成审核并绑定 APK SHA-256 摘要，现在可在「版本发布」面板确认正式发布。');\n          await loadAll();\n        });\n        const withdrawBtn = el('button', '撤回候选', acts, 'btn-danger compact-btn');\n        withdrawBtn.type = 'button';\n        withdrawBtn.onclick = guarded(async () => {\n          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'withdraw' }) });\n          showMessage('已撤回候选版本 ' + r.id);\n          await loadAll();\n        });\n      }\n    }\n  }\n\n  const wb = $('approval-workbench');\n  wb.replaceChildren();\n  const candidates = latestReleases.filter(r => r.status !== 'published' && r.status !== 'withdrawn');\n  for (const c of candidates) {\n    const card = el('div', undefined, wb, 'card');\n    el('h2', `待发布候选：[${CHANNEL_ZH[c.channel] || c.channel}] v${c.version_name} (${c.version_code}) · 当前状态：${formatReleaseStatusZh(c)}`, card);\n    const affectedText = c.force_update\n      ? `强制更新影响范围：所有 versionCode < ${c.min_supported_version_code} 的旧版客户端将被要求更新`\n      : `可选更新：允许用户稍后提醒（仅 versionCode < ${c.min_supported_version_code} 受最低版本限制）`;\n    el('p', affectedText, card, 'badge badge-warn');\n    el('p', '绑定 SHA-256：' + c.sha256, card, 'muted');\n    el('p', '审批摘要：' + (c.approved_digest || '尚未审核确认（请先点击下方「1. 审核确认候选」绑定当前参数与安装包）'), card, 'muted');\n    el('pre', c.release_notes, card);\n\n    if (role === 'admin') {\n      const row = el('div', undefined, card, 'form-grid');\n      const secLabel = el('label', '独立发布确认密钥', row, 'span-full');\n      const secInput = el('input', undefined, secLabel);\n      secInput.type = 'password';\n      secInput.autocomplete = 'off';\n      secInput.placeholder = '审核通过后，输入独立发布确认密钥以签发正式配置';\n\n      const acts = el('div', undefined, card, 'action-row');\n      const btnApprove = el('button', '1. 审核确认候选', acts, 'btn-secondary');\n      btnApprove.type = 'button';\n      btnApprove.onclick = guarded(async () => {\n        await api('releases/' + c.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'approve' }) });\n        showMessage('候选版本已审核锁定摘要！');\n        await loadAll();\n      });\n\n      const btnPublish = el('button', '2. 确认正式发布（签名并推送策略）', acts, 'btn-primary');\n      btnPublish.type = 'button';\n      btnPublish.disabled = c.status !== 'approved' || !remotePublishReady;\n      btnPublish.onclick = guarded(async () => {\n        const secret = secInput.value.trim();\n        if (!secret) throw Error('请输入独立发布确认密钥');\n        secInput.value = '';\n        await api('releases/' + c.id + '/publish', {\n          method: 'POST',\n          headers: { 'X-Publish-Secret': secret },\n          body: JSON.stringify({\n            confirmNonce: randomNonce(),\n            expectedDigest: c.approved_digest,\n            expectedSha256: c.sha256\n          })\n        });\n        showMessage(`正式发布成功：[${CHANNEL_ZH[c.channel] || c.channel}] v${c.version_name} 签名更新策略已生效！`);\n        await loadAll();\n      });\n    }\n  }\n}\n\nfunction renderAuditLogs(items) {\n  const box = $('audit-list');\n  box.replaceChildren();\n  if (!items?.length) {\n    el('p', '暂无发布与策略操作记录。', box, 'muted');\n    return;\n  }\n  for (const a of items) {\n    const row = el('div', undefined, box, 'row-item');\n    const top = el('div', undefined, row, 'row-top');\n    el('strong', `#${a.seq} · [${CHANNEL_ZH[a.channel] || a.channel}] ${AUDIT_ACTION_ZH[a.action] || a.action}${a.version_name ? ` · v${a.version_name} (${a.version_code})` : ''}`, top);\n    const roleZh = a.actor_role === 'admin' ? '管理员' : a.actor_role === 'prepare' ? '发布准备凭据' : a.actor_role;\n    el('span', `${a.result === 'ok' ? '成功' : '失败'} · ${roleZh}${a.policy_revision ? ` · 策略 #${a.policy_revision}` : ''}`, top, a.result === 'ok' ? 'badge badge-ok' : 'badge badge-danger');\n    el('p', '时间：' + fmtTime(a.at) + ' · 链哈希：' + a.entry_hash.slice(0, 20) + '… (前序 ' + a.prev_hash.slice(0, 12) + '…)', row, 'muted');\n  }\n}\n\nfunction renderAiCollaboration() {\n  const box = $('ai-commands');\n  box.replaceChildren();\n  const cmds = [\n    ['打包正式候选安装包（仅本地构建，不上传不推送）', 'node tools/release-cli.mjs build'],\n    ['准备发布候选记录（自动汇总 Git 提交与关联反馈生成更新公告）', 'node tools/release-cli.mjs prepare --channel stable'],\n    ['上传测试通道候选并完整下载回验 SHA-256（不触发正式通道更新）', 'node tools/release-cli.mjs upload --channel testing && node tools/release-cli.mjs verify --channel testing'],\n    ['只读检查线上发布、下载节点与策略状态', 'node tools/release-cli.mjs status'],\n    ['将云端已签发策略镜像同步至 CNB 与 GitHub 静态仓库文件', 'node tools/release-cli.mjs sync-manifests'],\n    ['拉取近期云端用户反馈与脱敏诊断摘要', 'python tools/feedback.py pull --hours 72 && python tools/feedback.py summary'],\n  ];\n  for (const [title, cmd] of cmds) {\n    const item = el('div', undefined, box, 'row-item');\n    const top = el('div', undefined, item, 'row-top');\n    el('strong', title, top);\n    const copyBtn = el('button', '复制命令', top, 'btn-secondary compact-btn');\n    copyBtn.type = 'button';\n    copyBtn.onclick = guarded(async () => {\n      await navigator.clipboard.writeText(cmd);\n      showMessage('已复制命令：' + cmd);\n    });\n    el('pre', cmd, item);\n  }\n}\n\nasync function showFeedbackDetail(id) {\n  const r = await api('feedback/' + id);\n  const body = $('detailbody');\n  body.replaceChildren();\n  $('detail-title').textContent = '反馈详情 · ' + r.id;\n  el('p', (TYPES[r.category] || r.category) + ' · ' + (STATUSES[r.status] || r.status) + ' · 版本 ' + r.version + ' (' + r.version_code + ') · 设备 ' + r.model + ' / Android ' + r.os, body, 'muted');\n  el('p', r.description, body);\n  if (r.steps) {\n    el('h3', '复现步骤', body);\n    el('p', r.steps, body);\n  }\n  el('h3', '环境元数据', body);\n  el('pre', JSON.stringify(JSON.parse(r.metadata || '{}'), null, 2), body);\n  el('p', '提交源码：' + (r.git_commit || '-') + ' · 修复源码：' + (r.fix_commit || '-'), body, 'muted');\n  if (r.fix_note) el('p', '修复备注：' + r.fix_note, body);\n\n  if (r.history?.length) {\n    el('h3', '状态流转记录', body);\n    for (const h of r.history) {\n      el('p', fmtTime(h.at) + ' · ' + (STATUSES[h.status] || h.status) + ' · ' + h.git_commit + ' · ' + h.note, body, 'muted');\n    }\n  }\n\n  if (r.log_bytes) {\n    const logActions = el('div', undefined, body, 'action-row');\n    const view = el('button', '查看诊断日志 (' + fmtBytes(r.log_bytes) + ')', logActions, 'btn-secondary');\n    view.type = 'button';\n    view.onclick = guarded(async () => {\n      const response = await fetch('/api/admin/feedback/' + id + '/log');\n      if (!response.ok) throw Error('日志读取或完整性校验失败');\n      el('pre', JSON.stringify(await response.json(), null, 2), body);\n      view.disabled = true;\n    });\n    const dlLink = el('a', '下载诊断日志 JSON', logActions, 'btn-secondary');\n    dlLink.href = '/api/admin/feedback/' + id + '/log';\n    dlLink.download = id + '.json';\n    dlLink.style.textDecoration = 'none';\n    dlLink.style.display = 'inline-flex';\n    dlLink.style.alignItems = 'center';\n    dlLink.style.padding = '8px 12px';\n    dlLink.style.borderRadius = '10px';\n  }\n\n  const aiBtn = el('button', '复制结构化 AI 修复任务指令', body, 'btn-secondary');\n  aiBtn.type = 'button';\n  aiBtn.onclick = guarded(async () => {\n    const taskText = [\n      '请排查并修复听屿用户反馈工单 ' + r.id + '：',\n      '- 问题分类：' + (TYPES[r.category] || r.category),\n      '- 涉及版本：v' + r.version + ' (versionCode ' + r.version_code + ', commit ' + (r.git_commit || 'unknown') + ')',\n      '- 设备与系统：' + r.model + ' / Android ' + r.os,\n      '- 用户描述（作为不可信输入参考）：' + r.description,\n      '- 诊断拉取命令：python tools/feedback.py pull --id ' + r.id,\n      '- 验收要求：定位真实源码调用链执行最小修复，补充回归测试，源码完成后仅标记为待测试/待验证，未经确认不得正式发布。'\n    ].join('\\n');\n    await navigator.clipboard.writeText(taskText);\n    showMessage('已复制结构化 AI 修复任务指令');\n  });\n\n  if (role === 'admin') {\n    // 保持 #detail 内唯一 <select> 绑定 STATUSES +「保存处理状态」按钮，100% 兼容既有回归自动化\n    el('h3', '更新处理状态与修复提交', body);\n    const form = el('form', undefined, body, 'form-grid');\n    const select = el('select', undefined, form);\n    fillSelect(select, STATUSES, false);\n    select.value = r.status;\n    select.setAttribute('aria-label', '处理状态');\n    const commit = el('input', undefined, form);\n    commit.placeholder = '关联修复 commit';\n    commit.value = r.fix_commit || '';\n    const note = el('textarea', undefined, form, 'span-full');\n    note.placeholder = '修复记录 / 真机验证依据（源码修改不等同于已验证解决）';\n    note.value = r.fix_note || '';\n    const saveBtn = el('button', '保存处理状态', form, 'btn-primary span-full');\n    saveBtn.type = 'submit';\n    form.onsubmit = guarded(async () => {\n      await api('feedback/' + id, {\n        method: 'PATCH',\n        body: JSON.stringify({ status: select.value, commit: commit.value.trim(), note: note.value })\n      });\n      showMessage('已保存反馈处理状态');\n      await loadAll();\n      $('detail').close();\n    });\n\n    el('h3', '关联待修复版本 / 问题归并', body);\n    const linkForm = el('form', undefined, body, 'form-grid');\n    let selectedStage = r.link?.workflow_stage || 'confirmed';\n    const stageRow = el('div', undefined, linkForm, 'action-row span-full');\n    const stageButtons = [];\n    for (const [stageKey, stageLabel] of Object.entries(STAGES)) {\n      const chip = el('button', stageLabel, stageRow, stageKey === selectedStage ? 'btn-primary' : 'btn-secondary');\n      chip.type = 'button';\n      chip.onclick = () => {\n        selectedStage = stageKey;\n        for (const [bKey, bEl] of stageButtons) {\n          bEl.className = bKey === selectedStage ? 'btn-primary' : 'btn-secondary';\n        }\n      };\n      stageButtons.push([stageKey, chip]);\n    }\n    const targetInput = el('input', undefined, linkForm);\n    targetInput.placeholder = '计划修复版本（如 1.5.82）';\n    targetInput.value = r.link?.target_version || '';\n    const fixedInput = el('input', undefined, linkForm);\n    fixedInput.placeholder = '实际已修复版本';\n    fixedInput.value = r.link?.fixed_version || '';\n    const mergeInput = el('input', undefined, linkForm);\n    mergeInput.placeholder = '合并至目标 Issue ID（可选）';\n    mergeInput.value = r.link?.merged_issue_id || '';\n    const linkBtn = el('button', '保存版本关联', linkForm, 'btn-secondary span-full');\n    linkBtn.type = 'submit';\n    linkForm.onsubmit = guarded(async () => {\n      await api('feedback/' + id + '/link', {\n        method: 'PATCH',\n        body: JSON.stringify({\n          workflowStage: selectedStage,\n          targetVersion: targetInput.value.trim(),\n          fixedVersion: fixedInput.value.trim(),\n          mergedIssueId: mergeInput.value.trim()\n        })\n      });\n      showMessage('已更新反馈与版本关联关系');\n      await loadAll();\n    });\n  }\n  $('detail').showModal();\n}\n\nfunction buildTelemetryUrl(fresh = false) {\n  const p = new URLSearchParams({ range: trendRange });\n  if (trendRange === 'custom') {\n    if (customSince) p.set('since', customSince);\n    if (customUntil) p.set('until', customUntil);\n  }\n  if (fresh) p.set('fresh', '1');\n  return 'telemetry/summary?' + p.toString();\n}\n\nasync function loadTelemetryOnly(fresh = false) {\n  const tel = await api(buildTelemetryUrl(fresh));\n  renderTelemetrySections(tel);\n}\n\nasync function loadAll(append = false) {\n  const [s, f, i, ov, rels, audits, tel] = await Promise.all([\n    api('stats'),\n    api('feedback?' + query + (append && cursor ? '&cursor=' + encodeURIComponent(cursor) : '')),\n    api('issues?' + query),\n    api('overview'),\n    api('releases'),\n    api('audit?limit=40'),\n    api(buildTelemetryUrl(false)),\n  ]);\n\n  renderTelemetrySections(tel);\n  renderOverview(ov);\n  renderReleases(rels.items || []);\n  renderAuditLogs(audits.items || []);\n  renderAiCollaboration();\n\n  const distBox = $('distributions');\n  distBox.replaceChildren();\n  for (const [key, rows] of Object.entries(s.distributions || {})) {\n    const box = el('div', undefined, distBox, 'card');\n    el('h2', DIST_KEY_ZH[key] || ('维度：' + key), box);\n    if (!rows.length) el('p', '暂无记录', box, 'muted');\n    for (const r of rows) {\n      const lbl = key === 'categories' ? (TYPES[r.label] || r.label) : key === 'statuses' ? (STATUSES[r.label] || r.label) : r.label;\n      el('p', lbl + ' · ' + r.count + ' 条', box);\n    }\n  }\n\n  if (!append) {\n    $('feedback').replaceChildren();\n    $('logs-list').replaceChildren();\n  }\n  if (!append && !f.items.length) {\n    el('p', '暂无匹配的反馈记录。', $('feedback'), 'muted');\n  }\n  for (const r of f.items) {\n    const card = el('article', undefined, $('feedback'), 'row-item');\n    const top = el('div', undefined, card, 'row-top');\n    el('strong', (TYPES[r.category] || r.category) + ' · ' + (STATUSES[r.status] || r.status) + (r.workflow_stage ? (' · ' + (STAGES[r.workflow_stage] || r.workflow_stage)) : ''), top);\n    if (r.target_version || r.fixed_version) {\n      el('span', (r.fixed_version ? ('已修复于 v' + r.fixed_version) : ('待修复 v' + r.target_version)), top, 'badge');\n    }\n    el('p', r.description, card);\n    el('p', 'v' + r.version + ' / ' + r.model + ' / Android ' + r.os + ' · ' + fmtTime(r.created_at) + (r.log_bytes ? (' · 诊断日志 ' + fmtBytes(r.log_bytes)) : ''), card, 'muted');\n    const b = el('button', r.id, card, 'btn-secondary compact-btn');\n    b.type = 'button';\n    b.onclick = guarded(() => showFeedbackDetail(r.id));\n\n    if (r.log_bytes > 0) {\n      const lcard = el('article', undefined, $('logs-list'), 'row-item');\n      const ltop = el('div', undefined, lcard, 'row-top');\n      el('strong', r.id + ' · ' + (TYPES[r.category] || r.category) + ' (' + fmtBytes(r.log_bytes) + ')', ltop);\n      const lb = el('button', '打开日志详情', ltop, 'btn-secondary compact-btn');\n      lb.type = 'button';\n      lb.onclick = guarded(() => showFeedbackDetail(r.id));\n      el('p', '版本 v' + r.version + ' · 设备 ' + r.model + ' · ' + r.description, lcard, 'muted');\n    }\n  }\n  if (!$('logs-list').children.length) {\n    el('p', '当前筛选范围内暂无附带诊断日志的记录。', $('logs-list'), 'muted');\n  }\n  cursor = f.nextCursor;\n  $('more').hidden = !cursor;\n\n  latestIssues = i.items || [];\n  const issBox = $('issues');\n  issBox.replaceChildren();\n  if (!latestIssues.length) {\n    el('p', '暂无聚合问题记录。', issBox, 'muted');\n  }\n  for (const r of latestIssues) {\n    const card = el('article', undefined, issBox, 'row-item');\n    const top = el('div', undefined, card, 'row-top');\n    let feature = '';\n    try { feature = JSON.parse(r.example_metadata || '{}').feature || ''; } catch {}\n    el('strong', (r.note_title || ((TYPES[r.category] || r.category) + (feature ? ' · ' + feature : ''))) + ' · ' + r.feedback_count + ' 条反馈', top);\n    el('span', (r.workflow_stage ? (STAGES[r.workflow_stage] || r.workflow_stage) : ('待处理 ' + r.pending + ' 条')) + (r.target_version ? (' · 目标 v' + r.target_version) : ''), top, 'badge');\n    el('p', '涉及版本：' + r.versions + ' · 环境组合数：' + r.environment_count + ' · 最近出现：' + fmtTime(r.last_seen), card, 'muted');\n    if (r.sample_description) el('p', '代表性描述：' + r.sample_description, card);\n    const acts = el('div', undefined, card, 'action-row');\n    const copyCmd = el('button', '复制 AI 排查修复任务', acts, 'btn-secondary compact-btn');\n    copyCmd.type = 'button';\n    copyCmd.onclick = guarded(async () => {\n      await navigator.clipboard.writeText(\n        '检查听屿聚合问题 ' + r.issue_id + '（涉及版本 ' + r.versions + '，共 ' + r.feedback_count + ' 条真实反馈）。先运行 python tools/feedback.py pull --issue ' + r.issue_id + '，仅依据真实栈与调用链执行最小修复并补充回归测试，源码完成后标记为待测试，禁止自动发布正式版。'\n      );\n      showMessage('已复制聚合问题 AI 排查指令');\n    });\n  }\n}\n\n$('candidate-form').onsubmit = guarded(async e => {\n  if (role !== 'admin') throw Error('需要管理员权限');\n  const fd = new FormData(e.target);\n  const cnbUrl = String(fd.get('cnbUrl') || '').trim();\n  const githubUrl = String(fd.get('githubUrl') || '').trim();\n  const downloadUrls = [{ id: 'cnb-primary', label: 'CNB 国内高速主节点', url: cnbUrl, priority: 1 }];\n  if (githubUrl) downloadUrls.push({ id: 'github-backup', label: 'GitHub 备用节点', url: githubUrl, priority: 2 });\n\n  const payload = {\n    channel: String(fd.get('channel') || 'testing'),\n    versionName: String(fd.get('versionName') || '').trim(),\n    versionCode: Number(fd.get('versionCode')),\n    apkSizeBytes: Number(fd.get('apkSizeBytes')),\n    sha256: String(fd.get('sha256') || '').trim().toLowerCase(),\n    gitCommit: String(fd.get('gitCommit') || '').trim(),\n    cnbTag: String(fd.get('cnbTag') || '').trim(),\n    forceUpdate: fd.get('forceUpdate') === 'true',\n    minSupportedVersionCode: Number(fd.get('minSupportedVersionCode')),\n    releaseNotes: String(fd.get('releaseNotes') || ''),\n    downloadUrls,\n  };\n  await api('releases/candidates', { method: 'POST', body: JSON.stringify(payload) });\n  showMessage('候选版本已保存，请前往下方工作台执行节点探测与人工审核确认。');\n  await loadAll();\n});\n\n$('release-channel-filter').onchange = () => renderReleases(latestReleases);\n\n$('btn-pause-channel').onclick = guarded(async () => {\n  const ch = $('policy-ctl-channel').value;\n  const secret = $('policy-ctl-secret').value.trim();\n  if (!secret) throw Error('请输入独立发布确认密钥');\n  $('policy-ctl-secret').value = '';\n  await api('policy/' + ch + '/pause', {\n    method: 'POST',\n    headers: { 'X-Publish-Secret': secret },\n    body: JSON.stringify({ confirmNonce: randomNonce(), reason: $('policy-ctl-reason').value.trim() })\n  });\n  showMessage(`已暂停 [${CHANNEL_ZH[ch] || ch}] 的新版本更新推送。`);\n  await loadAll();\n});\n\n$('btn-unlock-channel').onclick = guarded(async () => {\n  const ch = $('policy-ctl-channel').value;\n  const secret = $('policy-ctl-secret').value.trim();\n  if (!secret) throw Error('请输入独立发布确认密钥');\n  $('policy-ctl-secret').value = '';\n  await api('policy/' + ch + '/unlock', {\n    method: 'POST',\n    headers: { 'X-Publish-Secret': secret },\n    body: JSON.stringify({ confirmNonce: randomNonce(), safeMinVersionCode: 1, reason: $('policy-ctl-reason').value.trim() || '管理员紧急解除强制更新限制' })\n  });\n  showMessage(`已签发紧急解除策略：[${CHANNEL_ZH[ch] || ch}] 所有旧版本客户端重新检查后将立即解除强制更新拦截！`);\n  await loadAll();\n});\n\nasync function makePairing(targetRole) {\n  const res = await api('pairings', { method: 'POST', body: JSON.stringify({ role: targetRole }) });\n  const out = $('pairing-output');\n  out.textContent = '单次 5 分钟安全登录链接（打开即销毁，请勿公开分享）：\\n' + res.url;\n  out.hidden = false;\n  try { await navigator.clipboard.writeText(res.url); showMessage('已生成并复制手机端 5 分钟一次性登录链接'); }\n  catch { showMessage('已生成一次性登录链接'); }\n}\n$('btn-make-admin-pairing').onclick = guarded(() => makePairing('admin'));\n$('btn-make-read-pairing').onclick = guarded(() => makePairing('read'));\n\n$('btn-enable-uploads').onclick = guarded(async () => {\n  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: true }) });\n  showMessage('已开启客户端云端反馈上传。');\n  await loadAll();\n});\n$('btn-disable-uploads').onclick = guarded(async () => {\n  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: false }) });\n  showMessage('已暂停客户端云端反馈上传；既有数据仍可正常浏览。');\n  await loadAll();\n});\n\nasync function enterConsole() {\n  const s = await api('session');\n  role = s.role;\n  remotePublishReady = Boolean(s.remotePublishReady);\n  $('login-wrap').hidden = true;\n  $('dashboard').hidden = false;\n  $('role-badge').textContent = role === 'admin' ? '管理员' : '只读';\n  $('pause').hidden = role !== 'admin';\n  $('btn-probe-all-nodes').hidden = role !== 'admin';\n  $('btn-sync-downloads').hidden = role !== 'admin';\n  switchView('overview');\n  await loadAll();\n}\n\n$('login').onsubmit = guarded(async () => {\n  const token = $('token').value;\n  $('token').value = '';\n  await api('login', { method: 'POST', body: JSON.stringify({ token }) });\n  await enterConsole();\n  showMessage('欢迎进入听屿开发者管理中心');\n});\n\n$('logout').onclick = guarded(async () => {\n  await api('logout', { method: 'POST' });\n  location.reload();\n});\n$('close').onclick = () => $('detail').close();\n$('refresh').onclick = guarded(() => loadAll());\n$('more').onclick = guarded(() => loadAll(true));\n$('filters').onsubmit = guarded(async () => {\n  const p = new URLSearchParams();\n  for (const [k, v] of new FormData($('filters'))) {\n    if (v) p.set(k, ['since', 'until'].includes(k) ? String(new Date(v).getTime()) : v);\n  }\n  query = p.toString();\n  await loadAll();\n});\n$('pause').onclick = guarded(async () => {\n  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: false }) });\n  showMessage('上传已暂停；既有反馈仍可查看。');\n  await loadAll();\n});\n\nif ('serviceWorker' in navigator) {\n  navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin' }).catch(() => {});\n}\n\nconst pairing = new URLSearchParams(location.hash.slice(1)).get('pairing');\nhistory.replaceState(null, '', '/admin');\nif (pairing) {\n  api('login', { method: 'POST', body: JSON.stringify({ pairing }) })\n    .then(enterConsole)\n    .catch(() => showMessage('一次性登录链接已使用或过期，请重新生成。'));\n} else {\n  enterConsole().catch(() => {});\n}\n";
