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
        <button type="button" class="nav-item" data-view="beta">内测管理</button>
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
                <p id="overview-ops-note" class="muted">自 v1.5.83 起匿名使用统计默认开启（支持在设置中随时一键关闭，升级保留选择）；官方下载计数来自公开 Release 附件统计。</p>
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
                <option value="private_beta">私有内测通道 (private_beta)</option>
                  <option value="testing">旧公开测试迁移通道 (testing)</option>
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


        <!-- 7.5 内测管理（私有邀请制内测、一次性邀请码、设备绑定授权与撤销） -->
        <section id="view-beta" class="view-pane" hidden>
          <div class="card">
            <div class="section-head">
              <div>
                <h2>私有内测管理总览</h2>
                <p class="muted">公开内测已永久关闭，不提供无需邀请的公开申请入口。仅持有有效邀请码并经 Keystore 设备公钥绑定的设备可拉取私有内测策略。</p>
              </div>
              <span class="badge badge-ok">公开内测：已关闭</span>
            </div>
            <div id="beta-summary-kpis" class="kpi-grid kpi-grid-4"></div>
          </div>

          <div class="split-grid">
            <div class="card">
              <h2>生成一次性内测邀请码</h2>
              <p class="muted">邀请码明文仅在生成瞬间展示一次，服务端仅保存加盐单向散列，兑换即原子消耗。</p>
              <form id="beta-invite-form" class="form-grid">
                <label>授权身份类型
                  <select name="role" id="beta-invite-role">
                    <option value="tester">普通内测人员授权（默认5分钟有效 / 授权30天）</option>
                    <option value="developer">开发者设备授权（长期有效，直到主动撤销）</option>
                  </select>
                </label>
                <label>设备 / 人员备注
                  <input name="note" id="beta-invite-note" placeholder="如：开发者主力机 / 测试同学A">
                </label>
                <label>邀请码有效期（分钟）
                  <input name="inviteTtlMinutes" id="beta-invite-ttl" type="number" min="1" max="10080" value="5">
                </label>
                <label id="beta-auth-days-wrap">授权有效期（天，0为长期）
                  <input name="authDurationDays" id="beta-invite-days" type="number" min="0" max="3650" value="30">
                </label>
                <button type="submit" class="btn-primary span-full">生成一次性邀请码</button>
              </form>
              <div id="beta-generated-box" class="sub-card" hidden>
                <div class="row-top">
                  <strong>一次性邀请码（请立即复制，刷新后不再显示明文）</strong>
                  <button type="button" id="btn-copy-beta-code" class="btn-secondary compact-btn">一键复制</button>
                </div>
                <p id="beta-generated-code" style="font-size:20px;font-weight:700;letter-spacing:1.5px;margin:8px 0;"></p>
                <p id="beta-generated-meta" class="muted"></p>
              </div>
            </div>

            <div class="card">
              <h2>邀请码记录（仅脱敏展示末 4 位）</h2>
              <p class="muted">支持随时作废尚未兑换的邀请码。</p>
              <div id="beta-invites-list" class="stack-list"></div>
            </div>
          </div>

          <div class="card">
            <div class="section-head">
              <div>
                <h2>内测授权设备管理</h2>
                <p class="muted">支持修改设备备注、调整授权有效期、撤销单个设备及一键批量撤销全部普通内测资格（不影响开发者设备）。</p>
              </div>
              <button type="button" id="btn-revoke-all-testers" class="btn-danger compact-btn">批量撤销普通内测授权</button>
            </div>
            <div id="beta-devices-list" class="stack-list"></div>
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

export const adminScript = "\n// Tingyu Developer Console runtime: textContent + createElementNS SVG only, zero persistent token storage.\nconst $ = id => document.getElementById(id);\nconst SVG_NS = 'http://www.w3.org/2000/svg';\n\nconst TYPES = {\n  playback: '\u64ad\u653e\u5931\u8d25', stutter: '\u64ad\u653e\u5361\u987f', crash: '\u95ea\u9000', lyrics: '\u6b4c\u8bcd\u5f02\u5e38',\n  display: '\u754c\u9762\u5f02\u5e38', rear: '\u80cc\u5c4f\u5f02\u5e38', pad: '\u5e73\u677f\u9002\u914d', local: '\u672c\u5730\u97f3\u4e50', other: '\u5176\u4ed6'\n};\nconst STATUSES = {\n  pending: '\u5f85\u5904\u7406', investigating: '\u6392\u67e5\u4e2d', verification: '\u5f85\u9a8c\u8bc1',\n  fixed: '\u5df2\u4fee\u590d', unreproduced: '\u65e0\u6cd5\u590d\u73b0', closed: '\u5df2\u5173\u95ed'\n};\nconst STAGES = {\n  new: '\u65b0\u53cd\u9988', pending_confirm: '\u5f85\u786e\u8ba4', confirmed: '\u5df2\u786e\u8ba4', fixing: '\u4fee\u590d\u4e2d',\n  pending_test: '\u5f85\u6d4b\u8bd5', tested_ok: '\u6d4b\u8bd5\u901a\u8fc7', published: '\u5df2\u53d1\u5e03',\n  verified_resolved: '\u5df2\u9a8c\u8bc1\u89e3\u51b3', reopened: '\u95ee\u9898\u590d\u73b0'\n};\nconst CHANNEL_ZH = {\n  stable: '\u6b63\u5f0f\u7a33\u5b9a\u901a\u9053',\n  private_beta: '\u79c1\u6709\u5185\u6d4b\u901a\u9053',\n  testing: '\u65e7\u516c\u5f00\u6d4b\u8bd5\u901a\u9053',\n  archive: '\u5386\u53f2\u5f52\u6863\u7248\u672c'\n};\nconst POLICY_ACTION_ZH = {\n  normal: '\u6b63\u5e38\u63a8\u9001',\n  pause: '\u5df2\u6682\u505c\u63a8\u9001',\n  emergency_unlock: '\u7d27\u6025\u89e3\u9664\u5f3a\u5236\u66f4\u65b0'\n};\nconst AUDIT_ACTION_ZH = {\n  prepare_candidate: '\u51c6\u5907\u5019\u9009\u7248\u672c',\n  update_draft: '\u4fee\u6539\u5019\u9009\u914d\u7f6e',\n  mark_tested: '\u6807\u8bb0\u6d4b\u8bd5\u901a\u8fc7',\n  approve_candidate: '\u5ba1\u6838\u9501\u5b9a\u5019\u9009',\n  withdraw: '\u64a4\u56de\u5019\u9009\u7248\u672c',\n  verify_node: '\u68c0\u6d4b\u4e0b\u8f7d\u8282\u70b9',\n  publish_release: '\u7b7e\u53d1\u7248\u672c\u63a8\u9001',\n  pause_updates: '\u6682\u505c\u6e20\u9053\u63a8\u9001',\n  emergency_unlock: '\u7d27\u6025\u89e3\u9664\u5f3a\u5236\u66f4\u65b0',\n  update_policy: '\u8c03\u6574\u66f4\u65b0\u7b56\u7565',\n  sync_static_nodes: '\u540c\u6b65\u9759\u6001\u955c\u50cf\u8282\u70b9',\n  beta_invite_create: '\u751f\u6210\u5185\u6d4b\u9080\u8bf7\u7801',\n  beta_invite_cancel: '\u53d6\u6d88\u5185\u6d4b\u9080\u8bf7\u7801',\n  beta_invite_redeem: '\u5151\u6362\u6fc0\u6d3b\u5185\u6d4b\u8bbe\u5907',\n  beta_device_revoke: '\u64a4\u9500\u5185\u6d4b\u8bbe\u5907\u6388\u6743',\n  beta_batch_revoke_testers: '\u6279\u91cf\u64a4\u9500\u666e\u901a\u5185\u6d4b',\n  beta_device_leave: '\u8bbe\u5907\u4e3b\u52a8\u9000\u51fa\u5185\u6d4b'\n};\nconst DIST_KEY_ZH = {\n  categories: '\u95ee\u9898\u7c7b\u578b\u5206\u5e03',\n  statuses: '\u5904\u7406\u72b6\u6001\u5206\u5e03',\n  versions: '\u53cd\u9988\u6765\u6e90\u7248\u672c',\n  os: 'Android \u7cfb\u7edf\u5206\u5e03',\n  models: '\u53cd\u9988\u8bbe\u5907\u578b\u53f7'\n};\nconst VIEW_TITLES = {\n  overview: '\u6570\u636e\u603b\u89c8', operations: '\u8fd0\u8425\u7edf\u8ba1', feedback: '\u7528\u6237\u53cd\u9988', logs: '\u8bca\u65ad\u65e5\u5fd7', issues: '\u95ee\u9898\u805a\u5408', analytics: '\u7248\u672c\u5206\u6790',\n  releases: '\u7248\u672c\u7ba1\u7406', beta: '\u5185\u6d4b\u7ba1\u7406', publish: '\u7248\u672c\u53d1\u5e03', policy: '\u66f4\u65b0\u7b56\u7565', nodes: '\u4e0b\u8f7d\u8282\u70b9', audit: '\u53d1\u5e03\u8bb0\u5f55',\n  ai: 'AI\u534f\u4f5c', health: '\u670d\u52a1\u72b6\u6001', security: '\u5b89\u5168\u7ba1\u7406', settings: '\u7cfb\u7edf\u8bbe\u7f6e'\n};\nconst MOBILE_GROUPS = {\n  workbench: ['overview', 'operations', 'analytics'],\n  feedback: ['feedback', 'logs', 'issues'],\n  releases: ['releases', 'beta', 'publish', 'policy', 'nodes', 'audit'],\n  system: ['ai', 'health', 'security', 'settings']\n};\n\nlet role = 'read';\nlet remotePublishReady = false;\nlet currentView = 'overview';\nlet cursor = null;\nlet query = '';\nlet trendRange = '7d';\nlet customSince = '';\nlet customUntil = '';\nlet latestOverview = null;\nlet latestTelemetry = null;\nlet latestReleases = [];\nlet latestIssues = [];\nlet latestFeedbackPayload = null;\n\nfunction formatReleaseStatusZh(rel) {\n  if (!rel) return '\u6682\u65e0\u8bb0\u5f55';\n  const s = rel.status;\n  if (s === 'draft') return '\u5f85\u4e0a\u4f20';\n  if (s === 'candidate') return '\u5f85\u6821\u9a8c';\n  if (s === 'testing_passed') return '\u5f85\u5ba1\u6838';\n  if (s === 'approved') return '\u5f85\u53d1\u5e03\uff08\u5df2\u5ba1\u6838\uff09';\n  if (s === 'published') return rel.channel === 'testing' ? '\u6d4b\u8bd5\u7248\u5df2\u53d1\u5e03' : '\u6b63\u5f0f\u7248\u5df2\u53d1\u5e03';\n  if (s === 'paused') return '\u5df2\u6682\u505c';\n  if (s === 'withdrawn') return '\u5df2\u64a4\u56de';\n  if (s === 'failed') return '\u53d1\u5e03\u5931\u8d25';\n  return '\u5f85\u5ba1\u6838';\n}\n\nfunction nodeBadgeClass(stateCode) {\n  if (stateCode === 'healthy') return 'badge badge-ok';\n  if (stateCode === 'abnormal') return 'badge badge-danger';\n  if (stateCode === 'stale') return 'badge badge-warn';\n  return 'badge';\n}\n\nfunction el(tag, text, parent, cls) {\n  const n = document.createElement(tag);\n  if (cls) n.className = cls;\n  if (text !== undefined && text !== null) n.textContent = String(text);\n  if (parent) parent.append(n);\n  return n;\n}\n\nfunction svgEl(tag, attrs = {}, parent = null) {\n  const n = document.createElementNS(SVG_NS, tag);\n  for (const [k, v] of Object.entries(attrs)) {\n    n.setAttribute(k, String(v));\n  }\n  if (parent) parent.append(n);\n  return n;\n}\n\nfunction fillSelect(select, map, includeAll) {\n  select.replaceChildren();\n  if (includeAll) el('option', '\u5168\u90e8', select).value = '';\n  for (const [k, v] of Object.entries(map)) {\n    el('option', v, select).value = k;\n  }\n}\n\nfillSelect(document.querySelector('[name=type]'), TYPES, true);\nfillSelect(document.querySelector('[name=status]'), STATUSES, true);\n\nfunction showMessage(text) {\n  const box = $('message');\n  if (!text) { box.hidden = true; box.textContent = ''; return; }\n  box.textContent = text;\n  box.hidden = false;\n}\n\nfunction guarded(fn) {\n  return async e => {\n    e?.preventDefault();\n    try { await fn(e); } catch (err) { showMessage(err?.message || '\u64cd\u4f5c\u5931\u8d25'); }\n  };\n}\n\nfunction randomNonce() {\n  const arr = new Uint8Array(18);\n  crypto.getRandomValues(arr);\n  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');\n}\n\nfunction fmtBytes(bytes) {\n  if (!bytes || bytes <= 0) return '0 B';\n  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';\n  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';\n  return bytes + ' B';\n}\n\nfunction fmtTime(ms) {\n  if (!ms) return '\u6682\u65e0\u8bb0\u5f55';\n  return new Date(ms).toLocaleString('zh-CN', { hour12: false });\n}\n\nfunction fmtPct(val, emptyText = '\u6682\u65e0\u8db3\u591f\u6570\u636e') {\n  if (val === null || val === undefined || Number.isNaN(Number(val))) return emptyText;\n  return Number(val).toFixed(1) + '%';\n}\n\nasync function api(path, options = {}) {\n  const r = await fetch('/api/admin/' + path, {\n    ...options,\n    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }\n  });\n  if (!r.ok) {\n    let code = '';\n    try { code = (await r.json()).error || ''; } catch {}\n    if (r.status === 401) throw Error('\u767b\u5f55\u5df2\u8fc7\u671f\u6216\u51ed\u636e\u65e0\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55');\n    if (code === 'publish_signing_not_configured') throw Error('\u4e91\u7aef\u5c1a\u672a\u914d\u7f6e\u72ec\u7acb\u53d1\u5e03\u7b7e\u540d\u5bc6\u94a5\uff0c\u8fdc\u7a0b\u6b63\u5f0f\u53d1\u5e03\u6682\u4e0d\u53ef\u7528');\n    if (code === 'publish_secret_invalid') throw Error('\u72ec\u7acb\u53d1\u5e03\u786e\u8ba4\u5bc6\u94a5\u9a8c\u8bc1\u5931\u8d25');\n    if (code === 'candidate_not_approved') throw Error('\u5019\u9009\u7248\u672c\u5c1a\u672a\u5b8c\u6210\u5ba1\u6838\u786e\u8ba4\uff0c\u7981\u6b62\u76f4\u63a5\u53d1\u5e03');\n    if (code === 'approval_digest_mismatch_reapproval_required') throw Error('\u5019\u9009\u5185\u5bb9\u5728\u5ba1\u6838\u540e\u53d1\u751f\u53d8\u66f4\uff0c\u8bf7\u91cd\u65b0\u5ba1\u6838\u786e\u8ba4');\n    if (code === 'download_nodes_unreachable_abort_publish') throw Error('\u8fdc\u7a0b\u5b89\u88c5\u5305\u4e0b\u8f7d\u6821\u9a8c\u672a\u901a\u8fc7\uff0c\u5df2\u81ea\u52a8\u4e2d\u6b62\u6b63\u5f0f\u53d1\u5e03\u4ee5\u4fdd\u62a4\u7ebf\u4e0a\u7528\u6237');\n    throw Error('\u8bf7\u6c42\u5931\u8d25 (' + r.status + (code ? ': ' + code : '') + ')');\n  }\n  return r.json();\n}\n\nfunction switchView(view) {\n  // 'feedback' \u590d\u7528 #view-overview \u4e2d\u7684\u53ef\u7b5b\u9009\u5de5\u5355\u5361\u7247\uff0c\u5176\u4f59\u533a\u57df\u5728 'feedback' \u89c6\u56fe\u4e0b\u81ea\u52a8\u9690\u85cf\n  currentView = view;\n  $('page-title').textContent = VIEW_TITLES[view] || '\u5de5\u4f5c\u53f0';\n  for (const btn of document.querySelectorAll('.nav-item')) {\n    btn.classList.toggle('active', btn.dataset.view === view);\n  }\n  const activePaneId = view === 'feedback' ? 'view-overview' : 'view-' + view;\n  for (const pane of document.querySelectorAll('.view-pane')) {\n    pane.hidden = pane.id !== activePaneId;\n  }\n  const isFeedbackOnly = view === 'feedback';\n  $('overview-zone-ops').hidden = isFeedbackOnly;\n  $('overview-zone-trends').hidden = isFeedbackOnly;\n  $('overview-releases').hidden = isFeedbackOnly;\n  $('stats').hidden = isFeedbackOnly;\n  $('feedback-section-title').textContent = isFeedbackOnly ? '\u5168\u90e8\u7528\u6237\u53cd\u9988\u4e0e\u591a\u7ef4\u7b5b\u9009' : '\u7528\u6237\u53cd\u9988\u6458\u8981\u4e0e\u8fd1\u671f\u53cd\u9988\u9884\u89c8\uff08\u6700\u65b0 3 \u6761\uff09';\n  if (latestFeedbackPayload) renderFeedbackItems(latestFeedbackPayload, false);\n\n  let matchedGroup = 'workbench';\n  for (const [g, list] of Object.entries(MOBILE_GROUPS)) {\n    if (list.includes(view)) { matchedGroup = g; break; }\n  }\n  for (const mbtn of document.querySelectorAll('.mnav-btn')) {\n    mbtn.classList.toggle('active', mbtn.dataset.mgroup === matchedGroup);\n  }\n  const sub = $('mobile-subtabs');\n  sub.replaceChildren();\n  for (const subView of MOBILE_GROUPS[matchedGroup]) {\n    const pill = el('button', VIEW_TITLES[subView], sub, 'subtab-pill' + (subView === view ? ' active' : ''));\n    pill.type = 'button';\n    pill.onclick = () => switchView(subView);\n  }\n}\n\nfor (const btn of document.querySelectorAll('.nav-item')) {\n  btn.onclick = () => switchView(btn.dataset.view);\n}\nfor (const mbtn of document.querySelectorAll('.mnav-btn')) {\n  mbtn.onclick = () => {\n    const list = MOBILE_GROUPS[mbtn.dataset.mgroup] || ['overview'];\n    switchView(list[0]);\n  };\n}\n$('btn-goto-operations').onclick = () => switchView('operations');\n$('btn-goto-issues').onclick = () => switchView('issues');\n$('btn-goto-logs').onclick = () => switchView('logs');\n\n// \u65f6\u95f4\u8303\u56f4\u9009\u62e9\u5668\u8054\u52a8\nfor (const pill of document.querySelectorAll('.range-pill')) {\n  pill.onclick = guarded(async () => {\n    const nextRange = pill.dataset.range;\n    for (const p of document.querySelectorAll('.range-pill')) {\n      p.classList.toggle('active', p === pill);\n    }\n    if (nextRange === 'custom') {\n      $('custom-range-row').hidden = false;\n      return;\n    }\n    $('custom-range-row').hidden = true;\n    trendRange = nextRange;\n    await loadTelemetryOnly();\n  });\n}\n$('btn-apply-range').onclick = guarded(async () => {\n  customSince = $('range-since').value;\n  customUntil = $('range-until').value;\n  if (!customSince || !customUntil) throw Error('\u8bf7\u9009\u62e9\u5b8c\u6574\u7684\u8d77\u59cb\u4e0e\u7ed3\u675f\u65e5\u671f');\n  trendRange = 'custom';\n  await loadTelemetryOnly();\n});\n\n$('theme-mode').onchange = e => {\n  const v = e.target.value;\n  if (v === 'system') delete document.documentElement.dataset.theme;\n  else document.documentElement.dataset.theme = v;\n  try { sessionStorage.setItem('ty_console_theme', v); } catch {}\n};\ntry {\n  const savedTheme = sessionStorage.getItem('ty_console_theme');\n  if (savedTheme === 'light' || savedTheme === 'dark') {\n    $('theme-mode').value = savedTheme;\n    document.documentElement.dataset.theme = savedTheme;\n  }\n} catch {}\n\n$('local-apk-file').onchange = guarded(async e => {\n  const file = e.target.files?.[0];\n  if (!file) return;\n  showMessage('\u6b63\u5728\u6d4f\u89c8\u5668\u672c\u5730\u8ba1\u7b97 APK SHA-256 \u6458\u8981\uff0c\u8bf7\u7a0d\u5019\u2026');\n  const buf = await file.arrayBuffer();\n  const digest = await crypto.subtle.digest('SHA-256', buf);\n  const sha = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');\n  const form = $('candidate-form');\n  form.elements.apkSizeBytes.value = String(file.size);\n  form.elements.sha256.value = sha;\n  const verMatch = /tingyu-([0-9]+\\.[0-9]+\\.[0-9]+)-release\\.apk/i.exec(file.name);\n  if (verMatch && !form.elements.versionName.value) {\n    form.elements.versionName.value = verMatch[1];\n    form.elements.cnbTag.value = 'v' + verMatch[1];\n  }\n  showMessage('\u5df2\u8bfb\u53d6\u672c\u5730 APK\uff1a\u5927\u5c0f ' + fmtBytes(file.size) + '\uff0cSHA-256 \u4e3a ' + sha.slice(0, 16) + '\u2026');\n});\n\nfunction buildLineChartSvg(container, seriesList, emptyText) {\n  const w = 480, h = 156, padL = 34, padR = 14, padT = 14, padB = 26;\n  const innerW = w - padL - padR;\n  const innerH = h - padT - padB;\n  const primary = seriesList[0]?.points || [];\n  if (!primary.length) {\n    el('p', emptyText, container, 'muted');\n    return;\n  }\n  let maxVal = 1;\n  for (const s of seriesList) {\n    for (const pt of s.points) {\n      if (pt.y !== null && pt.y > maxVal) maxVal = pt.y;\n    }\n  }\n  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'svg-chart', role: 'img' }, container);\n  for (let i = 0; i <= 3; i++) {\n    const gy = padT + (innerH * i) / 3;\n    svgEl('line', { x1: padL, y1: gy, x2: w - padR, y2: gy, stroke: 'var(--line)', 'stroke-dasharray': i === 3 ? '' : '3 3', 'stroke-width': 1 }, svg);\n    const tickVal = Math.round(maxVal * (1 - i / 3));\n    const lbl = svgEl('text', { x: padL - 6, y: gy + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 10 }, svg);\n    lbl.textContent = String(tickVal);\n  }\n\n  for (const s of seriesList) {\n    const valid = s.points.map((pt, idx) => ({ ...pt, idx })).filter(pt => pt.y !== null);\n    if (!valid.length) continue;\n    const xAt = idx => primary.length === 1 ? padL + innerW / 2 : padL + (idx / (primary.length - 1)) * innerW;\n    const yAt = val => padT + innerH - (val / maxVal) * innerH;\n\n    if (valid.length >= 2 && s.area) {\n      const areaPts = [\n        `${xAt(valid[0].idx)},${padT + innerH}`,\n        ...valid.map(p => `${xAt(p.idx)},${yAt(p.y)}`),\n        `${xAt(valid[valid.length - 1].idx)},${padT + innerH}`\n      ].join(' ');\n      svgEl('polygon', { points: areaPts, fill: s.color, opacity: '0.12' }, svg);\n    }\n    if (valid.length >= 2) {\n      const linePts = valid.map(p => `${xAt(p.idx)},${yAt(p.y)}`).join(' ');\n      svgEl('polyline', { points: linePts, fill: 'none', stroke: s.color, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);\n    }\n    for (const p of valid) {\n      svgEl('circle', { cx: xAt(p.idx), cy: yAt(p.y), r: 3.4, fill: s.color }, svg);\n    }\n  }\n\n  const labelIdx = primary.length <= 5\n    ? primary.map((_, idx) => idx)\n    : [0, Math.floor((primary.length - 1) / 2), primary.length - 1];\n  for (const idx of [...new Set(labelIdx)]) {\n    const x = primary.length === 1 ? padL + innerW / 2 : padL + (idx / (primary.length - 1)) * innerW;\n    const t = svgEl('text', { x, y: h - 6, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 10 }, svg);\n    t.textContent = String(primary[idx].x || '').slice(5);\n  }\n}\n\nfunction buildDonutChartSvg(container, items) {\n  const wrap = el('div', undefined, container, 'donut-layout');\n  const svg = svgEl('svg', { viewBox: '0 0 120 120', class: 'donut-svg', role: 'img' }, wrap);\n  const cx = 60, cy = 60, r = 42, circ = 2 * Math.PI * r;\n  const palette = ['#385B73', '#2A8562', '#6C8EAD', '#C98A2C', '#7C6A96', '#4E9DA6'];\n  svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'var(--line)', 'stroke-width': 16 }, svg);\n\n  const total = items.reduce((s, x) => s + Number(x.value || 0), 0);\n  const legend = el('div', undefined, wrap, 'stack-list');\n  legend.style.flex = '1';\n  legend.style.gap = '4px';\n\n  if (total <= 0) {\n    const center = svgEl('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, svg);\n    center.textContent = '\u6682\u65e0\u6837\u672c';\n    el('p', '\u7b49\u5f85 v1.5.82 \u53ca\u4ee5\u4e0a\u5ba2\u6237\u7aef\u5f00\u542f\u300c\u533f\u540d\u4f7f\u7528\u7edf\u8ba1\u300d\u540e\u81ea\u52a8\u751f\u6210\u7248\u672c\u5360\u6bd4\u3002', legend, 'muted');\n    return;\n  }\n\n  let offset = 0;\n  items.slice(0, 6).forEach((it, idx) => {\n    const frac = Number(it.value || 0) / total;\n    const dash = frac * circ;\n    const color = palette[idx % palette.length];\n    svgEl('circle', {\n      cx, cy, r,\n      fill: 'none',\n      stroke: color,\n      'stroke-width': 16,\n      'stroke-dasharray': `${dash} ${circ - dash}`,\n      'stroke-dashoffset': String(-offset),\n      transform: `rotate(-90 ${cx} ${cy})`\n    }, svg);\n    offset += dash;\n\n    const row = el('div', undefined, legend, 'muted');\n    const dot = el('span', '', row, 'legend-dot');\n    dot.style.background = color;\n    row.append(document.createTextNode(`${it.label} \u00b7 ${it.value} \u53f0 (${(frac * 100).toFixed(1)}%)`));\n  });\n\n  const centerNum = svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', fill: 'var(--fg)', 'font-size': 14, 'font-weight': '700' }, svg);\n  centerNum.textContent = String(total);\n  const centerSub = svgEl('text', { x: cx, y: cy + 13, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 9.5 }, svg);\n  centerSub.textContent = '30\u65e5\u6d3b\u8dc3\u8bbe\u5907';\n}\n\nfunction renderHorizontalBars(container, rows, emptyText, altColor = false) {\n  if (!rows?.length) {\n    el('p', emptyText, container, 'muted');\n    return;\n  }\n  const maxVal = Math.max(1, ...rows.map(r => Number(r.devices ?? r.value ?? 0)));\n  const list = el('div', undefined, container, 'bar-list');\n  for (const r of rows.slice(0, 5)) {\n    const val = Number(r.devices ?? r.value ?? 0);\n    const item = el('div', undefined, list, 'bar-row');\n    const top = el('div', undefined, item, 'row-top');\n    el('span', r.label, top);\n    el('span', `${val}`, top, 'muted');\n    const track = el('div', undefined, item, 'bar-track');\n    const fill = el('div', undefined, track, 'bar-fill' + (altColor ? ' bar-fill-alt' : ''));\n    fill.style.width = `${Math.max(4, Math.round((val / maxVal) * 100))}%`;\n  }\n}\n\nfunction renderDownloadsTable(container, downloads, maxRows = 12) {\n  container.replaceChildren();\n  const versions = (downloads?.versions || []).slice(0, maxRows);\n  if (!versions.length) {\n    el('p', '\u6682\u65e0\u7248\u672c\u4e0b\u8f7d\u7edf\u8ba1\u8bb0\u5f55\u3002\u53ef\u70b9\u51fb\u300c\u540c\u6b65\u5b98\u65b9\u4e0b\u8f7d\u8ba1\u6570\u300d\u62c9\u53d6\u6700\u65b0 Release \u9644\u4ef6\u7edf\u8ba1\u3002', container, 'muted');\n    return;\n  }\n  const scroll = el('div', undefined, container, 'table-scroll');\n  const tbl = el('table', undefined, scroll, 'data-table');\n  const thead = el('thead', undefined, tbl);\n  const hr = el('tr', undefined, thead);\n  for (const h of ['\u7248\u672c\u53f7', '\u7248\u672c\u7c7b\u578b', 'APK \u5b89\u88c5\u5305\u9644\u4ef6', 'GitHub \u5b98\u65b9\u4e0b\u8f7d', 'CNB \u5b98\u65b9\u4e0b\u8f7d', '\u5e94\u7528\u5185\u66f4\u65b0\u5b8c\u6210', '\u5df2\u77e5\u7d2f\u8ba1\u4e0b\u8f7d']) {\n    el('th', h, hr);\n  }\n  const tbody = el('tbody', undefined, tbl);\n  for (const v of versions) {\n    const tr = el('tr', undefined, tbody);\n    el('td', 'v' + v.versionName + (v.versionCode ? ` (${v.versionCode})` : ''), tr);\n    const chTd = el('td', undefined, tr);\n    el('span', CHANNEL_ZH[v.channel] || '\u6b63\u5f0f\u7248\u672c', chTd, 'badge');\n    el('td', v.assetName || '-', tr, 'muted');\n    el('td', v.githubDownloads === null || v.githubDownloads === undefined ? '\u6682\u65e0\u7edf\u8ba1\u6570\u636e' : String(v.githubDownloads), tr);\n    const cnbTd = el('td', undefined, tr);\n    if (v.cnbDownloads === null || v.cnbDownloads === undefined) {\n      el('span', '\u6682\u65e0\u7edf\u8ba1\u6570\u636e', cnbTd, 'muted');\n    } else {\n      cnbTd.textContent = String(v.cnbDownloads);\n    }\n    const inAppSum = Number(v.inAppCnbDownloads || 0) + Number(v.inAppGithubDownloads || 0);\n    el('td', inAppSum > 0 ? `${inAppSum} (CNB ${v.inAppCnbDownloads || 0} / GH ${v.inAppGithubDownloads || 0})` : '0', tr);\n    const totalTd = el('td', undefined, tr);\n    el('strong', String(v.totalDownloads ?? 0), totalTd);\n  }\n}\n\nfunction renderTelemetrySections(tel) {\n  latestTelemetry = tel;\n  const k = tel?.kpis || {};\n  const meta = tel?.coverageMeta || {};\n  const dl = tel?.downloads || {};\n  const winMin = meta.activeWindowMinutes || 15;\n\n  $('overview-ops-note').textContent = meta.scopeNote || '\u81ea v1.5.83 \u8d77\u533f\u540d\u4f7f\u7528\u7edf\u8ba1\u9ed8\u8ba4\u5f00\u542f\uff08\u652f\u6301\u968f\u65f6\u5173\u95ed\uff09\uff1b\u4e0b\u8f7d\u6b21\u6570\u6765\u81ea\u5b98\u65b9 Release \u9644\u4ef6\u7edf\u8ba1\u3002';\n\n  // \u7b2c\u4e00\u533a\u57df\uff1a\u6838\u5fc3 6 \u5f20\u8fd0\u8425\u6570\u636e\u5361\u7247\n  const opsKpiBox = $('overview-ops-kpis');\n  opsKpiBox.replaceChildren();\n  const top6 = [\n    [`\u8fd1${winMin}\u5206\u949f\u6d3b\u8dc3\u8bbe\u5907`, String(k.activeRecentDevices ?? 0), '\u8fd1\u671f\u6709\u6548\u5fc3\u8df3 \u00b7 \u533f\u540d\u4f30\u7b97'],\n    ['\u4eca\u65e5\u6d3b\u8dc3\u8bbe\u5907', String(k.dauToday ?? 0), `\u6628\u65e5\u6d3b\u8dc3 ${k.dauYesterday ?? 0} \u53f0`],\n    ['\u4eca\u65e5\u65b0\u589e\u8bbe\u5907', String(k.newToday ?? 0), `\u6628\u65e5\u65b0\u589e ${k.newYesterday ?? 0} \u53f0`],\n    ['\u7d2f\u8ba1\u89c2\u6d4b\u8bbe\u5907', String(k.totalObservedDevices ?? 0), '\u5f00\u542f\u7edf\u8ba1\u7684\u5b89\u88c5 ID \u53bb\u91cd'],\n    ['\u7d2f\u8ba1\u4e0b\u8f7d\u6b21\u6570', String(dl.totalCumulativeDownloads ?? 0), `GitHub \u5b98\u65b9 ${dl.githubOfficialTotalDownloads ?? 0} \u6b21 \u00b7 CNB ${dl.cnbOfficialTotalDownloads === null ? '\u6682\u65e0\u5b98\u65b9\u8ba1\u6570' : dl.cnbOfficialTotalDownloads}`],\n    [\n      '\u6700\u65b0\u6b63\u5f0f\u7248\u672c\u4f7f\u7528\u7387',\n      k.latestStableSharePercent !== null && k.latestStableSharePercent !== undefined ? (k.latestStableSharePercent + '%') : '\u6682\u65e0\u6d3b\u8dc3\u6837\u672c',\n      k.latestStableVersionName ? `\u6b63\u5f0f\u7248 v${k.latestStableVersionName} \u6d3b\u8dc3\u5360\u6bd4` : '\u7b49\u5f85\u6b63\u5f0f\u7248\u6d3b\u8dc3\u6837\u672c'\n    ],\n  ];\n  for (const [title, val, sub] of top6) {\n    const c = el('div', undefined, opsKpiBox, 'card kpi-card');\n    el('span', title, c, 'muted');\n    el('strong', val, c);\n    el('span', sub, c, 'kpi-sub');\n  }\n\n  // \u7b2c\u4e8c\u533a\u57df\uff1a2x2 \u8d8b\u52bf\u4e0e\u5206\u5e03\u56fe\u8868\n  const chartsGrid = $('overview-charts-grid');\n  chartsGrid.replaceChildren();\n\n  // \u56fe1\uff1a\u6d3b\u8dc3\u4e0e\u65b0\u589e\u8d8b\u52bf\u6298\u7ebf\u56fe\n  const c1 = el('div', undefined, chartsGrid, 'sub-card');\n  const c1Head = el('div', undefined, c1, 'row-top');\n  el('strong', '\u6d3b\u8dc3\u4e0e\u65b0\u589e\u8bbe\u5907\u8d8b\u52bf', c1Head);\n  const leg1 = el('div', undefined, c1Head, 'chart-legend');\n  const d1 = el('span', '', leg1, 'legend-dot'); d1.style.background = '#385B73'; leg1.append(document.createTextNode('\u65e5\u6d3b\u8dc3 '));\n  const d2 = el('span', '', leg1, 'legend-dot'); d2.style.background = '#2A8562'; leg1.append(document.createTextNode('\u65e5\u65b0\u589e'));\n  const activePts = (tel?.trends?.dailyActiveAndNew || []);\n  buildLineChartSvg(\n    c1,\n    [\n      { color: '#385B73', area: true, points: activePts.map(r => ({ x: r.day, y: Number(r.dau || 0) })) },\n      { color: '#2A8562', area: false, points: activePts.map(r => ({ x: r.day, y: Number(r.newDevices || 0) })) },\n    ],\n    '\u5f53\u524d\u9009\u5b9a\u65f6\u95f4\u7a97\u53e3\u6682\u65e0\u5df2\u4e0a\u62a5\u7684\u533f\u540d\u6d3b\u8dc3\u8bbe\u5907\u8bb0\u5f55\uff08\u4e0d\u4f2a\u9020\u542f\u7528\u524d\u5386\u53f2\u6570\u636e\uff09\u3002'\n  );\n  el('p', meta.startedDay ? `\u7edf\u8ba1\u751f\u6548\u8d77\u70b9\uff1a${meta.startedDay}\uff08\u6b64\u524d\u65e5\u671f\u65e0\u5386\u53f2\u91c7\u96c6\uff0c\u4e0d\u8865\u9020\u6570\u636e\uff09` : '\u5c1a\u672a\u6536\u5230\u9996\u53f0\u5f00\u542f\u300c\u533f\u540d\u4f7f\u7528\u7edf\u8ba1\u300d\u7684\u5ba2\u6237\u7aef\u5fc3\u8df3\u4e0a\u62a5\u3002', c1, 'muted');\n\n  // \u56fe2\uff1a\u5b98\u65b9\u4e0b\u8f7d\u5feb\u7167\u8d8b\u52bf\u4e0e\u8282\u70b9\u5360\u6bd4\u5bf9\u6bd4\n  const c2 = el('div', undefined, chartsGrid, 'sub-card');\n  const c2Head = el('div', undefined, c2, 'row-top');\n  el('strong', '\u5b89\u88c5\u5305\u4e0b\u8f7d\u8d8b\u52bf\u4e0e\u8282\u70b9\u5bf9\u6bd4', c2Head);\n  el('span', dl.todayNewDownloads === null || dl.todayNewDownloads === undefined ? '\u4eca\u65e5\u589e\u91cf\uff1a\u9996\u65e5\u5efa\u7acb\u5feb\u7167\u57fa\u7ebf\u4e2d' : `\u4eca\u65e5\u65b0\u589e\u4e0b\u8f7d\uff1a${dl.todayNewDownloads}`, c2Head, 'badge');\n  const dlPts = (dl.dailyTrend || []);\n  buildLineChartSvg(\n    c2,\n    [{ color: '#385B73', area: true, points: dlPts.map(r => ({ x: r.day, y: Number(r.cumulativeDownloads || 0) })) }],\n    '\u6bcf\u65e5\u4e0b\u8f7d\u5feb\u7167\u5c06\u5728\u9996\u6b21\u540c\u6b65\u5b98\u65b9 Release \u540e\u81ea\u52a8\u751f\u6210\u8d8b\u52bf\u70b9\u3002'\n  );\n  const nodeCompare = el('div', undefined, c2, 'bar-list');\n  const ghCount = Number(dl.githubOfficialTotalDownloads || 0);\n  const inAppCnb = Number(dl.inAppNodeDownloads?.cnbPrimary || 0);\n  const inAppGh = Number(dl.inAppNodeDownloads?.githubBackup || 0);\n  const rRow1 = el('div', undefined, nodeCompare, 'row-top muted');\n  el('span', `GitHub \u5b98\u65b9 Release \u7d2f\u8ba1\uff1a${ghCount} \u6b21`, rRow1);\n  el('span', `CNB \u5b98\u65b9 Release \u7edf\u8ba1\uff1a${dl.cnbOfficialTotalDownloads === null || dl.cnbOfficialTotalDownloads === undefined ? '\u6682\u65e0\u7edf\u8ba1\u6570\u636e' : (dl.cnbOfficialTotalDownloads + ' \u6b21')}`, rRow1);\n  const rRow2 = el('div', undefined, nodeCompare, 'row-top muted');\n  el('span', `\u8f6f\u4ef6\u5185\u66f4\u65b0\u8282\u70b9\u5b9e\u6d4b\u5b8c\u6210\uff1aCNB \u56fd\u5185\u8282\u70b9 ${inAppCnb} \u6b21 \u00b7 GitHub \u5907\u7528\u8282\u70b9 ${inAppGh} \u6b21`, rRow2);\n  if (dl.cnbStatusNote) el('p', dl.cnbStatusNote, c2, 'muted');\n\n  // \u56fe3\uff1a\u5404\u7248\u672c\u6d3b\u8dc3\u5360\u6bd4\u73af\u5f62\u56fe\n  const c3 = el('div', undefined, chartsGrid, 'sub-card');\n  el('strong', '\u5404\u7248\u672c\u6d3b\u8dc3\u8bbe\u5907\u5360\u6bd4\uff08\u8fd130\u65e5\uff09', c3);\n  const verItems = (tel?.distributions?.byVersion || []).map(v => ({\n    label: `v${v.versionName} (${v.channel === 'testing' ? '\u6d4b\u8bd5' : '\u6b63\u5f0f'})`,\n    value: v.devices\n  }));\n  buildDonutChartSvg(c3, verItems);\n\n  // \u56fe4\uff1aAndroid \u7cfb\u7edf\u4e0e\u8bbe\u5907\u578b\u53f7\u5206\u5e03\n  const c4 = el('div', undefined, chartsGrid, 'sub-card');\n  el('strong', 'Android \u7cfb\u7edf\u7248\u672c\u4e0e\u673a\u578b\u5206\u5e03\uff08\u8fd130\u65e5\uff09', c4);\n  const sysSplit = el('div', undefined, c4, 'split-grid');\n  sysSplit.style.gridTemplateColumns = 'repeat(auto-fit, minmax(170px, 1fr))';\n  const sysCol = el('div', undefined, sysSplit);\n  el('p', 'Android \u7cfb\u7edf\u7248\u672c', sysCol, 'muted');\n  renderHorizontalBars(sysCol, tel?.distributions?.byAndroidVersion || [], '\u6682\u65e0\u7cfb\u7edf\u7248\u672c\u6837\u672c', false);\n  const modCol = el('div', undefined, sysSplit);\n  el('p', '\u8bbe\u5907\u578b\u53f7\u524d\u4e94', modCol, 'muted');\n  renderHorizontalBars(modCol, tel?.distributions?.byDeviceModel || [], '\u6682\u65e0\u8bbe\u5907\u578b\u53f7\u6837\u672c', true);\n\n  // \u603b\u89c8\u4e0b\u65b9\u5404\u7248\u672c\u4e0b\u8f7d\u6b21\u6570\u7b80\u8868\n  const dlWrap = $('overview-downloads-table-wrap');\n  dlWrap.replaceChildren();\n  const dlHead = el('div', undefined, dlWrap, 'row-top');\n  el('h3', '\u5404\u7248\u672c\u5b98\u65b9 APK \u4e0b\u8f7d\u6b21\u6570\u7edf\u8ba1\uff08\u524d 8 \u4e2a\u7248\u672c\uff09', dlHead);\n  el('span', `\u6b63\u5f0f\u7248\u4e0b\u8f7d ${dl.stableDownloads ?? 0} \u6b21 \u00b7 \u6d4b\u8bd5\u7248\u4e0b\u8f7d ${dl.testingDownloads ?? 0} \u6b21 \u00b7 \u6700\u8fd1\u540c\u6b65 ${fmtTime(dl.lastSyncedAt)}`, dlHead, 'muted');\n  const dlTableMount = el('div', undefined, dlWrap);\n  renderDownloadsTable(dlTableMount, dl, 8);\n\n  // \u6e32\u67d3\u72ec\u7acb\u4e00\u7ea7\u5bfc\u822a\u300c\u8fd0\u8425\u7edf\u8ba1\u300d\u89c6\u56fe\n  renderDedicatedOperationsView(tel);\n}\n\nfunction renderDedicatedOperationsView(tel) {\n  const k = tel?.kpis || {};\n  const meta = tel?.coverageMeta || {};\n  const ret = tel?.retention || {};\n  const funnel = tel?.updateFunnel || {};\n  const dl = tel?.downloads || {};\n  const winMin = meta.activeWindowMinutes || 15;\n\n  $('ops-scope-banner').textContent = (meta.scopeNote || '') + ' \u540c\u65f6\u660e\u786e\u533a\u5206\uff1aRelease \u9644\u4ef6\u4e0b\u8f7d\u6b21\u6570 \u2260 \u5b9e\u9645\u5b89\u88c5\u4eba\u6570 \u2260 \u72ec\u7acb\u6d3b\u8dc3\u7528\u6237\u6570\u3002';\n\n  const fullBox = $('ops-full-kpis');\n  fullBox.replaceChildren();\n  const latestMau = tel?.trends?.monthlyActive?.length\n    ? tel.trends.monthlyActive[tel.trends.monthlyActive.length - 1].mau\n    : k.active30d ?? 0;\n  const cards = [\n    [`\u8fd1${winMin}\u5206\u949f\u6d3b\u8dc3`, String(k.activeRecentDevices ?? 0), '\u8fd1\u671f\u6709\u6548\u5fc3\u8df3\u8bbe\u5907'],\n    ['\u4eca\u65e5\u6d3b\u8dc3 (DAU)', String(k.dauToday ?? 0), `\u6628\u65e5\u6d3b\u8dc3 ${k.dauYesterday ?? 0} \u53f0`],\n    ['\u8fd17\u65e5\u6d3b\u8dc3\u8bbe\u5907', String(k.active7d ?? 0), '7\u65e5\u5185\u53bb\u91cd\u533f\u540d\u5b89\u88c5 ID'],\n    ['\u8fd130\u65e5\u6d3b\u8dc3 / MAU', `${k.active30d ?? 0} / ${latestMau}`, '\u8fd130\u65e5\u6eda\u52a8 / \u5f53\u6708\u81ea\u7136\u6708'],\n    ['\u4eca\u65e5\u65b0\u589e\u8bbe\u5907', String(k.newToday ?? 0), `\u6628\u65e5\u65b0\u589e ${k.newYesterday ?? 0} \u53f0`],\n    ['\u6b21\u65e5\u7559\u5b58\u7387', fmtPct(ret.day1?.ratePercent, '\u6682\u65e0\u8db3\u591f\u6570\u636e'), ret.day1?.cohortDay ? `\u6837\u672c\u65e5 ${ret.day1.cohortDay} (${ret.day1.retained}/${ret.day1.cohortSize})` : '\u9700\u6ee1\u5b8c\u6574\u6b21\u65e5\u89c2\u5bdf\u7a97\u53e3'],\n    ['7\u65e5\u7559\u5b58\u7387', fmtPct(ret.day7?.ratePercent, '\u6682\u65e0\u8db3\u591f\u6570\u636e'), ret.day7?.cohortDay ? `\u6837\u672c\u65e5 ${ret.day7.cohortDay} (${ret.day7.retained}/${ret.day7.cohortSize})` : '\u9700\u6ee1\u5b8c\u65747\u65e5\u89c2\u5bdf\u7a97\u53e3'],\n    ['\u6d4b\u8bd5\u7248\u672c\u4f7f\u7528\u5360\u6bd4', fmtPct(k.testingSharePercent, '\u6682\u65e0\u6d3b\u8dc3\u6837\u672c'), 'testing \u901a\u9053\u8fd130\u65e5\u5360\u6bd4'],\n  ];\n  for (const [title, val, sub] of cards) {\n    const c = el('div', undefined, fullBox, 'sub-card kpi-card');\n    el('span', title, c, 'muted');\n    el('strong', val, c);\n    el('span', sub, c, 'kpi-sub');\n  }\n\n  // \u66f4\u65b0\u6548\u679c\u4e0e\u8282\u70b9\u5b9e\u6d4b\u5206\u6d41\n  const fmBox = $('ops-funnel-and-mirrors');\n  fmBox.replaceChildren();\n  const fCard = el('div', undefined, fmBox, 'card');\n  el('h2', '\u8f6f\u4ef6\u5185\u66f4\u65b0\u5168\u94fe\u8def\u6f0f\u6597\uff08\u9009\u5b9a\u65f6\u95f4\u7a97\u53e3\uff09', fCard);\n  const fRows = [\n    ['\u53d1\u8d77\u66f4\u65b0\u4e0b\u8f7d\u6b21\u6570', String(funnel.downloadStarted ?? 0)],\n    ['\u5b89\u88c5\u5305\u4e0b\u8f7d\u6210\u529f\u6b21\u6570', `${funnel.downloadSucceeded ?? 0}\uff08\u6210\u529f\u7387\uff1a${fmtPct(funnel.downloadSuccessRatePercent, '\u6682\u65e0\u4e0b\u8f7d\u8bb0\u5f55')}\uff09`],\n    ['\u5b89\u88c5\u5305\u4e0b\u8f7d\u5931\u8d25\u6b21\u6570', `${funnel.downloadFailed ?? 0}\uff08\u5931\u8d25\u7387\uff1a${fmtPct(funnel.downloadFailureRatePercent, '\u6682\u65e0\u4e0b\u8f7d\u8bb0\u5f55')}\uff09`],\n    ['SHA-256 / \u7b7e\u540d\u6821\u9a8c\u5931\u8d25\u6b21\u6570', String(funnel.verifyFailed ?? 0)],\n    ['\u8986\u76d6\u5347\u7ea7\u540e\u65b0\u7248\u9996\u6b21\u542f\u52a8\u786e\u8ba4', `${funnel.installConfirmed ?? 0} \u53f0`],\n    ['\u6700\u65b0\u6b63\u5f0f\u7248\u6d3b\u8dc3\u8986\u76d6\u7387', fmtPct(funnel.newVersionCoveragePercent, '\u6682\u65e0\u6d3b\u8dc3\u6837\u672c')],\n  ];\n  for (const [lbl, v] of fRows) {\n    const r = el('div', undefined, fCard, 'row-item');\n    const top = el('div', undefined, r, 'row-top');\n    el('span', lbl, top);\n    el('strong', v, top);\n  }\n  if (funnel.installConfirmNote) el('p', funnel.installConfirmNote, fCard, 'muted');\n\n  const mCard = el('div', undefined, fmBox, 'card');\n  el('h2', '\u5ba2\u6237\u7aef\u4e0b\u8f7d\u8282\u70b9\u5b9e\u6d4b\u4f7f\u7528\u660e\u7ec6', mCard);\n  const mirrors = funnel.byMirror || [];\n  if (!mirrors.length) {\n    el('p', '\u9009\u5b9a\u65f6\u95f4\u8303\u56f4\u5185\u6682\u65e0\u5ba2\u6237\u7aef\u4e0a\u62a5\u7684\u8f6f\u4ef6\u5185\u66f4\u65b0\u8282\u70b9\u4e8b\u4ef6\u3002', mCard, 'muted');\n  } else {\n    for (const m of mirrors) {\n      const r = el('div', undefined, mCard, 'row-item');\n      const top = el('div', undefined, r, 'row-top');\n      const mName = m.mirrorId === 'cnb-primary' ? 'CNB \u56fd\u5185\u4e3b\u8282\u70b9' : m.mirrorId === 'github-backup' ? 'GitHub \u5907\u7528\u8282\u70b9' : m.mirrorId;\n      el('strong', mName, top);\n      const term = (m.succeeded || 0) + (m.failed || 0);\n      el('span', term > 0 ? `\u6210\u529f\u7387 ${((m.succeeded / term) * 100).toFixed(1)}%` : '\u4e0b\u8f7d\u8fdb\u884c\u4e2d', top, 'badge');\n      el('p', `\u53d1\u8d77 ${m.started || 0} \u6b21 \u00b7 \u6210\u529f ${m.succeeded || 0} \u6b21 \u00b7 \u5931\u8d25 ${m.failed || 0} \u6b21`, r, 'muted');\n    }\n  }\n\n  // \u5168\u91cf\u7248\u672c\u4e0b\u8f7d\u7edf\u8ba1\u8868\n  renderDownloadsTable($('ops-downloads-detail'), dl, 40);\n\n  // \u7248\u672c\u5065\u5eb7\u4ea4\u53c9\u77e9\u9635\n  const vhBox = $('ops-version-health');\n  vhBox.replaceChildren();\n  const matrix = tel?.versionHealthMatrix || [];\n  if (!matrix.length) {\n    el('p', '\u6682\u65e0\u7248\u672c\u5065\u5eb7\u5bf9\u7167\u8bb0\u5f55\u3002', vhBox, 'muted');\n  } else {\n    const scroll = el('div', undefined, vhBox, 'table-scroll');\n    const tbl = el('table', undefined, scroll, 'data-table');\n    const thead = el('thead', undefined, tbl);\n    const hr = el('tr', undefined, thead);\n    for (const h of ['\u7248\u672c\u53f7', '\u5df2\u89c2\u6d4b\u6d3b\u8dc3\u8bbe\u5907', '\u53cd\u9988\u603b\u6570', '\u95ea\u9000\u53cd\u9988', '\u64ad\u653e/\u5361\u987f\u53cd\u9988', '\u5df2\u4fee\u590d\u9879', '\u5f85\u5904\u7406\u9879']) {\n      el('th', h, hr);\n    }\n    const tbody = el('tbody', undefined, tbl);\n    for (const row of matrix) {\n      const tr = el('tr', undefined, tbody);\n      el('td', 'v' + row.versionName, tr);\n      el('td', row.observedActiveDevices === null ? '\u672a\u8986\u76d6/0' : `${row.observedActiveDevices} \u53f0`, tr, 'muted');\n      el('td', String(row.totalFeedback || 0), tr);\n      el('td', String(row.crashFeedback || 0), tr, row.crashFeedback > 0 ? 'badge-danger' : '');\n      el('td', String(row.playbackFeedback || 0), tr);\n      el('td', String(row.resolvedItems || 0), tr);\n      el('td', String(row.openItems || 0), tr);\n    }\n  }\n\n  // \u514d\u8d39\u989d\u5ea6\u4e0e\u964d\u9891\u4fdd\u62a4\u5361\n  const qCard = $('ops-quota-card');\n  qCard.replaceChildren();\n  el('h2', 'Cloudflare \u514d\u8d39\u989d\u5ea6\u9884\u7b97\u4e0e\u7edf\u8ba1\u4fdd\u62a4\u63a7\u5236', qCard);\n  const used = Number(meta.dailyWritesUsed || 0);\n  const budget = Math.max(1, Number(meta.dailyWriteBudget || 40000));\n  const modeZh = meta.throttleMode === 'disabled_by_admin'\n    ? '\u7ba1\u7406\u5458\u5df2\u5173\u95ed\u63a5\u6536'\n    : meta.throttleMode === 'paused_quota_guard'\n      ? '\u5df2\u89e6\u53d1 90% \u9884\u7b97\u7194\u65ad\u6682\u505c'\n      : meta.throttleMode === 'throttled_quota_guard'\n        ? '\u5df2\u89e6\u53d1 70% \u9884\u7b97\u81ea\u52a8\u964d\u9891\uff0830\u5206\u949f/\u6b21\uff09'\n        : '\u6b63\u5e38\u8fd0\u884c\uff08\u4f4e\u9891\u5fc3\u8df3\u53bb\u91cd\uff09';\n  const qTop = el('div', undefined, qCard, 'row-top');\n  el('span', `\u4eca\u65e5\u7edf\u8ba1 D1 \u5199\u5165\u7528\u91cf\uff1a${used} / ${budget} \u6b21\uff08\u4fdd\u7559\u5145\u8db3\u989d\u5ea6\u7ed9\u8f6f\u4ef6\u5185\u66f4\u65b0\u4e0e\u7528\u6237\u53cd\u9988\uff09`, qTop);\n  el('span', modeZh, qTop, meta.throttleMode === 'normal' ? 'badge badge-ok' : 'badge badge-warn');\n  const track = el('div', undefined, qCard, 'bar-track');\n  track.style.marginTop = '8px';\n  const fill = el('div', undefined, track, 'bar-fill');\n  fill.style.width = `${Math.min(100, Math.max(2, Math.round((used / budget) * 100)))}%`;\n\n  if (role === 'admin') {\n    const form = el('form', undefined, qCard, 'form-grid');\n    const l1 = el('label', '\u4e91\u7aef\u533f\u540d\u7edf\u8ba1\u63a5\u6536\u5f00\u5173', form);\n    const selEn = el('select', undefined, l1);\n    el('option', '\u5f00\u542f\u63a5\u6536\uff08\u9ed8\u8ba4\uff09', selEn).value = 'true';\n    el('option', '\u6682\u505c\u63a5\u6536\u4e00\u5207\u7edf\u8ba1\u4e0a\u62a5', selEn).value = 'false';\n    selEn.value = String(meta.telemetryEnabled !== false);\n\n    const l2 = el('label', '\u5ba2\u6237\u7aef\u5fc3\u8df3\u4e0a\u62a5\u5468\u671f\uff08\u79d2\uff0c300~7200\uff09', form);\n    const inpSec = el('input', undefined, l2);\n    inpSec.type = 'number'; inpSec.min = '300'; inpSec.max = '7200';\n    inpSec.value = String(meta.baseIntervalSec || 600);\n\n    const l3 = el('label', '\u6bcf\u65e5\u7edf\u8ba1 D1 \u5199\u5165\u9884\u7b97\u4e0a\u9650\uff081000~90000\uff09', form);\n    const inpBudget = el('input', undefined, l3);\n    inpBudget.type = 'number'; inpBudget.min = '1000'; inpBudget.max = '90000';\n    inpBudget.value = String(budget);\n\n    const btnSave = el('button', '\u4fdd\u5b58\u7edf\u8ba1\u4fdd\u62a4\u914d\u7f6e', form, 'btn-primary span-full');\n    btnSave.type = 'submit';\n    form.onsubmit = guarded(async () => {\n      await api('telemetry/config', {\n        method: 'PATCH',\n        body: JSON.stringify({\n          telemetryEnabled: selEn.value === 'true',\n          intervalSec: Number(inpSec.value),\n          dailyWriteBudget: Number(inpBudget.value),\n        }),\n      });\n      showMessage('\u5df2\u66f4\u65b0\u4e91\u7aef\u7edf\u8ba1\u4fdd\u62a4\u4e0e\u5fc3\u8df3\u964d\u9891\u914d\u7f6e');\n      await loadTelemetryOnly(true);\n    });\n  }\n}\n\nfunction renderNodeCard(parent, nodeInfo) {\n  const card = el('div', undefined, parent, 'card');\n  const top = el('div', undefined, card, 'row-top');\n  el('strong', nodeInfo.label || '\u4e0b\u8f7d\u8282\u70b9', top);\n  const badge = el('span', nodeInfo.stateLabel || '\u5f85\u914d\u7f6e', top, nodeBadgeClass(nodeInfo.stateCode));\n  if (nodeInfo.versionName) {\n    el('p', `\u5173\u8054\u7248\u672c\uff1av${nodeInfo.versionName}\uff08${CHANNEL_ZH[nodeInfo.channel] || nodeInfo.channel}\uff09`, card, 'muted');\n  }\n  const metrics = nodeInfo.lastCheckedAt\n    ? `HTTP ${nodeInfo.httpStatus || '-'} \u00b7 \u8017\u65f6 ${nodeInfo.latencyMs || 0} ms \u00b7 \u6587\u4ef6\u5927\u5c0f ${fmtBytes(nodeInfo.sizeBytes)} \u00b7 SHA-256 ${nodeInfo.sha256Verified ? '\u5b8c\u6574\u6821\u9a8c\u901a\u8fc7' : 'Range \u5b57\u8282\u6d41\u6821\u9a8c'}`\n    : '\u5c1a\u672a\u4ea7\u751f\u63a2\u6d4b\u6307\u6807';\n  el('p', metrics, card, 'muted');\n  el('p', `\u68c0\u6d4b\u8bf4\u660e\uff1a${nodeInfo.reason || '-'}`, card);\n  el('p', `\u6700\u8fd1\u68c0\u6d4b\uff1a${fmtTime(nodeInfo.lastCheckedAt)}`, card, 'muted');\n  return { card, badge };\n}\n\nasync function triggerProbeAllNodes(triggerBtn) {\n  if (triggerBtn) {\n    triggerBtn.disabled = true;\n    triggerBtn.textContent = '\u68c0\u6d4b\u4e2d\u2026';\n  }\n  try {\n    showMessage('\u6b63\u5728\u5b9e\u65f6\u68c0\u6d4b CNB \u4e0e GitHub \u4e0b\u8f7d\u8282\u70b9\u5e76\u540c\u6b65\u5b98\u65b9\u4e0b\u8f7d\u8ba1\u6570\u2026');\n    await api('nodes/probe-all', { method: 'POST', body: '{}' });\n    await loadAll();\n    showMessage('\u4e0b\u8f7d\u8282\u70b9\u5b9e\u65f6\u68c0\u6d4b\u4e0e\u5b98\u65b9\u4e0b\u8f7d\u8ba1\u6570\u540c\u6b65\u5df2\u5b8c\u6210\uff01');\n  } finally {\n    if (triggerBtn) {\n      triggerBtn.disabled = false;\n      triggerBtn.textContent = '\u7acb\u5373\u68c0\u6d4b\u5168\u90e8\u4e0b\u8f7d\u8282\u70b9';\n    }\n  }\n}\n\nfunction renderOverview(ov) {\n  latestOverview = ov;\n  const statsBox = $('stats');\n  statsBox.replaceChildren();\n  const fb = ov.feedbackStats || {};\n  const stable = ov.stableRelease;\n  const testingRel = ov.testingRelease;\n  const cand = ov.candidateRelease;\n  const ns = ov.nodeSummary || {};\n\n  // \u7b2c\u4e09\u533a\u57df\u5185\u90e8\uff1a\u7528\u6237\u53cd\u9988\u7d27\u51d1 4 \u5361\n  const fbKpis = [\n    ['\u5f85\u5904\u7406\u53cd\u9988', fb.pendingFeedback ?? 0, `\u4eca\u65e5\u65b0\u589e ${fb.today ?? 0} \u6761`],\n    ['\u5f85\u4fee\u590d\u95ee\u9898', fb.pendingIssues ?? 0, `\u9ad8\u4f18\u5148\u7ea7 ${fb.highPriority ?? 0} \u9879`],\n    ['\u5df2\u89e3\u51b3\u95ee\u9898', fb.resolvedIssues ?? 0, '\u5173\u8054\u7248\u672c\u5df2\u4fee\u590d\u5f52\u6863'],\n    ['\u7d2f\u8ba1\u63a5\u6536\u53cd\u9988', fb.lifetime ?? 0, `\u5f53\u524d\u4fdd\u7559\u671f\u5185 ${fb.total ?? 0} \u6761`],\n  ];\n  for (const [label, val, sub] of fbKpis) {\n    const c = el('div', undefined, statsBox, 'sub-card kpi-card');\n    el('span', label, c, 'muted');\n    el('strong', val, c);\n    el('span', sub, c, 'kpi-sub');\n  }\n\n  // \u7b2c\u56db\u533a\u57df\uff1a\u7248\u672c\u53d1\u5e03\u53ca\u670d\u52a1\u72b6\u6001\n  const relZone = $('overview-releases');\n  relZone.replaceChildren();\n  const zHead = el('div', undefined, relZone, 'zone-header');\n  const zTitleWrap = el('div', undefined, zHead);\n  el('h2', '\u7248\u672c\u53d1\u5e03\u53ca\u670d\u52a1\u72b6\u6001', zTitleWrap, 'zone-title');\n  el('p', '\u4e25\u683c\u533a\u5206\u7ebf\u4e0a\u6b63\u5f0f\u7248\u3001\u5185\u90e8\u6d4b\u8bd5\u7248\u4e0e\u5f85\u53d1\u5019\u9009\u7248\uff1b\u4e0b\u8f7d\u8282\u70b9\u6bcf 30 \u5206\u949f\u81ea\u52a8\u5de1\u68c0\u5e76\u652f\u6301\u624b\u52a8\u5373\u65f6\u68c0\u6d4b\u3002', zTitleWrap, 'muted');\n  if (role === 'admin') {\n    const probeBtn = el('button', '\u7acb\u5373\u68c0\u6d4b\u5168\u90e8\u4e0b\u8f7d\u8282\u70b9', zHead, 'btn-secondary compact-btn');\n    probeBtn.type = 'button';\n    probeBtn.onclick = guarded(() => triggerProbeAllNodes(probeBtn));\n  }\n\n  // 4.1 \u6b63\u5f0f\u7248 / \u6d4b\u8bd5\u7248 / \u5019\u9009\u7248 \u4e09\u5361\u6e05\u6670\u5e76\u5217\uff08\u5f7b\u5e95\u6d88\u9664\u6d4b\u8bd5\u7248\u88ab\u663e\u793a\u4e3a\u5019\u9009\u7248\u82f1\u6587\u72b6\u6001\u7684\u6df7\u6dc6\uff09\n  const verGrid = el('div', undefined, relZone, 'triple-grid');\n  const stCard = el('div', undefined, verGrid, 'card');\n  const stTop = el('div', undefined, stCard, 'row-top');\n  el('span', '\u5f53\u524d\u6b63\u5f0f\u7248\u672c', stTop, 'muted');\n  el('span', stable ? formatReleaseStatusZh(stable) : '\u5f85\u53d1\u5e03', stTop, stable ? 'badge badge-ok' : 'badge');\n  el('strong', stable ? `v${stable.version_name} (Build ${stable.version_code})` : '\u6682\u65e0\u6b63\u5f0f\u7248\u8bb0\u5f55', stCard).style.fontSize = '19px';\n  el('p', stable ? `\u53d1\u5e03\u65f6\u95f4\uff1a${fmtTime(stable.published_at)} \u00b7 Commit ${stable.git_commit || '-'}` : '\u6b63\u5f0f\u7a33\u5b9a\u901a\u9053\u5c1a\u672a\u53d1\u5e03\u7248\u672c', stCard, 'muted');\n\n  const tsCard = el('div', undefined, verGrid, 'card');\n  const tsTop = el('div', undefined, tsCard, 'row-top');\n  el('span', '\u5f53\u524d\u6d4b\u8bd5\u7248\u672c', tsTop, 'muted');\n  el('span', testingRel ? formatReleaseStatusZh(testingRel) : '\u6682\u65e0\u8bb0\u5f55', tsTop, testingRel ? 'badge' : 'badge');\n  el('strong', testingRel ? `v${testingRel.version_name} (Build ${testingRel.version_code})` : '\u6682\u65e0\u6d4b\u8bd5\u7248\u8bb0\u5f55', tsCard).style.fontSize = '19px';\n  el('p', testingRel ? `\u53d1\u5e03\u65f6\u95f4\uff1a${fmtTime(testingRel.published_at)} \u00b7 \u4ec5\u6d4b\u8bd5\u901a\u9053\u53ef\u89c1` : '\u5185\u90e8\u6d4b\u8bd5\u9a8c\u8bc1\u901a\u9053\u6682\u65e0\u5df2\u53d1\u5e03\u8bb0\u5f55', tsCard, 'muted');\n\n  const cdCard = el('div', undefined, verGrid, 'card');\n  const cdTop = el('div', undefined, cdCard, 'row-top');\n  el('span', '\u5f85\u53d1\u5019\u9009\u7248\u672c', cdTop, 'muted');\n  el('span', cand ? formatReleaseStatusZh(cand) : '\u65e0\u5f85\u5ba1\u5019\u9009', cdTop, cand ? 'badge badge-warn' : 'badge');\n  el('strong', cand ? `v${cand.version_name} (${CHANNEL_ZH[cand.channel] || cand.channel})` : '\u5f53\u524d\u65e0\u5f85\u53d1\u5019\u9009', cdCard).style.fontSize = '19px';\n  el('p', cand ? `\u66f4\u65b0\u65b9\u5f0f\uff1a${cand.force_update ? '\u5f3a\u5236\u66f4\u65b0' : '\u53ef\u9009\u66f4\u65b0'} \u00b7 \u66f4\u65b0\u4e8e ${fmtTime(cand.updated_at)}` : '\u65b0\u6784\u5efa\u4e0a\u4f20\u5019\u9009\u540e\u5c06\u5728\u6b64\u8fdb\u5165\u5f85\u6821\u9a8c/\u5f85\u5ba1\u6838\u6d41\u7a0b', cdCard, 'muted');\n\n  // 4.2 \u4e0b\u8f7d\u8282\u70b9\u53cc\u5361\uff08CNB \u56fd\u5185\u4e3b\u8282\u70b9 + GitHub \u5907\u7528\u8282\u70b9\uff09\n  const nodeGrid = el('div', undefined, relZone, 'split-grid');\n  const cnbSummary = ns.cnbPrimary || { label: 'CNB \u56fd\u5185\u4e3b\u8282\u70b9', stateCode: 'unconfigured', stateLabel: '\u5f85\u914d\u7f6e', reason: '\u5c1a\u672a\u914d\u7f6e\u4e0b\u8f7d\u8282\u70b9' };\n  const ghSummary = ns.githubBackup || { label: 'GitHub \u5907\u7528\u8282\u70b9', stateCode: 'unconfigured', stateLabel: '\u5f85\u914d\u7f6e', reason: '\u5c1a\u672a\u914d\u7f6e\u4e0b\u8f7d\u8282\u70b9' };\n  renderNodeCard(nodeGrid, cnbSummary);\n  renderNodeCard(nodeGrid, ghSummary);\n  if (ns.probeNote) {\n    el('p', ns.probeNote, relZone, 'muted');\n  }\n\n  // 4.3 \u66f4\u65b0\u7b56\u7565\u4e0e\u6700\u8fd1\u53d1\u5e03\u52a8\u4f5c\u53cc\u680f\n  const bottomSplit = el('div', undefined, relZone, 'split-grid');\n  const polCard = el('div', undefined, bottomSplit, 'card');\n  el('h2', '\u5f53\u524d\u751f\u6548\u66f4\u65b0\u7b56\u7565\u4e0e\u5f3a\u5236\u66f4\u65b0\u72b6\u6001', polCard);\n  if (!ov.policies || !ov.policies.length) {\n    el('p', '\u6682\u65e0\u5df2\u7b7e\u53d1\u7684\u7ebf\u4e0a\u66f4\u65b0\u7b56\u7565\uff08\u9ed8\u8ba4\u672a\u542f\u7528\u66f4\u65b0\u63a8\u9001\uff09\u3002', polCard, 'muted');\n  } else {\n    for (const p of ov.policies) {\n      const item = el('div', undefined, polCard, 'row-item');\n      const top = el('div', undefined, item, 'row-top');\n      el('strong', `${CHANNEL_ZH[p.channel] || p.channel} \u00b7 \u7b56\u7565\u5e8f\u5217\u53f7 #${p.policyRevision}`, top);\n      const isForce = p.updateEnabled && p.latestVersionCode <= p.minSupportedVersionCode;\n      const badgeLabel = p.updateEnabled\n        ? (isForce ? '\u5f3a\u5236\u66f4\u65b0\u751f\u6548\u4e2d' : '\u53ef\u9009\u66f4\u65b0\u751f\u6548\u4e2d')\n        : (POLICY_ACTION_ZH[p.policyAction] || '\u5df2\u6682\u505c\u63a8\u9001');\n      el('span', badgeLabel, top, p.updateEnabled ? (isForce ? 'badge badge-warn' : 'badge badge-ok') : 'badge');\n      el('p', `\u6700\u65b0\u7248\u672c v${p.latestVersionName} (${p.latestVersionCode}) \u00b7 \u6700\u4f4e\u5141\u8bb8\u7248\u672c ${p.minSupportedVersionCode} \u00b7 \u66f4\u65b0\u4e8e ${fmtTime(p.updatedAt)}`, item, 'muted');\n    }\n  }\n\n  const auditCard = el('div', undefined, bottomSplit, 'card');\n  el('h2', '\u6700\u8fd1\u7248\u672c\u53d1\u5e03\u8bb0\u5f55\u4e0e\u670d\u52a1\u5065\u5eb7', auditCard);\n  el('p', `\u4e91\u7aef\u53cd\u9988\u4e0a\u4f20\uff1a${ov.serviceHealth?.uploadsEnabled ? '\u6b63\u5e38\u5f00\u542f' : '\u5df2\u6682\u505c'} \u00b7 \u79c1\u6709 R2 \u65e5\u5fd7\u5360\u7528\uff1a${fmtBytes(ov.serviceHealth?.r2UsedBytes || 0)} / ${fmtBytes(ov.serviceHealth?.r2LimitBytes || 268435456)} \u00b7 \u72ec\u7acb\u53d1\u5e03\u7b7e\u540d\uff1a${ov.serviceHealth?.remotePublishReady ? '\u5df2\u5c31\u7eea' : '\u672a\u914d\u7f6e'}`, auditCard, 'muted');\n  if (ov.recentAudits?.length) {\n    for (const a of ov.recentAudits.slice(0, 5)) {\n      const r = el('div', undefined, auditCard, 'row-item');\n      const top = el('div', undefined, r, 'row-top');\n      el('strong', `[${CHANNEL_ZH[a.channel] || a.channel}] ${AUDIT_ACTION_ZH[a.action] || a.action}${a.version_name ? ' \u00b7 v' + a.version_name : ''}`, top);\n      el('span', a.result === 'ok' ? '\u6210\u529f' : '\u5931\u8d25', top, a.result === 'ok' ? 'badge badge-ok' : 'badge badge-danger');\n      el('p', fmtTime(a.at) + (a.policy_revision ? ` \u00b7 \u7b56\u7565\u5e8f\u5217\u53f7 #${a.policy_revision}` : ''), r, 'muted');\n    }\n  } else {\n    el('p', '\u6682\u65e0\u53d1\u5e03\u64cd\u4f5c\u8bb0\u5f55\u3002', auditCard, 'muted');\n  }\n\n  // \u7248\u672c\u53d1\u5e03\u9875\u9876\u90e8\u57fa\u7ebf\u6458\u8981\n  const pubSum = $('publish-summary');\n  pubSum.replaceChildren();\n  const sCard = el('div', undefined, pubSum, 'card');\n  el('h2', '\u7ebf\u4e0a\u6b63\u5f0f\u7248\u672c\u57fa\u7ebf', sCard);\n  el('p', stable ? `\u5f53\u524d\u6b63\u5f0f\u7248\uff1av${stable.version_name} (Build ${stable.version_code}) \u00b7 \u72b6\u6001\uff1a${formatReleaseStatusZh(stable)} \u00b7 \u53d1\u5e03\u4e8e ${fmtTime(stable.published_at)}` : '\u5f53\u524d\u5c1a\u672a\u53d1\u5e03\u6b63\u5f0f\u7ebf\u4e0a\u66f4\u65b0\u7248\u672c\u3002', sCard);\n  const permCard = el('div', undefined, pubSum, 'card');\n  el('h2', '\u8fdc\u7a0b\u53d1\u5e03\u5b89\u5168\u7b7e\u540d\u72b6\u6001', permCard);\n  el('p', ov.serviceHealth?.remotePublishReady ? '\u4e91\u7aef\u72ec\u7acb\u7b56\u7565\u7b7e\u540d\u670d\u52a1\u5df2\u5c31\u7eea\uff1a\u5ba1\u6838\u901a\u8fc7\u540e\u53ef\u901a\u8fc7\u7535\u8111\u6216\u624b\u673a\u8fdc\u7a0b\u786e\u8ba4\u6b63\u5f0f\u53d1\u5e03\u3001\u6682\u505c\u63a8\u9001\u6216\u7d27\u6025\u89e3\u9664\u5f3a\u5236\u66f4\u65b0\u3002' : '\u5f53\u524d\u672a\u914d\u7f6e\u4e91\u7aef\u72ec\u7acb\u7b7e\u540d\u5bc6\u94a5\uff1a\u4ec5\u5f00\u653e\u8fdc\u7a0b\u67e5\u770b\u4e0e\u5ba1\u6838\uff0c\u6b63\u5f0f\u53d1\u5e03\u6682\u4e0d\u53ef\u7528\u3002', permCard, ov.serviceHealth?.remotePublishReady ? '' : 'muted');\n\n  // \u670d\u52a1\u72b6\u6001\u4e0e\u514d\u8d39\u989d\u5ea6\u9875\n  const hBox = $('health-cards');\n  hBox.replaceChildren();\n  const h1 = el('div', undefined, hBox, 'card');\n  el('h2', 'Cloudflare Worker / D1 / \u79c1\u6709 R2 \u72b6\u6001', h1);\n  el('p', '\u53cd\u9988\u63a5\u6536\u603b\u5f00\u5173\uff1a' + (ov.serviceHealth?.uploadsEnabled ? '\u6b63\u5e38\u8fd0\u884c\u4e2d' : '\u5df2\u6682\u505c'), h1);\n  el('p', '\u79c1\u6709 R2 \u8bca\u65ad\u65e5\u5fd7\u5360\u7528\uff1a' + fmtBytes(ov.serviceHealth?.r2UsedBytes || 0) + ' / \u914d\u989d\u4e0a\u9650 ' + fmtBytes(ov.serviceHealth?.r2LimitBytes || 268435456), h1);\n  el('p', '\u96f6\u65b0\u589e\u56fa\u5b9a\u6210\u672c\u7ea6\u675f\uff1a\u5b8c\u5168\u8fd0\u884c\u4e8e Cloudflare \u514d\u8d39\u8ba1\u5212\u3001CNB \u516c\u5f00\u4ed3\u5e93\u4e0e GitHub \u4ed3\u5e93\uff0c\u672a\u7ed1\u5b9a\u4efb\u4f55\u4ed8\u8d39\u8d44\u6e90\u3002', h1, 'muted');\n  const h2 = el('div', undefined, hBox, 'card');\n  el('h2', 'CNB \u4e0e GitHub \u53d1\u5e03\u8282\u70b9\u5165\u53e3', h2);\n  el('p', 'CNB \u56fd\u5185\u4e3b\u53d1\u5e03\u4ed3\uff1ahttps://cnb.cool/tingyu-2026/releases', h2);\n  el('p', 'GitHub \u6e90\u7801\u4e0e\u5907\u7528\u53d1\u5e03\u4ed3\uff1ahttps://github.com/huleixin/folia-rear-lyrics', h2);\n  el('p', '\u81ea\u52a8\u5de1\u68c0\u673a\u5236\uff1aWorker \u6bcf 30 \u5206\u949f\u6267\u884c\u4e00\u6b21\u8f7b\u91cf\u5b57\u8282\u6d41\u63a2\u6d3b\u5e76\u540c\u6b65\u5b98\u65b9\u4e0b\u8f7d\u7edf\u8ba1\uff0c\u62d2\u7edd\u4f2a\u9020\u4e0d\u5b58\u5728\u7684\u8d26\u5355\u6216\u4e0b\u8f7d\u8ba1\u6570\u3002', h2, 'muted');\n\n  // \u66f4\u65b0\u7b56\u7565\u9875\n  const polList = $('policy-cards');\n  polList.replaceChildren();\n  for (const ch of ['stable', 'private_beta', 'testing']) {\n    const found = (ov.policies || []).find(x => x.channel === ch);\n    const card = el('div', undefined, polList, 'card');\n    el('h2', `${CHANNEL_ZH[ch]} \u5f53\u524d\u751f\u6548\u7b56\u7565`, card);\n    if (!found) {\n      el('p', '\u5f53\u524d\u6e20\u9053\u6682\u65e0\u5df2\u7b7e\u53d1\u7b56\u7565\u8bb0\u5f55\u3002', card, 'muted');\n    } else {\n      el('p', `\u7b56\u7565\u5e8f\u5217\u53f7\uff1a#${found.policyRevision}  |  \u5f53\u524d\u52a8\u4f5c\uff1a${POLICY_ACTION_ZH[found.policyAction] || found.policyAction}  |  \u63a8\u9001\u5f00\u542f\uff1a${found.updateEnabled ? '\u662f' : '\u5426'}`, card);\n      el('p', `\u6700\u65b0\u7248\u672c\uff1av${found.latestVersionName} (${found.latestVersionCode})  |  \u6700\u4f4e\u5141\u8bb8\u4f7f\u7528\u7248\u672c\uff1a${found.minSupportedVersionCode}`, card);\n      el('p', '\u53d7\u5f3a\u5236\u66f4\u65b0\u5f71\u54cd\u8303\u56f4\uff1a' + (found.updateEnabled && found.minSupportedVersionCode > 1 ? `versionCode < ${found.minSupportedVersionCode} \u7684\u65e7\u7248\u5ba2\u6237\u7aef` : '\u65e0\uff08\u5f53\u524d\u4e0d\u62e6\u622a\u4efb\u4f55\u65e7\u7248\u672c\uff09'), card, 'muted');\n      el('pre', JSON.stringify(found.nodeSync || {}, null, 2), card);\n    }\n  }\n\n  // \u4e0b\u8f7d\u8282\u70b9\u4e13\u9875\n  const nsCards = $('nodes-summary-cards');\n  nsCards.replaceChildren();\n  renderNodeCard(nsCards, cnbSummary);\n  renderNodeCard(nsCards, ghSummary);\n\n  const nBox = $('nodes-list');\n  nBox.replaceChildren();\n  if (!ov.nodes?.length) {\n    el('p', '\u6682\u65e0\u8282\u70b9\u5386\u53f2\u68c0\u6d4b\u8bb0\u5f55\u3002\u53ef\u70b9\u51fb\u53f3\u4e0a\u89d2\u300c\u7acb\u5373\u68c0\u6d4b\u5168\u90e8\u6d3b\u8dc3\u8282\u70b9\u300d\u6267\u884c\u63a2\u6d4b\u3002', nBox, 'muted');\n  } else {\n    for (const n of ov.nodes) {\n      const row = el('div', undefined, nBox, 'row-item');\n      const top = el('div', undefined, row, 'row-top');\n      el('strong', `${n.label}\uff08${n.release_id}\uff09`, top);\n      const stateLabel = !n.last_checked_at ? '\u68c0\u6d4b\u4e2d' : !n.accessible ? '\u5f02\u5e38' : (Date.now() - n.last_checked_at > 7200_000 ? '\u6570\u636e\u8fc7\u671f' : '\u6b63\u5e38');\n      el('span', `${stateLabel} \u00b7 HTTP ${n.http_status || 0} \u00b7 ${n.latency_ms || 0}ms`, top, n.accessible ? 'badge badge-ok' : 'badge badge-danger');\n      el('p', n.url, row, 'muted');\n      el('p', `\u6838\u9a8c\u5927\u5c0f\uff1a${fmtBytes(n.verified_size_bytes)} \u00b7 SHA-256 \u5b8c\u6574\u6838\u9a8c\uff1a${n.integrity_ok ? '\u5df2\u901a\u8fc7' : 'Range \u5b57\u8282\u63a2\u6d3b'} \u00b7 \u8bf4\u660e\uff1a${n.reason_zh || n.detail} \u00b7 \u68c0\u6d4b\u65f6\u95f4\uff1a${fmtTime(n.last_checked_at)}`, row, 'muted');\n    }\n  }\n}\n\n$('btn-probe-all-nodes').onclick = guarded(function () {\n  return triggerProbeAllNodes($('btn-probe-all-nodes'));\n});\n$('btn-sync-downloads').onclick = guarded(async () => {\n  const btn = $('btn-sync-downloads');\n  btn.disabled = true;\n  try {\n    showMessage('\u6b63\u5728\u4ece\u5b98\u65b9 Release \u63a5\u53e3\u540c\u6b65\u5404\u7248\u672c APK \u4e0b\u8f7d\u6b21\u6570\u2026');\n    await api('downloads/sync', { method: 'POST', body: '{}' });\n    await loadTelemetryOnly(true);\n    showMessage('\u5b98\u65b9\u4e0b\u8f7d\u6b21\u6570\u4e0e\u6bcf\u65e5\u5feb\u7167\u5df2\u540c\u6b65\u66f4\u65b0\uff01');\n  } finally {\n    btn.disabled = false;\n  }\n});\n\nfunction renderReleases(items) {\n  latestReleases = items || [];\n  const filterCh = $('release-channel-filter').value;\n  const list = $('releases-list');\n  list.replaceChildren();\n  const filtered = filterCh ? latestReleases.filter(r => r.channel === filterCh) : latestReleases;\n  if (!filtered.length) {\n    el('p', '\u6682\u65e0\u7248\u672c\u8bb0\u5f55\u3002', list, 'muted');\n  }\n  for (const r of filtered) {\n    const card = el('div', undefined, list, 'row-item');\n    const top = el('div', undefined, card, 'row-top');\n    el('strong', `[${CHANNEL_ZH[r.channel] || r.channel}] v${r.version_name} (Build ${r.version_code})`, top);\n    el('span', `${formatReleaseStatusZh(r)} \u00b7 ${r.force_update ? '\u5f3a\u5236\u66f4\u65b0' : '\u53ef\u9009\u66f4\u65b0'}`, top, r.status === 'published' ? 'badge badge-ok' : 'badge');\n    el('p', `\u5927\u5c0f\uff1a${fmtBytes(r.apk_size_bytes)} \u00b7 \u6700\u4f4e\u5141\u8bb8\u7248\u672c\uff1a${r.min_supported_version_code} \u00b7 Commit\uff1a${r.git_commit || '\u672a\u8bb0\u5f55'} \u00b7 SHA-256\uff1a${r.sha256.slice(0, 16)}\u2026`, card, 'muted');\n    el('p', r.release_notes || '\u65e0\u66f4\u65b0\u516c\u544a', card);\n    if (role === 'admin') {\n      const acts = el('div', undefined, card, 'action-row');\n      const probeBtn = el('button', '\u5b9e\u65f6\u63a2\u6d4b\u8be5\u7248\u672c\u8282\u70b9', acts, 'btn-secondary compact-btn');\n      probeBtn.type = 'button';\n      probeBtn.onclick = guarded(async () => {\n        probeBtn.disabled = true;\n        try {\n          const res = await api('nodes/probe', { method: 'POST', body: JSON.stringify({ releaseId: r.id }) });\n          showMessage('\u8282\u70b9\u63a2\u6d4b\u5b8c\u6210\uff1a' + res.items.map(i => i.label + '=' + (i.accessible ? `\u6b63\u5e38 (${i.latencyMs}ms)` : i.detail)).join('\uff0c'));\n          await loadAll();\n        } finally {\n          probeBtn.disabled = false;\n        }\n      });\n      if (r.status !== 'published' && r.status !== 'withdrawn') {\n        const testOkBtn = el('button', '\u6807\u8bb0\u771f\u673a\u6d4b\u8bd5\u901a\u8fc7', acts, 'btn-secondary compact-btn');\n        testOkBtn.type = 'button';\n        testOkBtn.onclick = guarded(async () => {\n          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'mark_tested' }) });\n          showMessage('\u5df2\u6807\u8bb0 v' + r.version_name + ' \u6d4b\u8bd5\u901a\u8fc7');\n          await loadAll();\n        });\n        const approveBtn = el('button', '\u5ba1\u6838\u786e\u8ba4\u5019\u9009\u7248\u672c', acts, 'btn-primary compact-btn');\n        approveBtn.type = 'button';\n        approveBtn.onclick = guarded(async () => {\n          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'approve' }) });\n          showMessage('\u5df2\u5b8c\u6210\u5ba1\u6838\u5e76\u7ed1\u5b9a APK SHA-256 \u6458\u8981\uff0c\u73b0\u5728\u53ef\u5728\u300c\u7248\u672c\u53d1\u5e03\u300d\u9762\u677f\u786e\u8ba4\u6b63\u5f0f\u53d1\u5e03\u3002');\n          await loadAll();\n        });\n        const withdrawBtn = el('button', '\u64a4\u56de\u5019\u9009', acts, 'btn-danger compact-btn');\n        withdrawBtn.type = 'button';\n        withdrawBtn.onclick = guarded(async () => {\n          await api('releases/' + r.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'withdraw' }) });\n          showMessage('\u5df2\u64a4\u56de\u5019\u9009\u7248\u672c ' + r.id);\n          await loadAll();\n        });\n      }\n    }\n  }\n\n  const wb = $('approval-workbench');\n  wb.replaceChildren();\n  const candidates = latestReleases.filter(r => r.status !== 'published' && r.status !== 'withdrawn');\n  for (const c of candidates) {\n    const card = el('div', undefined, wb, 'card');\n    el('h2', `\u5f85\u53d1\u5e03\u5019\u9009\uff1a[${CHANNEL_ZH[c.channel] || c.channel}] v${c.version_name} (${c.version_code}) \u00b7 \u5f53\u524d\u72b6\u6001\uff1a${formatReleaseStatusZh(c)}`, card);\n    const affectedText = c.force_update\n      ? `\u5f3a\u5236\u66f4\u65b0\u5f71\u54cd\u8303\u56f4\uff1a\u6240\u6709 versionCode < ${c.min_supported_version_code} \u7684\u65e7\u7248\u5ba2\u6237\u7aef\u5c06\u88ab\u8981\u6c42\u66f4\u65b0`\n      : `\u53ef\u9009\u66f4\u65b0\uff1a\u5141\u8bb8\u7528\u6237\u7a0d\u540e\u63d0\u9192\uff08\u4ec5 versionCode < ${c.min_supported_version_code} \u53d7\u6700\u4f4e\u7248\u672c\u9650\u5236\uff09`;\n    el('p', affectedText, card, 'badge badge-warn');\n    el('p', '\u7ed1\u5b9a SHA-256\uff1a' + c.sha256, card, 'muted');\n    el('p', '\u5ba1\u6279\u6458\u8981\uff1a' + (c.approved_digest || '\u5c1a\u672a\u5ba1\u6838\u786e\u8ba4\uff08\u8bf7\u5148\u70b9\u51fb\u4e0b\u65b9\u300c1. \u5ba1\u6838\u786e\u8ba4\u5019\u9009\u300d\u7ed1\u5b9a\u5f53\u524d\u53c2\u6570\u4e0e\u5b89\u88c5\u5305\uff09'), card, 'muted');\n    el('pre', c.release_notes, card);\n\n    if (role === 'admin') {\n      const row = el('div', undefined, card, 'form-grid');\n      const secLabel = el('label', '\u72ec\u7acb\u53d1\u5e03\u786e\u8ba4\u5bc6\u94a5', row, 'span-full');\n      const secInput = el('input', undefined, secLabel);\n      secInput.type = 'password';\n      secInput.autocomplete = 'off';\n      secInput.placeholder = '\u5ba1\u6838\u901a\u8fc7\u540e\uff0c\u8f93\u5165\u72ec\u7acb\u53d1\u5e03\u786e\u8ba4\u5bc6\u94a5\u4ee5\u7b7e\u53d1\u6b63\u5f0f\u914d\u7f6e';\n\n      const acts = el('div', undefined, card, 'action-row');\n      const btnApprove = el('button', '1. \u5ba1\u6838\u786e\u8ba4\u5019\u9009', acts, 'btn-secondary');\n      btnApprove.type = 'button';\n      btnApprove.onclick = guarded(async () => {\n        await api('releases/' + c.id, { method: 'PATCH', body: JSON.stringify({ reviewAction: 'approve' }) });\n        showMessage('\u5019\u9009\u7248\u672c\u5df2\u5ba1\u6838\u9501\u5b9a\u6458\u8981\uff01');\n        await loadAll();\n      });\n\n      const btnPublish = el('button', '2. \u786e\u8ba4\u6b63\u5f0f\u53d1\u5e03\uff08\u7b7e\u540d\u5e76\u63a8\u9001\u7b56\u7565\uff09', acts, 'btn-primary');\n      btnPublish.type = 'button';\n      btnPublish.disabled = c.status !== 'approved' || !remotePublishReady;\n      btnPublish.onclick = guarded(async () => {\n        const secret = secInput.value.trim();\n        if (!secret) throw Error('\u8bf7\u8f93\u5165\u72ec\u7acb\u53d1\u5e03\u786e\u8ba4\u5bc6\u94a5');\n        secInput.value = '';\n        await api('releases/' + c.id + '/publish', {\n          method: 'POST',\n          headers: { 'X-Publish-Secret': secret },\n          body: JSON.stringify({\n            confirmNonce: randomNonce(),\n            expectedDigest: c.approved_digest,\n            expectedSha256: c.sha256\n          })\n        });\n        showMessage(`\u6b63\u5f0f\u53d1\u5e03\u6210\u529f\uff1a[${CHANNEL_ZH[c.channel] || c.channel}] v${c.version_name} \u7b7e\u540d\u66f4\u65b0\u7b56\u7565\u5df2\u751f\u6548\uff01`);\n        await loadAll();\n      });\n    }\n  }\n}\n\nfunction renderAuditLogs(items) {\n  const box = $('audit-list');\n  box.replaceChildren();\n  if (!items?.length) {\n    el('p', '\u6682\u65e0\u53d1\u5e03\u4e0e\u7b56\u7565\u64cd\u4f5c\u8bb0\u5f55\u3002', box, 'muted');\n    return;\n  }\n  for (const a of items) {\n    const row = el('div', undefined, box, 'row-item');\n    const top = el('div', undefined, row, 'row-top');\n    el('strong', `#${a.seq} \u00b7 [${CHANNEL_ZH[a.channel] || a.channel}] ${AUDIT_ACTION_ZH[a.action] || a.action}${a.version_name ? ` \u00b7 v${a.version_name} (${a.version_code})` : ''}`, top);\n    const roleZh = a.actor_role === 'admin' ? '\u7ba1\u7406\u5458' : a.actor_role === 'prepare' ? '\u53d1\u5e03\u51c6\u5907\u51ed\u636e' : a.actor_role;\n    el('span', `${a.result === 'ok' ? '\u6210\u529f' : '\u5931\u8d25'} \u00b7 ${roleZh}${a.policy_revision ? ` \u00b7 \u7b56\u7565 #${a.policy_revision}` : ''}`, top, a.result === 'ok' ? 'badge badge-ok' : 'badge badge-danger');\n    el('p', '\u65f6\u95f4\uff1a' + fmtTime(a.at) + ' \u00b7 \u94fe\u54c8\u5e0c\uff1a' + a.entry_hash.slice(0, 20) + '\u2026 (\u524d\u5e8f ' + a.prev_hash.slice(0, 12) + '\u2026)', row, 'muted');\n  }\n}\n\nfunction renderAiCollaboration() {\n  const box = $('ai-commands');\n  box.replaceChildren();\n  const cmds = [\n    ['\u6253\u5305\u6b63\u5f0f\u5019\u9009\u5b89\u88c5\u5305\uff08\u4ec5\u672c\u5730\u6784\u5efa\uff0c\u4e0d\u4e0a\u4f20\u4e0d\u63a8\u9001\uff09', 'node tools/release-cli.mjs build'],\n    ['\u51c6\u5907\u53d1\u5e03\u5019\u9009\u8bb0\u5f55\uff08\u81ea\u52a8\u6c47\u603b Git \u63d0\u4ea4\u4e0e\u5173\u8054\u53cd\u9988\u751f\u6210\u66f4\u65b0\u516c\u544a\uff09', 'node tools/release-cli.mjs prepare --channel stable'],\n    ['\u4e0a\u4f20\u6d4b\u8bd5\u901a\u9053\u5019\u9009\u5e76\u5b8c\u6574\u4e0b\u8f7d\u56de\u9a8c SHA-256\uff08\u4e0d\u89e6\u53d1\u6b63\u5f0f\u901a\u9053\u66f4\u65b0\uff09', 'node tools/release-cli.mjs upload --channel testing && node tools/release-cli.mjs verify --channel testing'],\n    ['\u53ea\u8bfb\u68c0\u67e5\u7ebf\u4e0a\u53d1\u5e03\u3001\u4e0b\u8f7d\u8282\u70b9\u4e0e\u7b56\u7565\u72b6\u6001', 'node tools/release-cli.mjs status'],\n    ['\u5c06\u4e91\u7aef\u5df2\u7b7e\u53d1\u7b56\u7565\u955c\u50cf\u540c\u6b65\u81f3 CNB \u4e0e GitHub \u9759\u6001\u4ed3\u5e93\u6587\u4ef6', 'node tools/release-cli.mjs sync-manifests'],\n    ['\u62c9\u53d6\u8fd1\u671f\u4e91\u7aef\u7528\u6237\u53cd\u9988\u4e0e\u8131\u654f\u8bca\u65ad\u6458\u8981', 'python tools/feedback.py pull --hours 72 && python tools/feedback.py summary'],\n  ];\n  for (const [title, cmd] of cmds) {\n    const item = el('div', undefined, box, 'row-item');\n    const top = el('div', undefined, item, 'row-top');\n    el('strong', title, top);\n    const copyBtn = el('button', '\u590d\u5236\u547d\u4ee4', top, 'btn-secondary compact-btn');\n    copyBtn.type = 'button';\n    copyBtn.onclick = guarded(async () => {\n      await navigator.clipboard.writeText(cmd);\n      showMessage('\u5df2\u590d\u5236\u547d\u4ee4\uff1a' + cmd);\n    });\n    el('pre', cmd, item);\n  }\n}\n\nasync function showFeedbackDetail(id) {\n  const r = await api('feedback/' + id);\n  const body = $('detailbody');\n  body.replaceChildren();\n  $('detail-title').textContent = '\u53cd\u9988\u8be6\u60c5 \u00b7 ' + r.id;\n  el('p', (TYPES[r.category] || r.category) + ' \u00b7 ' + (STATUSES[r.status] || r.status) + ' \u00b7 \u7248\u672c ' + r.version + ' (' + r.version_code + ') \u00b7 \u8bbe\u5907 ' + r.model + ' / Android ' + r.os, body, 'muted');\n  el('p', r.description, body);\n  if (r.steps) {\n    el('h3', '\u590d\u73b0\u6b65\u9aa4', body);\n    el('p', r.steps, body);\n  }\n  el('h3', '\u73af\u5883\u5143\u6570\u636e', body);\n  el('pre', JSON.stringify(JSON.parse(r.metadata || '{}'), null, 2), body);\n  el('p', '\u63d0\u4ea4\u6e90\u7801\uff1a' + (r.git_commit || '-') + ' \u00b7 \u4fee\u590d\u6e90\u7801\uff1a' + (r.fix_commit || '-'), body, 'muted');\n  if (r.fix_note) el('p', '\u4fee\u590d\u5907\u6ce8\uff1a' + r.fix_note, body);\n\n  if (r.history?.length) {\n    el('h3', '\u72b6\u6001\u6d41\u8f6c\u8bb0\u5f55', body);\n    for (const h of r.history) {\n      el('p', fmtTime(h.at) + ' \u00b7 ' + (STATUSES[h.status] || h.status) + ' \u00b7 ' + h.git_commit + ' \u00b7 ' + h.note, body, 'muted');\n    }\n  }\n\n  if (r.log_bytes) {\n    const logActions = el('div', undefined, body, 'action-row');\n    const view = el('button', '\u67e5\u770b\u8bca\u65ad\u65e5\u5fd7 (' + fmtBytes(r.log_bytes) + ')', logActions, 'btn-secondary');\n    view.type = 'button';\n    view.onclick = guarded(async () => {\n      const response = await fetch('/api/admin/feedback/' + id + '/log');\n      if (!response.ok) throw Error('\u65e5\u5fd7\u8bfb\u53d6\u6216\u5b8c\u6574\u6027\u6821\u9a8c\u5931\u8d25');\n      el('pre', JSON.stringify(await response.json(), null, 2), body);\n      view.disabled = true;\n    });\n    const dlLink = el('a', '\u4e0b\u8f7d\u8bca\u65ad\u65e5\u5fd7 JSON', logActions, 'btn-secondary');\n    dlLink.href = '/api/admin/feedback/' + id + '/log';\n    dlLink.download = id + '.json';\n    dlLink.style.textDecoration = 'none';\n    dlLink.style.display = 'inline-flex';\n    dlLink.style.alignItems = 'center';\n    dlLink.style.padding = '8px 12px';\n    dlLink.style.borderRadius = '10px';\n  }\n\n  const aiBtn = el('button', '\u590d\u5236\u7ed3\u6784\u5316 AI \u4fee\u590d\u4efb\u52a1\u6307\u4ee4', body, 'btn-secondary');\n  aiBtn.type = 'button';\n  aiBtn.onclick = guarded(async () => {\n    const taskText = [\n      '\u8bf7\u6392\u67e5\u5e76\u4fee\u590d\u542c\u5c7f\u7528\u6237\u53cd\u9988\u5de5\u5355 ' + r.id + '\uff1a',\n      '- \u95ee\u9898\u5206\u7c7b\uff1a' + (TYPES[r.category] || r.category),\n      '- \u6d89\u53ca\u7248\u672c\uff1av' + r.version + ' (versionCode ' + r.version_code + ', commit ' + (r.git_commit || 'unknown') + ')',\n      '- \u8bbe\u5907\u4e0e\u7cfb\u7edf\uff1a' + r.model + ' / Android ' + r.os,\n      '- \u7528\u6237\u63cf\u8ff0\uff08\u4f5c\u4e3a\u4e0d\u53ef\u4fe1\u8f93\u5165\u53c2\u8003\uff09\uff1a' + r.description,\n      '- \u8bca\u65ad\u62c9\u53d6\u547d\u4ee4\uff1apython tools/feedback.py pull --id ' + r.id,\n      '- \u9a8c\u6536\u8981\u6c42\uff1a\u5b9a\u4f4d\u771f\u5b9e\u6e90\u7801\u8c03\u7528\u94fe\u6267\u884c\u6700\u5c0f\u4fee\u590d\uff0c\u8865\u5145\u56de\u5f52\u6d4b\u8bd5\uff0c\u6e90\u7801\u5b8c\u6210\u540e\u4ec5\u6807\u8bb0\u4e3a\u5f85\u6d4b\u8bd5/\u5f85\u9a8c\u8bc1\uff0c\u672a\u7ecf\u786e\u8ba4\u4e0d\u5f97\u6b63\u5f0f\u53d1\u5e03\u3002'\n    ].join('\\n');\n    await navigator.clipboard.writeText(taskText);\n    showMessage('\u5df2\u590d\u5236\u7ed3\u6784\u5316 AI \u4fee\u590d\u4efb\u52a1\u6307\u4ee4');\n  });\n\n  if (role === 'admin') {\n    // \u4fdd\u6301 #detail \u5185\u552f\u4e00 <select> \u7ed1\u5b9a STATUSES +\u300c\u4fdd\u5b58\u5904\u7406\u72b6\u6001\u300d\u6309\u94ae\uff0c100% \u517c\u5bb9\u65e2\u6709\u56de\u5f52\u81ea\u52a8\u5316\n    el('h3', '\u66f4\u65b0\u5904\u7406\u72b6\u6001\u4e0e\u4fee\u590d\u63d0\u4ea4', body);\n    const form = el('form', undefined, body, 'form-grid');\n    const select = el('select', undefined, form);\n    fillSelect(select, STATUSES, false);\n    select.value = r.status;\n    select.setAttribute('aria-label', '\u5904\u7406\u72b6\u6001');\n    const commit = el('input', undefined, form);\n    commit.placeholder = '\u5173\u8054\u4fee\u590d commit';\n    commit.value = r.fix_commit || '';\n    const note = el('textarea', undefined, form, 'span-full');\n    note.placeholder = '\u4fee\u590d\u8bb0\u5f55 / \u771f\u673a\u9a8c\u8bc1\u4f9d\u636e\uff08\u6e90\u7801\u4fee\u6539\u4e0d\u7b49\u540c\u4e8e\u5df2\u9a8c\u8bc1\u89e3\u51b3\uff09';\n    note.value = r.fix_note || '';\n    const saveBtn = el('button', '\u4fdd\u5b58\u5904\u7406\u72b6\u6001', form, 'btn-primary span-full');\n    saveBtn.type = 'submit';\n    form.onsubmit = guarded(async () => {\n      await api('feedback/' + id, {\n        method: 'PATCH',\n        body: JSON.stringify({ status: select.value, commit: commit.value.trim(), note: note.value })\n      });\n      showMessage('\u5df2\u4fdd\u5b58\u53cd\u9988\u5904\u7406\u72b6\u6001');\n      await loadAll();\n      $('detail').close();\n    });\n\n    el('h3', '\u5173\u8054\u5f85\u4fee\u590d\u7248\u672c / \u95ee\u9898\u5f52\u5e76', body);\n    const linkForm = el('form', undefined, body, 'form-grid');\n    let selectedStage = r.link?.workflow_stage || 'confirmed';\n    const stageRow = el('div', undefined, linkForm, 'action-row span-full');\n    const stageButtons = [];\n    for (const [stageKey, stageLabel] of Object.entries(STAGES)) {\n      const chip = el('button', stageLabel, stageRow, stageKey === selectedStage ? 'btn-primary' : 'btn-secondary');\n      chip.type = 'button';\n      chip.onclick = () => {\n        selectedStage = stageKey;\n        for (const [bKey, bEl] of stageButtons) {\n          bEl.className = bKey === selectedStage ? 'btn-primary' : 'btn-secondary';\n        }\n      };\n      stageButtons.push([stageKey, chip]);\n    }\n    const targetInput = el('input', undefined, linkForm);\n    targetInput.placeholder = '\u8ba1\u5212\u4fee\u590d\u7248\u672c\uff08\u5982 1.5.82\uff09';\n    targetInput.value = r.link?.target_version || '';\n    const fixedInput = el('input', undefined, linkForm);\n    fixedInput.placeholder = '\u5b9e\u9645\u5df2\u4fee\u590d\u7248\u672c';\n    fixedInput.value = r.link?.fixed_version || '';\n    const mergeInput = el('input', undefined, linkForm);\n    mergeInput.placeholder = '\u5408\u5e76\u81f3\u76ee\u6807 Issue ID\uff08\u53ef\u9009\uff09';\n    mergeInput.value = r.link?.merged_issue_id || '';\n    const linkBtn = el('button', '\u4fdd\u5b58\u7248\u672c\u5173\u8054', linkForm, 'btn-secondary span-full');\n    linkBtn.type = 'submit';\n    linkForm.onsubmit = guarded(async () => {\n      await api('feedback/' + id + '/link', {\n        method: 'PATCH',\n        body: JSON.stringify({\n          workflowStage: selectedStage,\n          targetVersion: targetInput.value.trim(),\n          fixedVersion: fixedInput.value.trim(),\n          mergedIssueId: mergeInput.value.trim()\n        })\n      });\n      showMessage('\u5df2\u66f4\u65b0\u53cd\u9988\u4e0e\u7248\u672c\u5173\u8054\u5173\u7cfb');\n      await loadAll();\n    });\n  }\n  $('detail').showModal();\n}\n\nfunction buildTelemetryUrl(fresh = false) {\n  const p = new URLSearchParams({ range: trendRange });\n  if (trendRange === 'custom') {\n    if (customSince) p.set('since', customSince);\n    if (customUntil) p.set('until', customUntil);\n  }\n  if (fresh) p.set('fresh', '1');\n  return 'telemetry/summary?' + p.toString();\n}\n\nasync function loadTelemetryOnly(fresh = false) {\n  const tel = await api(buildTelemetryUrl(fresh));\n  renderTelemetrySections(tel);\n}\n\n\nfunction renderFeedbackItems(payload, append) {\n  const allItems = payload?.items || [];\n  const isOverviewCompact = currentView === 'overview' && !query;\n  const visibleItems = isOverviewCompact ? allItems.slice(0, 3) : allItems;\n  if (!append || isOverviewCompact) {\n    $('feedback').replaceChildren();\n  }\n  if (!visibleItems.length) {\n    el('p', '\u6682\u65e0\u5339\u914d\u7684\u53cd\u9988\u8bb0\u5f55\u3002', $('feedback'), 'muted');\n  }\n  for (const r of visibleItems) {\n    const card = el('article', undefined, $('feedback'), 'row-item');\n    const top = el('div', undefined, card, 'row-top');\n    el('strong', (TYPES[r.category] || r.category) + ' \u00b7 ' + (STATUSES[r.status] || r.status) + (r.workflow_stage ? (' \u00b7 ' + (STAGES[r.workflow_stage] || r.workflow_stage)) : ''), top);\n    if (r.target_version || r.fixed_version) {\n      el('span', (r.fixed_version ? ('\u5df2\u4fee\u590d\u4e8e v' + r.fixed_version) : ('\u5f85\u4fee\u590d v' + r.target_version)), top, 'badge');\n    }\n    el('p', r.description, card);\n    el('p', 'v' + r.version + ' / ' + r.model + ' / Android ' + r.os + ' \u00b7 ' + fmtTime(r.created_at) + (r.log_bytes ? (' \u00b7 \u8bca\u65ad\u65e5\u5fd7 ' + fmtBytes(r.log_bytes)) : ''), card, 'muted');\n    const b = el('button', r.id, card, 'btn-secondary compact-btn');\n    b.type = 'button';\n    b.onclick = guarded(() => showFeedbackDetail(r.id));\n  }\n  if (isOverviewCompact && allItems.length > 3) {\n    const viewAllBtn = el('button', '\u67e5\u770b\u5168\u90e8\u7528\u6237\u53cd\u9988\u5de5\u5355 \u2192', $('feedback'), 'btn-secondary full');\n    viewAllBtn.type = 'button';\n    viewAllBtn.onclick = () => switchView('feedback');\n  }\n  cursor = payload?.nextCursor || null;\n  $('more').hidden = isOverviewCompact || !cursor;\n}\n\nasync function loadAll(append = false) {\n  const [s, f, i, ov, rels, audits, betaOv, tel] = await Promise.all([\n    api('stats'),\n    api('feedback?' + query + (append && cursor ? '&cursor=' + encodeURIComponent(cursor) : '')),\n    api('issues?' + query),\n    api('overview'),\n    api('releases'),\n    api('audit?limit=40'),\n    api('beta/overview'),\n    api(buildTelemetryUrl(false)),\n  ]);\n\n  renderTelemetrySections(tel);\n  renderOverview(ov);\n  renderReleases(rels.items || []);\n  renderAuditLogs(audits.items || []);\n  renderBetaView(betaOv);\n  renderAiCollaboration();\n\n  const distBox = $('distributions');\n  distBox.replaceChildren();\n  for (const [key, rows] of Object.entries(s.distributions || {})) {\n    const box = el('div', undefined, distBox, 'card');\n    el('h2', DIST_KEY_ZH[key] || ('\u7ef4\u5ea6\uff1a' + key), box);\n    if (!rows.length) el('p', '\u6682\u65e0\u8bb0\u5f55', box, 'muted');\n    for (const r of rows) {\n      const lbl = key === 'categories' ? (TYPES[r.label] || r.label) : key === 'statuses' ? (STATUSES[r.label] || r.label) : r.label;\n      el('p', lbl + ' \u00b7 ' + r.count + ' \u6761', box);\n    }\n  }\n\n  latestFeedbackPayload = append && latestFeedbackPayload\n    ? { items: [...latestFeedbackPayload.items, ...(f.items || [])], nextCursor: f.nextCursor }\n    : f;\n  renderFeedbackItems(latestFeedbackPayload, append);\n  if (!append) $('logs-list').replaceChildren();\n  for (const r of (f.items || [])) {\n    if (r.log_bytes > 0) {\n      const lcard = el('article', undefined, $('logs-list'), 'row-item');\n      const ltop = el('div', undefined, lcard, 'row-top');\n      el('strong', r.id + ' \u00b7 ' + (TYPES[r.category] || r.category) + ' (' + fmtBytes(r.log_bytes) + ')', ltop);\n      const lb = el('button', '\u6253\u5f00\u65e5\u5fd7\u8be6\u60c5', ltop, 'btn-secondary compact-btn');\n      lb.type = 'button';\n      lb.onclick = guarded(() => showFeedbackDetail(r.id));\n      el('p', '\u7248\u672c v' + r.version + ' \u00b7 \u8bbe\u5907 ' + r.model + ' \u00b7 ' + r.description, lcard, 'muted');\n    }\n  }\n  if (!$('logs-list').children.length) {\n    el('p', '\u5f53\u524d\u7b5b\u9009\u8303\u56f4\u5185\u6682\u65e0\u9644\u5e26\u8bca\u65ad\u65e5\u5fd7\u7684\u8bb0\u5f55\u3002', $('logs-list'), 'muted');\n  }\n\n  latestIssues = i.items || [];\n  const issBox = $('issues');\n  issBox.replaceChildren();\n  if (!latestIssues.length) {\n    el('p', '\u6682\u65e0\u805a\u5408\u95ee\u9898\u8bb0\u5f55\u3002', issBox, 'muted');\n  }\n  for (const r of latestIssues) {\n    const card = el('article', undefined, issBox, 'row-item');\n    const top = el('div', undefined, card, 'row-top');\n    let feature = '';\n    try { feature = JSON.parse(r.example_metadata || '{}').feature || ''; } catch {}\n    el('strong', (r.note_title || ((TYPES[r.category] || r.category) + (feature ? ' \u00b7 ' + feature : ''))) + ' \u00b7 ' + r.feedback_count + ' \u6761\u53cd\u9988', top);\n    el('span', (r.workflow_stage ? (STAGES[r.workflow_stage] || r.workflow_stage) : ('\u5f85\u5904\u7406 ' + r.pending + ' \u6761')) + (r.target_version ? (' \u00b7 \u76ee\u6807 v' + r.target_version) : ''), top, 'badge');\n    el('p', '\u6d89\u53ca\u7248\u672c\uff1a' + r.versions + ' \u00b7 \u73af\u5883\u7ec4\u5408\u6570\uff1a' + r.environment_count + ' \u00b7 \u6700\u8fd1\u51fa\u73b0\uff1a' + fmtTime(r.last_seen), card, 'muted');\n    if (r.sample_description) el('p', '\u4ee3\u8868\u6027\u63cf\u8ff0\uff1a' + r.sample_description, card);\n    const acts = el('div', undefined, card, 'action-row');\n    const copyCmd = el('button', '\u590d\u5236 AI \u6392\u67e5\u4fee\u590d\u4efb\u52a1', acts, 'btn-secondary compact-btn');\n    copyCmd.type = 'button';\n    copyCmd.onclick = guarded(async () => {\n      await navigator.clipboard.writeText(\n        '\u68c0\u67e5\u542c\u5c7f\u805a\u5408\u95ee\u9898 ' + r.issue_id + '\uff08\u6d89\u53ca\u7248\u672c ' + r.versions + '\uff0c\u5171 ' + r.feedback_count + ' \u6761\u771f\u5b9e\u53cd\u9988\uff09\u3002\u5148\u8fd0\u884c python tools/feedback.py pull --issue ' + r.issue_id + '\uff0c\u4ec5\u4f9d\u636e\u771f\u5b9e\u6808\u4e0e\u8c03\u7528\u94fe\u6267\u884c\u6700\u5c0f\u4fee\u590d\u5e76\u8865\u5145\u56de\u5f52\u6d4b\u8bd5\uff0c\u6e90\u7801\u5b8c\u6210\u540e\u6807\u8bb0\u4e3a\u5f85\u6d4b\u8bd5\uff0c\u7981\u6b62\u81ea\u52a8\u53d1\u5e03\u6b63\u5f0f\u7248\u3002'\n      );\n      showMessage('\u5df2\u590d\u5236\u805a\u5408\u95ee\u9898 AI \u6392\u67e5\u6307\u4ee4');\n    });\n  }\n}\n\n$('candidate-form').onsubmit = guarded(async e => {\n  if (role !== 'admin') throw Error('\u9700\u8981\u7ba1\u7406\u5458\u6743\u9650');\n  const fd = new FormData(e.target);\n  const cnbUrl = String(fd.get('cnbUrl') || '').trim();\n  const githubUrl = String(fd.get('githubUrl') || '').trim();\n  const downloadUrls = [{ id: 'cnb-primary', label: 'CNB \u56fd\u5185\u9ad8\u901f\u4e3b\u8282\u70b9', url: cnbUrl, priority: 1 }];\n  if (githubUrl) downloadUrls.push({ id: 'github-backup', label: 'GitHub \u5907\u7528\u8282\u70b9', url: githubUrl, priority: 2 });\n\n  const payload = {\n    channel: String(fd.get('channel') || 'testing'),\n    versionName: String(fd.get('versionName') || '').trim(),\n    versionCode: Number(fd.get('versionCode')),\n    apkSizeBytes: Number(fd.get('apkSizeBytes')),\n    sha256: String(fd.get('sha256') || '').trim().toLowerCase(),\n    gitCommit: String(fd.get('gitCommit') || '').trim(),\n    cnbTag: String(fd.get('cnbTag') || '').trim(),\n    forceUpdate: fd.get('forceUpdate') === 'true',\n    minSupportedVersionCode: Number(fd.get('minSupportedVersionCode')),\n    releaseNotes: String(fd.get('releaseNotes') || ''),\n    downloadUrls,\n  };\n  await api('releases/candidates', { method: 'POST', body: JSON.stringify(payload) });\n  showMessage('\u5019\u9009\u7248\u672c\u5df2\u4fdd\u5b58\uff0c\u8bf7\u524d\u5f80\u4e0b\u65b9\u5de5\u4f5c\u53f0\u6267\u884c\u8282\u70b9\u63a2\u6d4b\u4e0e\u4eba\u5de5\u5ba1\u6838\u786e\u8ba4\u3002');\n  await loadAll();\n});\n\n$('release-channel-filter').onchange = () => renderReleases(latestReleases);\n\n$('btn-pause-channel').onclick = guarded(async () => {\n  const ch = $('policy-ctl-channel').value;\n  const secret = $('policy-ctl-secret').value.trim();\n  if (!secret) throw Error('\u8bf7\u8f93\u5165\u72ec\u7acb\u53d1\u5e03\u786e\u8ba4\u5bc6\u94a5');\n  $('policy-ctl-secret').value = '';\n  await api('policy/' + ch + '/pause', {\n    method: 'POST',\n    headers: { 'X-Publish-Secret': secret },\n    body: JSON.stringify({ confirmNonce: randomNonce(), reason: $('policy-ctl-reason').value.trim() })\n  });\n  showMessage(`\u5df2\u6682\u505c [${CHANNEL_ZH[ch] || ch}] \u7684\u65b0\u7248\u672c\u66f4\u65b0\u63a8\u9001\u3002`);\n  await loadAll();\n});\n\n$('btn-unlock-channel').onclick = guarded(async () => {\n  const ch = $('policy-ctl-channel').value;\n  const secret = $('policy-ctl-secret').value.trim();\n  if (!secret) throw Error('\u8bf7\u8f93\u5165\u72ec\u7acb\u53d1\u5e03\u786e\u8ba4\u5bc6\u94a5');\n  $('policy-ctl-secret').value = '';\n  await api('policy/' + ch + '/unlock', {\n    method: 'POST',\n    headers: { 'X-Publish-Secret': secret },\n    body: JSON.stringify({ confirmNonce: randomNonce(), safeMinVersionCode: 1, reason: $('policy-ctl-reason').value.trim() || '\u7ba1\u7406\u5458\u7d27\u6025\u89e3\u9664\u5f3a\u5236\u66f4\u65b0\u9650\u5236' })\n  });\n  showMessage(`\u5df2\u7b7e\u53d1\u7d27\u6025\u89e3\u9664\u7b56\u7565\uff1a[${CHANNEL_ZH[ch] || ch}] \u6240\u6709\u65e7\u7248\u672c\u5ba2\u6237\u7aef\u91cd\u65b0\u68c0\u67e5\u540e\u5c06\u7acb\u5373\u89e3\u9664\u5f3a\u5236\u66f4\u65b0\u62e6\u622a\uff01`);\n  await loadAll();\n});\n\nasync function makePairing(targetRole) {\n  const res = await api('pairings', { method: 'POST', body: JSON.stringify({ role: targetRole }) });\n  const out = $('pairing-output');\n  out.textContent = '\u5355\u6b21 5 \u5206\u949f\u5b89\u5168\u767b\u5f55\u94fe\u63a5\uff08\u6253\u5f00\u5373\u9500\u6bc1\uff0c\u8bf7\u52ff\u516c\u5f00\u5206\u4eab\uff09\uff1a\\n' + res.url;\n  out.hidden = false;\n  try { await navigator.clipboard.writeText(res.url); showMessage('\u5df2\u751f\u6210\u5e76\u590d\u5236\u624b\u673a\u7aef 5 \u5206\u949f\u4e00\u6b21\u6027\u767b\u5f55\u94fe\u63a5'); }\n  catch { showMessage('\u5df2\u751f\u6210\u4e00\u6b21\u6027\u767b\u5f55\u94fe\u63a5'); }\n}\n$('btn-make-admin-pairing').onclick = guarded(() => makePairing('admin'));\n$('btn-make-read-pairing').onclick = guarded(() => makePairing('read'));\n\n$('btn-enable-uploads').onclick = guarded(async () => {\n  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: true }) });\n  showMessage('\u5df2\u5f00\u542f\u5ba2\u6237\u7aef\u4e91\u7aef\u53cd\u9988\u4e0a\u4f20\u3002');\n  await loadAll();\n});\n$('btn-disable-uploads').onclick = guarded(async () => {\n  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: false }) });\n  showMessage('\u5df2\u6682\u505c\u5ba2\u6237\u7aef\u4e91\u7aef\u53cd\u9988\u4e0a\u4f20\uff1b\u65e2\u6709\u6570\u636e\u4ecd\u53ef\u6b63\u5e38\u6d4f\u89c8\u3002');\n  await loadAll();\n});\n\nasync function enterConsole() {\n  const s = await api('session');\n  role = s.role;\n  remotePublishReady = Boolean(s.remotePublishReady);\n  $('login-wrap').hidden = true;\n  $('dashboard').hidden = false;\n  $('role-badge').textContent = role === 'admin' ? '\u7ba1\u7406\u5458' : '\u53ea\u8bfb';\n  $('pause').hidden = role !== 'admin';\n  $('btn-probe-all-nodes').hidden = role !== 'admin';\n  $('btn-sync-downloads').hidden = role !== 'admin';\n  switchView('overview');\n  await loadAll();\n}\n\n$('login').onsubmit = guarded(async () => {\n  const token = $('token').value;\n  $('token').value = '';\n  await api('login', { method: 'POST', body: JSON.stringify({ token }) });\n  await enterConsole();\n  showMessage('\u6b22\u8fce\u8fdb\u5165\u542c\u5c7f\u5f00\u53d1\u8005\u7ba1\u7406\u4e2d\u5fc3');\n});\n\n$('logout').onclick = guarded(async () => {\n  await api('logout', { method: 'POST' });\n  location.reload();\n});\n$('close').onclick = () => $('detail').close();\n$('refresh').onclick = guarded(() => loadAll());\n$('more').onclick = guarded(() => loadAll(true));\n$('filters').onsubmit = guarded(async () => {\n  const p = new URLSearchParams();\n  for (const [k, v] of new FormData($('filters'))) {\n    if (v) p.set(k, ['since', 'until'].includes(k) ? String(new Date(v).getTime()) : v);\n  }\n  query = p.toString();\n  await loadAll();\n});\n$('pause').onclick = guarded(async () => {\n  await api('settings', { method: 'PATCH', body: JSON.stringify({ uploadsEnabled: false }) });\n  showMessage('\u4e0a\u4f20\u5df2\u6682\u505c\uff1b\u65e2\u6709\u53cd\u9988\u4ecd\u53ef\u67e5\u770b\u3002');\n  await loadAll();\n});\n\nif ('serviceWorker' in navigator) {\n  navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin' }).catch(() => {});\n}\n\nconst pairing = new URLSearchParams(location.hash.slice(1)).get('pairing');\nhistory.replaceState(null, '', '/admin');\nif (pairing) {\n  api('login', { method: 'POST', body: JSON.stringify({ pairing }) })\n    .then(enterConsole)\n    .catch(() => showMessage('\u4e00\u6b21\u6027\u767b\u5f55\u94fe\u63a5\u5df2\u4f7f\u7528\u6216\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u3002'));\n} else {\n  enterConsole().catch(() => {});\n}\n\n\nlet lastGeneratedBetaCode = '';\nfunction renderBetaView(data) {\n  const sum = data?.summary || {};\n  const box = $('beta-summary-kpis');\n  if (box) {\n    box.replaceChildren();\n    const cards = [\n      ['\u5f00\u53d1\u8005\u6388\u6743\u8bbe\u5907', String(sum.developerDevices ?? 0), '\u957f\u671f\u6709\u6548\uff0c\u9700\u4e8c\u6b21\u786e\u8ba4\u64a4\u9500'],\n      ['\u666e\u901a\u5185\u6d4b\u8bbe\u5907', String(sum.testerDevices ?? 0), '\u9ed8\u8ba430\u5929\uff0c\u53ef\u968f\u65f6\u6279\u91cf\u64a4\u9500'],\n      ['\u5f53\u524d\u6709\u6548\u6388\u6743\u603b\u8ba1', String(sum.activeAuthorizations ?? 0), `\u5df2\u8fc7\u671f ${sum.expiredAuthorizations ?? 0} \u00b7 \u5df2\u64a4\u9500 ${sum.revokedAuthorizations ?? 0}`],\n      ['\u672a\u4f7f\u7528\u6709\u6548\u9080\u8bf7\u7801', String(sum.pendingInvites ?? 0), sum.latestBetaRelease ? `\u6700\u65b0\u5185\u6d4b v${sum.latestBetaRelease.version_name} (${sum.latestBetaRelease.version_code})` : '\u6682\u65e0\u79c1\u6709\u5185\u6d4b\u53d1\u5e03\u8bb0\u5f55'],\n    ];\n    for (const [title, val, sub] of cards) {\n      const c = el('div', undefined, box, 'sub-card kpi-card');\n      el('span', title, c, 'muted');\n      el('strong', val, c);\n      el('span', sub, c, 'kpi-sub');\n    }\n  }\n\n  const invList = $('beta-invites-list');\n  if (invList) {\n    invList.replaceChildren();\n    const invites = data?.invites || [];\n    if (!invites.length) {\n      el('p', '\u6682\u65e0\u9080\u8bf7\u7801\u8bb0\u5f55\u3002', invList, 'muted');\n    } else {\n      for (const inv of invites.slice(0, 20)) {\n        const row = el('div', undefined, invList, 'row-item');\n        const top = el('div', undefined, row, 'row-top');\n        el('strong', `${inv.codeHint} \u00b7 ${inv.role === 'developer' ? '\u5f00\u53d1\u8005\u6388\u6743' : '\u666e\u901a\u5185\u6d4b'}`, top);\n        const stZh = inv.status === 'active' ? '\u5f85\u5151\u6362' : inv.status === 'used' ? '\u5df2\u5151\u6362' : inv.status === 'cancelled' ? '\u5df2\u53d6\u6d88' : '\u5df2\u8fc7\u671f';\n        el('span', stZh, top, inv.status === 'active' ? 'badge badge-ok' : 'badge');\n        el('p', `\u5907\u6ce8\uff1a${inv.note || '\u65e0'} \u00b7 \u9080\u8bf7\u7801\u622a\u6b62\uff1a${fmtTime(inv.inviteExpiresAt)} \u00b7 \u6388\u6743\u65f6\u957f\uff1a${inv.authDurationMs > 0 ? Math.round(inv.authDurationMs / 86400000) + ' \u5929' : '\u957f\u671f\u6709\u6548'}`, row, 'muted');\n        if (role === 'admin' && inv.status === 'active') {\n          const btnCancel = el('button', '\u53d6\u6d88\u4f5c\u5e9f', row, 'btn-secondary compact-btn');\n          btnCancel.type = 'button';\n          btnCancel.onclick = guarded(async () => {\n            await api(`beta/invites/${inv.id}/cancel`, { method: 'POST', body: '{}' });\n            showMessage('\u5df2\u53d6\u6d88\u8be5\u672a\u4f7f\u7528\u9080\u8bf7\u7801');\n            await loadBetaOnly();\n          });\n        }\n      }\n    }\n  }\n\n  const devList = $('beta-devices-list');\n  if (devList) {\n    devList.replaceChildren();\n    const devices = data?.devices || [];\n    if (!devices.length) {\n      el('p', '\u6682\u65e0\u5185\u6d4b\u6388\u6743\u8bbe\u5907\u3002\u53ef\u5148\u751f\u6210\u4e00\u6b21\u6027\u9080\u8bf7\u7801\uff0c\u5728\u542c\u5c7f App\u300c\u8bbe\u7f6e \u2192 \u5173\u4e8e\u4e0e\u4f7f\u7528\u8bf4\u660e\u300d\u8fde\u7eed\u70b9\u51fb\u7248\u672c\u53f7 7 \u6b21\u6fc0\u6d3b\u3002', devList, 'muted');\n    } else {\n      for (const d of devices) {\n        const card = el('div', undefined, devList, 'row-item');\n        const top = el('div', undefined, card, 'row-top');\n        el('strong', `${d.note || d.deviceModel || d.id} (${d.role === 'developer' ? '\u5f00\u53d1\u8005\u8bbe\u5907' : '\u666e\u901a\u5185\u6d4b\u8bbe\u5907'})`, top);\n        const stZh = d.status === 'active' ? '\u6709\u6548\u6388\u6743' : d.status === 'expired' ? '\u5df2\u8fc7\u671f' : '\u5df2\u64a4\u9500';\n        el('span', stZh, top, d.status === 'active' ? 'badge badge-ok' : d.status === 'revoked' ? 'badge badge-danger' : 'badge badge-warn');\n        el('p', `\u673a\u578b\uff1a${d.deviceModel || '\u672a\u77e5'} \u00b7 Android ${d.androidVersion || '-'} \u00b7 \u5f53\u524d\u7248\u672c\uff1a${d.appVersionName ? 'v' + d.appVersionName + ' (' + d.appVersionCode + ')' : '\u672a\u4e0a\u62a5'} \u00b7 \u901a\u9053\uff1a${CHANNEL_ZH[d.activeChannel] || d.activeChannel}`, card, 'muted');\n        el('p', `\u6fc0\u6d3b\uff1a${fmtTime(d.activatedAt)} \u00b7 \u6700\u8fd1\u9a8c\u8bc1\uff1a${fmtTime(d.lastVerifiedAt)} \u00b7 \u5230\u671f\uff1a${d.expiresAt > 0 ? fmtTime(d.expiresAt) : '\u957f\u671f\u6709\u6548'}`, card, 'muted');\n        if (role === 'admin' && d.status !== 'revoked') {\n          const acts = el('div', undefined, card, 'action-row');\n          const bNote = el('button', '\u4fee\u6539\u5907\u6ce8', acts, 'btn-secondary compact-btn');\n          bNote.type = 'button';\n          bNote.onclick = guarded(async () => {\n            const next = prompt('\u8f93\u5165\u65b0\u7684\u8bbe\u5907\u5907\u6ce8\u540d\u79f0', d.note || '');\n            if (next === null) return;\n            await api(`beta/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify({ note: next }) });\n            showMessage('\u5df2\u66f4\u65b0\u8bbe\u5907\u5907\u6ce8');\n            await loadBetaOnly();\n          });\n          if (d.role !== 'developer') {\n            const bExt = el('button', '\u5ef6\u957f30\u5929', acts, 'btn-secondary compact-btn');\n            bExt.type = 'button';\n            bExt.onclick = guarded(async () => {\n              await api(`beta/devices/${d.id}`, { method: 'PATCH', body: JSON.stringify({ extendDays: 30 }) });\n              showMessage('\u5df2\u5ef6\u957f\u8be5\u8bbe\u5907\u6388\u6743\u6709\u6548\u671f 30 \u5929');\n              await loadBetaOnly();\n            });\n          }\n          const bRev = el('button', '\u64a4\u9500\u6388\u6743', acts, 'btn-danger compact-btn');\n          bRev.type = 'button';\n          bRev.onclick = guarded(async () => {\n            if (d.role === 'developer') {\n              if (!confirm('\u8b66\u544a\uff1a\u5373\u5c06\u64a4\u9500\u300c\u5f00\u53d1\u8005\u957f\u671f\u5185\u6d4b\u8bbe\u5907\u300d\u6388\u6743\uff0c\u64a4\u9500\u540e\u8be5\u624b\u673a\u5c06\u7acb\u5373\u9000\u56de\u6b63\u5f0f\u901a\u9053\u3002\u786e\u8ba4\u7ee7\u7eed\u5417\uff1f')) return;\n            } else {\n              if (!confirm(`\u786e\u8ba4\u64a4\u9500\u8bbe\u5907\u300c${d.note || d.deviceModel || d.id}\u300d\u7684\u5185\u6d4b\u8d44\u683c\u5417\uff1f`)) return;\n            }\n            await api(`beta/devices/${d.id}/revoke`, {\n              method: 'POST',\n              body: JSON.stringify({ confirmDeveloperRevoke: d.role === 'developer', reason: 'console_revoked' }),\n            });\n            showMessage('\u5df2\u64a4\u9500\u8be5\u8bbe\u5907\u5185\u6d4b\u6388\u6743');\n            await loadBetaOnly();\n          });\n        }\n      }\n    }\n  }\n}\n\nasync function loadBetaOnly() {\n  const data = await api('beta/overview');\n  renderBetaView(data);\n}\n\nif ($('beta-invite-role')) {\n  $('beta-invite-role').onchange = () => {\n    const isDev = $('beta-invite-role').value === 'developer';\n    $('beta-invite-days').value = isDev ? '0' : '30';\n  };\n}\nif ($('beta-invite-form')) {\n  $('beta-invite-form').onsubmit = guarded(async () => {\n    const res = await api('beta/invites', {\n      method: 'POST',\n      body: JSON.stringify({\n        role: $('beta-invite-role').value,\n        note: $('beta-invite-note').value,\n        inviteTtlMinutes: Number($('beta-invite-ttl').value || 5),\n        authDurationDays: Number($('beta-invite-days').value || 0),\n      }),\n    });\n    const inv = res.invite;\n    lastGeneratedBetaCode = inv.code;\n    $('beta-generated-code').textContent = inv.code;\n    $('beta-generated-meta').textContent = `\u7c7b\u578b\uff1a${inv.role === 'developer' ? '\u5f00\u53d1\u8005\u957f\u671f\u6388\u6743' : '\u666e\u901a\u5185\u6d4b\u6388\u6743'} \u00b7 \u622a\u6b62\u5151\u6362\uff1a${fmtTime(inv.inviteExpiresAt)}`;\n    $('beta-generated-box').hidden = false;\n    await loadBetaOnly();\n  });\n}\nif ($('btn-copy-beta-code')) {\n  $('btn-copy-beta-code').onclick = guarded(async () => {\n    if (!lastGeneratedBetaCode) return;\n    await navigator.clipboard.writeText(lastGeneratedBetaCode);\n    showMessage('\u5df2\u590d\u5236\u9080\u8bf7\u7801\u5230\u526a\u8d34\u677f');\n  });\n}\nif ($('btn-revoke-all-testers')) {\n  $('btn-revoke-all-testers').onclick = guarded(async () => {\n    if (!confirm('\u786e\u8ba4\u4e00\u952e\u64a4\u9500\u5168\u90e8\u300c\u666e\u901a\u5185\u6d4b\u4eba\u5458\u300d\u7684\u6388\u6743\u5417\uff1f\uff08\u5f00\u53d1\u8005\u957f\u671f\u6388\u6743\u8bbe\u5907\u4e0d\u53d7\u5f71\u54cd\uff09')) return;\n    const res = await api('beta/devices/revoke-testers', { method: 'POST', body: '{}' });\n    showMessage(`\u5df2\u6279\u91cf\u64a4\u9500 ${res.revokedCount || 0} \u53f0\u666e\u901a\u5185\u6d4b\u8bbe\u5907\u6388\u6743`);\n    await loadBetaOnly();\n  });\n}\n";
