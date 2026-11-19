import { scrubText } from '../../src/services/feedback/schema.mjs';
import {
    TINGYU_APP_ID,
    ALLOWED_CHANNELS,
    DEFAULT_OFFLINE_GRACE_HOURS,
    signUpdateManifest,
} from '../../shared/updateProtocol.mjs';
import { json, hash, equal, limitedJson, rate, ipKey } from './security.mjs';

// feedback-server/src/releases.mjs
// 统一开发者管理中心：版本候选管理、下载节点核验、受控策略签名发布、紧急解除强制更新、防篡改哈希链审计及反馈联动。

export const EXPECTED_APK_CERT_SHA256 =
    'a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d';

const WORKFLOW_STAGES = [
    'new',
    'pending_confirm',
    'confirmed',
    'fixing',
    'pending_test',
    'tested_ok',
    'published',
    'verified_resolved',
    'reopened',
];

export async function computeApprovalDigest({
    id,
    channel,
    versionCode,
    sha256,
    minSupportedVersionCode,
    forceUpdate,
    releaseNotes,
}) {
    const raw = JSON.stringify([
        String(id),
        String(channel),
        Number(versionCode),
        String(sha256).toLowerCase(),
        Number(minSupportedVersionCode),
        Boolean(forceUpdate),
        String(releaseNotes).trim(),
    ]);
    return hash(raw);
}

export async function appendAuditLog(env, {
    actorRole,
    action,
    channel,
    releaseId = '',
    versionName = '',
    versionCode = 0,
    apkSha256 = '',
    policyRevision = 0,
    result = 'ok',
    detail = {},
}) {
    const now = Date.now();
    const last = await env.DB.prepare(
        'SELECT seq, entry_hash FROM release_audit_logs ORDER BY seq DESC LIMIT 1',
    ).first();
    const prevHash = last?.entry_hash ?? '0'.repeat(64);
    const detailJson = JSON.stringify(detail);
    const entryHash = await hash(
        `${prevHash}|${now}|${actorRole}|${action}|${channel}|${releaseId}|${versionCode}|${apkSha256}|${policyRevision}|${result}|${detailJson}`,
    );
    await env.DB.prepare(
        `INSERT INTO release_audit_logs(
            at, actor_role, action, channel, release_id, version_name, version_code,
            apk_sha256, policy_revision, result, detail_json, prev_hash, entry_hash
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
        now,
        actorRole,
        action,
        channel,
        releaseId,
        versionName,
        versionCode,
        apkSha256,
        policyRevision,
        result,
        detailJson,
        prevHash,
        entryHash,
    ).run();
}

export function getSigningCredentials(env) {
    if (!env.UPDATE_SIGNING_PRIVATE_KEY_JWK || !env.RELEASE_PUBLISH_SECRET) {
        return null;
    }
    try {
        const parsed = JSON.parse(env.UPDATE_SIGNING_PRIVATE_KEY_JWK);
        const keyId = env.UPDATE_SIGNING_KEY_ID || parsed.keyId || 'tingyu-policy-2026-k1';
        const jwk = parsed.privateKeyJwk || parsed;
        if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) return null;
        return { keyId, privateKeyJwk: jwk };
    } catch {
        return null;
    }
}

async function verifyHighPrivilegeAuth(req, env, body) {
    const signing = getSigningCredentials(env);
    if (!signing) {
        return { ok: false, status: 503, error: 'publish_signing_not_configured' };
    }
    const providedSecret = req.headers.get('X-Publish-Secret') || body?.publishSecret || '';
    if (!(await equal(String(providedSecret), env.RELEASE_PUBLISH_SECRET))) {
        return { ok: false, status: 403, error: 'publish_secret_invalid' };
    }
    const nonce = String(body?.confirmNonce || '').trim();
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)) {
        return { ok: false, status: 400, error: 'confirm_nonce_required' };
    }
    const nonceHash = await hash('publish-nonce:' + nonce);
    const existing = await env.DB.prepare('SELECT hash FROM challenges WHERE hash=? AND expires_at>?')
        .bind(nonceHash, Date.now())
        .first();
    if (existing) {
        return { ok: false, status: 409, error: 'duplicate_or_replayed_request' };
    }
    await env.DB.prepare('INSERT OR REPLACE INTO challenges(hash, expires_at) VALUES(?, ?)')
        .bind(nonceHash, Date.now() + 24 * 3600_000)
        .run();
    return { ok: true, signing };
}

/**
 * 真实探测远程 APK 下载节点可用性（使用 Range: bytes=0-0 验证非网页直链、状态码及真实字节长度，绝不凭网页可打开误判通过）。
 */
export async function probeApkDownloadUrl(url, expectedSizeBytes = 0) {
    if (typeof url !== 'string' || !url.startsWith('https://')) {
        return { accessible: false, httpStatus: 0, sizeBytes: 0, latencyMs: 0, detail: 'invalid_https_url' };
    }
    const started = Date.now();
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Range: 'bytes=0-0',
                'User-Agent': 'Tingyu-ReleaseVerifier/1.0',
            },
            redirect: 'follow',
        });
        const latencyMs = Date.now() - started;
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const contentRange = res.headers.get('content-range') || '';
        const contentLen = Number(res.headers.get('content-length') || 0);
        try { await res.body?.cancel(); } catch { /* ignore */ }

        if (res.status !== 200 && res.status !== 206) {
            return { accessible: false, httpStatus: res.status, sizeBytes: 0, latencyMs, detail: `http_${res.status}` };
        }
        if (contentType.includes('text/html')) {
            return { accessible: false, httpStatus: res.status, sizeBytes: 0, latencyMs, detail: 'html_page_not_binary_apk' };
        }
        let totalSize = 0;
        const rangeMatch = /\/(\d+)$/.exec(contentRange);
        if (rangeMatch) {
            totalSize = Number(rangeMatch[1]);
        } else if (res.status === 200 && contentLen > 0) {
            totalSize = contentLen;
        }
        if (expectedSizeBytes > 0 && totalSize > 0 && totalSize !== expectedSizeBytes) {
            return {
                accessible: false,
                httpStatus: res.status,
                sizeBytes: totalSize,
                latencyMs,
                detail: `size_mismatch:${totalSize}!=${expectedSizeBytes}`,
            };
        }
        return {
            accessible: true,
            httpStatus: res.status,
            sizeBytes: totalSize || expectedSizeBytes,
            latencyMs,
            detail: res.status === 206 ? 'range_supported_ok' : 'direct_stream_ok',
        };
    } catch {
        return {
            accessible: false,
            httpStatus: 0,
            sizeBytes: 0,
            latencyMs: Date.now() - started,
            detail: 'network_unreachable',
        };
    }
}

export async function publicUpdatePolicy(req, env, channel) {
    if (channel === 'private_beta') {
        return json({ error: 'private_beta_auth_required' }, 403);
    }
    if (!ALLOWED_CHANNELS.includes(channel)) {
        return json({ error: 'invalid_channel' }, 404);
    }
    const rlKey = 'pubupd:' + (await ipKey(req, env)) + ':' + Math.floor(Date.now() / 60_000);
    if (!(await rate(env, rlKey, 90, 120_000))) {
        return json({ error: 'rate_limit' }, 429);
    }
    const row = await env.DB.prepare(
        'SELECT signed_manifest_json FROM update_policies WHERE channel=?',
    ).bind(channel).first();
    if (!row?.signed_manifest_json) {
        return json({ error: 'policy_not_published' }, 404);
    }
    return new Response(row.signed_manifest_json, {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

export async function publicReleaseHistory(req, env, url) {
    const channel = String(url.searchParams.get('channel') || 'stable');
    if (channel === 'private_beta') {
        return json({ error: 'private_beta_auth_required' }, 403);
    }
    if (!ALLOWED_CHANNELS.includes(channel)) {
        return json({ error: 'invalid_channel' }, 404);
    }
    const rlKey = 'pubhist:' + (await ipKey(req, env)) + ':' + Math.floor(Date.now() / 60_000);
    if (!(await rate(env, rlKey, 90, 120_000))) {
        return json({ error: 'rate_limit' }, 429);
    }
    const rows = (await env.DB.prepare(
        `SELECT id, channel, version_name, version_code, git_commit, release_notes, force_update, published_at
         FROM releases
         WHERE channel=? AND status='published'
         ORDER BY version_code DESC, published_at DESC
         LIMIT 30`,
    ).bind(channel).all()).results;

    return json({
        channel,
        items: rows.map(r => ({
            id: r.id,
            channel: r.channel,
            versionName: r.version_name,
            versionCode: r.version_code,
            gitCommit: r.git_commit || '',
            releaseNotes: r.release_notes || '',
            forceUpdate: Boolean(r.force_update),
            publishedAtEpochMs: r.published_at || 0,
            publishedAt: r.published_at ? new Date(r.published_at).toISOString() : '',
        })),
    });
}

function parseJsonSafe(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function formatReleaseRow(row) {
    if (!row) return null;
    return {
        ...row,
        force_update: Boolean(row.force_update),
        abis: parseJsonSafe(row.abis_json, ['arm64-v8a', 'armeabi-v7a']),
        download_urls: parseJsonSafe(row.download_urls_json, []),
        fixed_issues: parseJsonSafe(row.fixed_issues_json, []),
        verification: parseJsonSafe(row.verification_json, {}),
    };
}

const NODE_STALE_MS = 2 * 3600_000;

export function describeProbeDetail(detail, httpStatus, accessible) {
    const raw = String(detail || '');
    if (accessible) {
        if (raw === 'full_download_sha256_verified') return `完整安装包下载与 SHA-256 校验通过 (HTTP ${httpStatus || 200})`;
        if (raw === 'range_supported_ok' || httpStatus === 206) return '支持断点续传直链 (HTTP 206)';
        if (raw === 'direct_stream_ok' || httpStatus === 200) return '直链二进制流正常 (HTTP 200)';
        return `节点响应正常 (HTTP ${httpStatus || 200})`;
    }
    if (!raw || raw === 'pending_probe') return '尚未执行节点探测';
    if (raw === 'invalid_https_url') return '下载地址无效（必须为 HTTPS 直链）';
    if (raw === 'html_page_not_binary_apk') return `返回 HTML 网页而非 APK 安装包 (HTTP ${httpStatus})`;
    if (raw.startsWith('size_mismatch:')) return `安装包字节数与构建元数据不一致 (${raw.slice(14)})`;
    if (raw.startsWith('http_')) return `源站返回异常状态码 HTTP ${httpStatus || raw.slice(5)}`;
    if (raw === 'network_unreachable') return '边缘节点连接源站超时或网络不可达';
    return raw;
}

function summarizeMirrorNode(nodeType, defaultLabel, activeRelease, allNodes, now) {
    if (!activeRelease) {
        return {
            nodeType,
            label: defaultLabel,
            releaseId: '',
            versionName: '',
            channel: '',
            url: '',
            stateCode: 'unconfigured',
            stateLabel: '待配置',
            accessible: false,
            httpStatus: 0,
            latencyMs: 0,
            sizeBytes: 0,
            sha256Verified: false,
            lastCheckedAt: 0,
            reason: '当前暂无已发布的版本节点配置',
        };
    }
    const mirrors = Array.isArray(activeRelease.download_urls) ? activeRelease.download_urls : [];
    const matchedMirror = mirrors.find(m =>
        m.id === nodeType
        || (nodeType === 'cnb-primary' && String(m.id || '').startsWith('cnb'))
        || (nodeType === 'github-backup' && String(m.id || '').startsWith('github')),
    );
    if (!matchedMirror || !matchedMirror.url) {
        return {
            nodeType,
            label: defaultLabel,
            releaseId: activeRelease.id,
            versionName: activeRelease.version_name,
            channel: activeRelease.channel,
            url: '',
            stateCode: 'unconfigured',
            stateLabel: '待配置',
            accessible: false,
            httpStatus: 0,
            latencyMs: 0,
            sizeBytes: 0,
            sha256Verified: false,
            lastCheckedAt: 0,
            reason: `v${activeRelease.version_name} (${activeRelease.channel === 'stable' ? '正式版' : '测试版'}) 未配置此节点`,
        };
    }
    const row = allNodes.find(n => n.release_id === activeRelease.id && n.node_type === matchedMirror.id)
        || allNodes.find(n => n.url === matchedMirror.url);

    if (!row || !row.last_checked_at) {
        return {
            nodeType,
            label: matchedMirror.label || defaultLabel,
            releaseId: activeRelease.id,
            versionName: activeRelease.version_name,
            channel: activeRelease.channel,
            url: matchedMirror.url,
            stateCode: 'checking',
            stateLabel: '检测中',
            accessible: false,
            httpStatus: 0,
            latencyMs: 0,
            sizeBytes: 0,
            sha256Verified: false,
            lastCheckedAt: 0,
            reason: '正在等待首次边缘探测完成',
        };
    }

    const isStale = now - Number(row.last_checked_at) > NODE_STALE_MS;
    const stateCode = !row.accessible ? 'abnormal' : isStale ? 'stale' : 'healthy';
    const stateLabel = !row.accessible ? '异常' : isStale ? '数据过期' : '正常';

    return {
        nodeType,
        label: row.label || matchedMirror.label || defaultLabel,
        releaseId: activeRelease.id,
        versionName: activeRelease.version_name,
        channel: activeRelease.channel,
        url: row.url || matchedMirror.url,
        stateCode,
        stateLabel,
        accessible: Boolean(row.accessible),
        httpStatus: Number(row.http_status || 0),
        latencyMs: Number(row.latency_ms || 0),
        sizeBytes: Number(row.verified_size_bytes || 0),
        sha256Verified: Boolean(row.integrity_ok),
        lastCheckedAt: Number(row.last_checked_at || 0),
        reason: isStale && row.accessible
            ? `上次检测距今已超 2 小时 · ${describeProbeDetail(row.detail, row.http_status, true)}`
            : describeProbeDetail(row.detail, row.http_status, Boolean(row.accessible)),
    };
}

/**
 * 自动或手动巡检当前活跃版本（正式已发布版本、测试已发布版本、待发候选版本）的所有下载节点并持久化。
 */
export async function probeAllActiveNodes(env, { force = false } = {}) {
    const now = Date.now();
    const targetRows = (await env.DB.prepare(
        `SELECT * FROM releases
         WHERE (channel='stable' AND status='published')
            OR (channel='testing' AND status='published')
            OR status IN ('candidate','testing_passed','approved')
         ORDER BY version_code DESC, updated_at DESC
         LIMIT 6`,
    ).all()).results;

    // 仅对各渠道最新 published 及最新候选巡检，避免扫描全部历史旧版浪费请求
    const selected = [];
    const seenKeys = new Set();
    for (const r of targetRows) {
        const key = r.status === 'published' ? `pub:${r.channel}` : `cand:${r.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        selected.push(r);
    }

    const probedItems = [];
    for (const rel of selected) {
        const mirrors = parseJsonSafe(rel.download_urls_json, []);
        for (const mirror of mirrors) {
            if (!mirror?.id || !mirror?.url) continue;
            const nodeId = `${rel.id}:${mirror.id}`;
            const prev = await env.DB.prepare(
                'SELECT verified_sha256, integrity_ok, last_checked_at FROM download_nodes WHERE id=?',
            ).bind(nodeId).first();

            // 非强制模式下，25 分钟内刚探测过的节点跳过重复探测
            if (!force && prev?.last_checked_at && now - Number(prev.last_checked_at) < 25 * 60_000) {
                continue;
            }

            const probe = await probeApkDownloadUrl(mirror.url, rel.apk_size_bytes);
            const checkedAt = Date.now();
            const shaOk = Boolean(prev?.integrity_ok) && prev?.verified_sha256 === rel.sha256;
            await env.DB.prepare(
                `INSERT OR REPLACE INTO download_nodes(
                    id, release_id, node_type, label, url, accessible, http_status,
                    verified_size_bytes, verified_sha256, integrity_ok, latency_ms, last_checked_at, detail
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            ).bind(
                nodeId,
                rel.id,
                mirror.id,
                mirror.label || mirror.id,
                mirror.url,
                probe.accessible ? 1 : 0,
                probe.httpStatus,
                probe.sizeBytes,
                prev?.verified_sha256 || '',
                shaOk ? 1 : 0,
                probe.latencyMs,
                checkedAt,
                probe.detail,
            ).run();

            probedItems.push({
                id: nodeId,
                releaseId: rel.id,
                versionName: rel.version_name,
                channel: rel.channel,
                nodeType: mirror.id,
                label: mirror.label || mirror.id,
                url: mirror.url,
                ...probe,
                lastCheckedAt: checkedAt,
            });
        }
    }
    return probedItems;
}

export async function getConsoleOverview(env, reqUrl = null) {
    const now = Date.now();
    const dayStart = Math.floor(now / 86400_000) * 86400_000;
    const fbRow = await env.DB.prepare(
        `SELECT
            count(*) total,
            sum(created_at >= ?) today,
            count(DISTINCT issue_id) issues,
            sum(status IN ('pending', 'investigating')) pending_feedback,
            sum(status = 'fixed') resolved_feedback,
            count(DISTINCT CASE WHEN status IN ('pending', 'investigating') THEN issue_id END) pending_issues,
            count(DISTINCT CASE WHEN status = 'fixed' THEN issue_id END) resolved_issues,
            sum(severity = 'high' AND status NOT IN ('fixed', 'closed')) high_priority
         FROM feedback WHERE phase='ready' AND expires_at>?`,
    ).bind(dayStart, now).first();

    const trendRows = (await env.DB.prepare(
        `SELECT (created_at / 86400000) * 86400000 AS day_bucket, count(*) AS count
         FROM feedback WHERE phase='ready' AND expires_at>? AND created_at >= ?
         GROUP BY day_bucket ORDER BY day_bucket ASC`,
    ).bind(now, dayStart - 6 * 86400_000).all()).results;

    const lifetime = (await env.DB.prepare("SELECT value FROM metrics WHERE key='accepted_total'").first())?.value ?? 0;
    const uploadsSetting = (await env.DB.prepare("SELECT value FROM settings WHERE key='uploads_enabled'").first())?.value === 'true';
    const quotaBytes = (await env.DB.prepare('SELECT bytes FROM quota WHERE id=1').first())?.bytes ?? 0;

    const stableRelease = formatReleaseRow(await env.DB.prepare(
        "SELECT * FROM releases WHERE channel='stable' AND status='published' ORDER BY version_code DESC, published_at DESC LIMIT 1",
    ).first());

    const testingRelease = formatReleaseRow(await env.DB.prepare(
        "SELECT * FROM releases WHERE channel='testing' AND status='published' ORDER BY version_code DESC, published_at DESC LIMIT 1",
    ).first());

    const candidateRelease = formatReleaseRow(await env.DB.prepare(
        "SELECT * FROM releases WHERE status IN ('draft','candidate','testing_passed','approved') ORDER BY updated_at DESC, version_code DESC LIMIT 1",
    ).first());

    const testingCandidate = formatReleaseRow(await env.DB.prepare(
        "SELECT * FROM releases WHERE channel='testing' ORDER BY version_code DESC, updated_at DESC LIMIT 1",
    ).first());

    const policies = (await env.DB.prepare('SELECT * FROM update_policies ORDER BY channel ASC').all()).results.map(p => ({
        channel: p.channel,
        policyRevision: p.policy_revision,
        policyAction: p.policy_action,
        updateEnabled: Boolean(p.update_enabled),
        latestVersionName: p.latest_version_name,
        latestVersionCode: p.latest_version_code,
        minSupportedVersionCode: p.min_supported_version_code,
        releaseId: p.release_id,
        manifest: parseJsonSafe(p.signed_manifest_json, null),
        nodeSync: parseJsonSafe(p.node_sync_json, {}),
        updatedAt: p.updated_at,
    }));

    let nodes = (await env.DB.prepare(
        'SELECT * FROM download_nodes ORDER BY last_checked_at DESC LIMIT 30',
    ).all()).results.map(n => ({
        ...n,
        accessible: Boolean(n.accessible),
        integrity_ok: Boolean(n.integrity_ok),
        reason_zh: describeProbeDetail(n.detail, n.http_status, Boolean(n.accessible)),
    }));

    // 部署后首次打开总览时，若当前已发布版本存在未检测节点（last_checked_at = 0），自动执行一次即时探测
    const primaryActive = stableRelease || testingRelease || candidateRelease;
    const isLocalTest = reqUrl && (reqUrl.hostname === 'test.invalid' || reqUrl.hostname === '127.0.0.1');
    if (primaryActive && !isLocalTest) {
        const mirrors = Array.isArray(primaryActive.download_urls) ? primaryActive.download_urls : [];
        const hasUncheckedMirror = mirrors.some(m => {
            const matched = nodes.find(n => n.release_id === primaryActive.id && n.node_type === m.id);
            return !matched || !matched.last_checked_at;
        });
        if (hasUncheckedMirror) {
            await probeAllActiveNodes(env, { force: false });
            nodes = (await env.DB.prepare(
                'SELECT * FROM download_nodes ORDER BY last_checked_at DESC LIMIT 30',
            ).all()).results.map(n => ({
                ...n,
                accessible: Boolean(n.accessible),
                integrity_ok: Boolean(n.integrity_ok),
                reason_zh: describeProbeDetail(n.detail, n.http_status, Boolean(n.accessible)),
            }));
        }
    }

    const refreshedNow = Date.now();
    const nodeSummary = {
        cnbPrimary: summarizeMirrorNode('cnb-primary', 'CNB 国内主节点', stableRelease || testingRelease || candidateRelease, nodes, refreshedNow),
        githubBackup: summarizeMirrorNode('github-backup', 'GitHub 备用节点', stableRelease || testingRelease || candidateRelease, nodes, refreshedNow),
        probeNote: '检测由 Cloudflare 边缘节点发起轻量字节探测（Range: bytes=0-0），校验 HTTPS 直链状态码、非 HTML 响应与文件字节数；GitHub 节点在海外边缘可达不完全等同于中国大陆直连速度，客户端默认优先使用 CNB 国内节点并在「运营统计」汇总各节点真实下载成功率。',
    };

    const recentAudits = (await env.DB.prepare(
        'SELECT seq, at, actor_role, action, channel, release_id, version_name, version_code, policy_revision, result, detail_json FROM release_audit_logs ORDER BY seq DESC LIMIT 12',
    ).all()).results.map(a => ({
        ...a,
        detail: parseJsonSafe(a.detail_json, {}),
    }));

    const signingReady = Boolean(getSigningCredentials(env));
    const cnbSyncConfigured = Boolean(env.CNB_REPO_SYNC_TOKEN);

    return json({
        feedbackStats: {
            total: fbRow?.total ?? 0,
            today: fbRow?.today ?? 0,
            lifetime,
            issues: fbRow?.issues ?? 0,
            pendingFeedback: fbRow?.pending_feedback ?? 0,
            resolvedFeedback: fbRow?.resolved_feedback ?? 0,
            pendingIssues: fbRow?.pending_issues ?? 0,
            resolvedIssues: fbRow?.resolved_issues ?? 0,
            highPriority: fbRow?.high_priority ?? 0,
            trend: trendRows,
        },
        serviceHealth: {
            uploadsEnabled: uploadsSetting && env.UPLOADS_ENABLED === 'true',
            d1GateEnabled: uploadsSetting,
            configGateEnabled: env.UPLOADS_ENABLED === 'true',
            r2UsedBytes: quotaBytes,
            r2LimitBytes: Number(env.STORAGE_LIMIT_BYTES || 268435456),
            remotePublishReady: signingReady,
            cnbAutoSyncConfigured: cnbSyncConfigured,
        },
        stableRelease,
        testingRelease,
        candidateRelease,
        testingCandidate,
        policies,
        nodes,
        nodeSummary,
        recentAudits,
    });
}

export async function listReleases(url, env) {
    const channel = url.searchParams.get('channel') || '';
    const status = url.searchParams.get('status') || '';
    const clauses = ['1=1'];
    const args = [];
    if (channel && ALLOWED_CHANNELS.includes(channel)) {
        clauses.push('channel=?');
        args.push(channel);
    }
    if (status) {
        clauses.push('status=?');
        args.push(status.slice(0, 32));
    }
    const rows = (await env.DB.prepare(
        `SELECT * FROM releases WHERE ${clauses.join(' AND ')} ORDER BY version_code DESC, updated_at DESC LIMIT 100`,
    ).bind(...args).all()).results;
    return json({ items: rows.map(formatReleaseRow) });
}

export async function upsertCandidateRelease(req, env, role) {
    if (!['admin', 'prepare'].includes(role)) {
        return json({ error: 'forbidden' }, 403);
    }
    const data = await limitedJson(req, 65536);
    const channel = String(data.channel || 'stable');
    if (!ALLOWED_CHANNELS.includes(channel)) return json({ error: 'invalid_channel' }, 400);

    const versionName = String(data.versionName || '').trim().slice(0, 48);
    const versionCode = Number(data.versionCode || 0);
    if (!versionName || !Number.isInteger(versionCode) || versionCode < 1) {
        return json({ error: 'invalid_version' }, 400);
    }

    const sha256 = String(data.sha256 || '').trim().toLowerCase();
    const apkCertSha256 = String(data.apkCertSha256 || EXPECTED_APK_CERT_SHA256).trim().toLowerCase();
    const apkSizeBytes = Number(data.apkSizeBytes || 0);
    if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isInteger(apkSizeBytes) || apkSizeBytes < 1024 * 1024) {
        return json({ error: 'invalid_apk_digest_or_size' }, 400);
    }
    if (apkCertSha256 !== EXPECTED_APK_CERT_SHA256) {
        return json({ error: 'apk_signature_cert_mismatch' }, 400);
    }

    const minSupported = Number.isInteger(data.minSupportedVersionCode) && data.minSupportedVersionCode >= 1
        ? data.minSupportedVersionCode
        : (data.forceUpdate !== false ? versionCode : 1);
    if (minSupported > versionCode) {
        return json({ error: 'min_supported_exceeds_version_code' }, 400);
    }

    const forceUpdate = data.forceUpdate !== false;
    const minSdk = Number.isInteger(data.minSdk) ? data.minSdk : 24;
    const abis = Array.isArray(data.supportedAbis) && data.supportedAbis.length > 0
        ? data.supportedAbis.map(a => String(a).slice(0, 32))
        : ['arm64-v8a', 'armeabi-v7a'];
    const downloadUrls = Array.isArray(data.downloadUrls) ? data.downloadUrls.filter(u =>
        u && typeof u.id === 'string' && typeof u.label === 'string' && typeof u.url === 'string' && u.url.startsWith('https://')
    ).map((u, idx) => ({
        id: u.id.slice(0, 32),
        label: u.label.slice(0, 64),
        url: u.url.slice(0, 512),
        priority: Number.isInteger(u.priority) ? u.priority : idx + 1,
    })) : [];

    const id = String(data.id || `rel-${channel}-${versionName}-${versionCode}`).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 96);
    const existing = await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(id).first();
    // 严禁覆盖已正式发布的同版本记录
    if (existing?.status === 'published') {
        return json({ error: 'published_release_immutable' }, 409);
    }

    const now = Date.now();
    const releaseNotes = scrubText(String(data.releaseNotes || '')).slice(0, 8000);
    const gitCommit = String(data.gitCommit || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
    const cnbTag = String(data.cnbTag || '').slice(0, 96);
    const cnbReleaseId = String(data.cnbReleaseId || '').slice(0, 64);
    const fixedIssues = Array.isArray(data.fixedIssues) ? data.fixedIssues.slice(0, 50).map(s => String(s).slice(0, 120)) : [];
    const verification = data.verification && typeof data.verification === 'object' ? data.verification : {};
    const status = data.status === 'draft' ? 'draft' : 'candidate';

    // 候选内容更新后自动清空旧审批摘要，确保任何修改都必须重新人工审核
    await env.DB.prepare(
        `INSERT INTO releases(
            id, channel, status, version_name, version_code, min_supported_version_code,
            force_update, apk_size_bytes, sha256, apk_cert_sha256, min_sdk, abis_json,
            git_commit, release_notes, download_urls_json, cnb_tag, cnb_release_id,
            fixed_issues_json, verification_json, approved_digest, approved_at, published_at,
            created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'',0,0,?,?)
        ON CONFLICT(id) DO UPDATE SET
            status=excluded.status,
            min_supported_version_code=excluded.min_supported_version_code,
            force_update=excluded.force_update,
            apk_size_bytes=excluded.apk_size_bytes,
            sha256=excluded.sha256,
            apk_cert_sha256=excluded.apk_cert_sha256,
            min_sdk=excluded.min_sdk,
            abis_json=excluded.abis_json,
            git_commit=excluded.git_commit,
            release_notes=excluded.release_notes,
            download_urls_json=excluded.download_urls_json,
            cnb_tag=excluded.cnb_tag,
            cnb_release_id=excluded.cnb_release_id,
            fixed_issues_json=excluded.fixed_issues_json,
            verification_json=excluded.verification_json,
            approved_digest='',
            approved_at=0,
            updated_at=excluded.updated_at`,
    ).bind(
        id,
        channel,
        status,
        versionName,
        versionCode,
        minSupported,
        forceUpdate ? 1 : 0,
        apkSizeBytes,
        sha256,
        apkCertSha256,
        minSdk,
        JSON.stringify(abis),
        gitCommit,
        releaseNotes,
        JSON.stringify(downloadUrls),
        cnbTag,
        cnbReleaseId,
        JSON.stringify(fixedIssues),
        JSON.stringify(verification),
        now,
        now,
    ).run();

    for (const mirror of downloadUrls) {
        const nodeId = `${id}:${mirror.id}`;
        const localVerified = verification?.nodes?.[mirror.id];
        await env.DB.prepare(
            `INSERT OR REPLACE INTO download_nodes(
                id, release_id, node_type, label, url, accessible, http_status,
                verified_size_bytes, verified_sha256, integrity_ok, latency_ms, last_checked_at, detail
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
            nodeId,
            id,
            mirror.id,
            mirror.label,
            mirror.url,
            localVerified?.accessible ? 1 : 0,
            Number(localVerified?.httpStatus || 0),
            Number(localVerified?.sizeBytes || 0),
            String(localVerified?.sha256 || ''),
            localVerified?.sha256 === sha256 ? 1 : 0,
            Number(localVerified?.latencyMs || 0),
            localVerified?.checkedAt || 0,
            String(localVerified?.detail || 'pending_probe').slice(0, 160),
        ).run();
    }

    await appendAuditLog(env, {
        actorRole: role,
        action: 'prepare_candidate',
        channel,
        releaseId: id,
        versionName,
        versionCode,
        apkSha256: sha256,
        result: 'ok',
        detail: { status, downloadCount: downloadUrls.length },
    });

    const saved = await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(id).first();
    return json({ release: formatReleaseRow(saved) }, 201);
}

export async function updateReleaseReview(req, env, id, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const existing = await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(id).first();
    if (!existing) return json({ error: 'release_not_found' }, 404);
    if (existing.status === 'published') return json({ error: 'published_release_immutable' }, 409);

    const data = await limitedJson(req, 32768);
    const now = Date.now();
    const nextNotes = data.releaseNotes !== undefined
        ? scrubText(String(data.releaseNotes)).slice(0, 8000)
        : existing.release_notes;
    const nextForce = data.forceUpdate !== undefined ? Boolean(data.forceUpdate) : Boolean(existing.force_update);
    const nextMinCode = data.minSupportedVersionCode !== undefined
        ? Number(data.minSupportedVersionCode)
        : (nextForce ? existing.version_code : Math.min(existing.min_supported_version_code, existing.version_code));

    if (!Number.isInteger(nextMinCode) || nextMinCode < 1 || nextMinCode > existing.version_code) {
        return json({ error: 'invalid_min_supported_version_code' }, 400);
    }

    const nextUrls = Array.isArray(data.downloadUrls)
        ? JSON.stringify(data.downloadUrls.filter(u => u && typeof u.url === 'string' && u.url.startsWith('https://')))
        : existing.download_urls_json;

    const action = String(data.reviewAction || 'save_draft'); // save_draft | mark_tested | approve | withdraw
    let nextStatus = existing.status;
    let approvedDigest = '';
    let approvedAt = 0;

    if (action === 'withdraw') {
        nextStatus = 'withdrawn';
    } else if (action === 'mark_tested') {
        nextStatus = 'testing_passed';
    } else if (action === 'approve') {
        const urls = parseJsonSafe(nextUrls, []);
        if (!urls.length) {
            return json({ error: 'cannot_approve_without_download_urls' }, 400);
        }
        nextStatus = 'approved';
        approvedDigest = await computeApprovalDigest({
            id: existing.id,
            channel: existing.channel,
            versionCode: existing.version_code,
            sha256: existing.sha256,
            minSupportedVersionCode: nextMinCode,
            forceUpdate: nextForce,
            releaseNotes: nextNotes,
        });
        approvedAt = now;
    } else {
        // 修改草稿后若原先已审批则退回待重审
        nextStatus = existing.status === 'approved' ? 'testing_passed' : existing.status;
    }

    await env.DB.prepare(
        `UPDATE releases SET
            status=?, release_notes=?, force_update=?, min_supported_version_code=?,
            download_urls_json=?, approved_digest=?, approved_at=?, updated_at=?
         WHERE id=?`,
    ).bind(
        nextStatus,
        nextNotes,
        nextForce ? 1 : 0,
        nextMinCode,
        nextUrls,
        approvedDigest,
        approvedAt,
        now,
        id,
    ).run();

    await appendAuditLog(env, {
        actorRole: role,
        action: action === 'approve' ? 'approve_candidate' : action === 'mark_tested' ? 'mark_tested' : 'update_draft',
        channel: existing.channel,
        releaseId: id,
        versionName: existing.version_name,
        versionCode: existing.version_code,
        apkSha256: existing.sha256,
        result: 'ok',
        detail: { status: nextStatus, forceUpdate: nextForce, minSupportedVersionCode: nextMinCode, approvedDigest },
    });

    const updated = await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(id).first();
    return json({ release: formatReleaseRow(updated) });
}

export async function probeReleaseNodes(req, env, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const body = await limitedJson(req, 4096);
    const releaseId = String(body.releaseId || '').trim();
    const release = await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(releaseId).first();
    if (!release) return json({ error: 'release_not_found' }, 404);

    const urls = parseJsonSafe(release.download_urls_json, []);
    const results = [];
    const now = Date.now();
    for (const mirror of urls) {
        const probe = await probeApkDownloadUrl(mirror.url, release.apk_size_bytes);
        const nodeId = `${releaseId}:${mirror.id}`;
        const prev = await env.DB.prepare('SELECT verified_sha256, integrity_ok FROM download_nodes WHERE id=?').bind(nodeId).first();
        const shaOk = Boolean(prev?.integrity_ok) && prev?.verified_sha256 === release.sha256;
        await env.DB.prepare(
            `INSERT OR REPLACE INTO download_nodes(
                id, release_id, node_type, label, url, accessible, http_status,
                verified_size_bytes, verified_sha256, integrity_ok, latency_ms, last_checked_at, detail
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
            nodeId,
            releaseId,
            mirror.id,
            mirror.label,
            mirror.url,
            probe.accessible ? 1 : 0,
            probe.httpStatus,
            probe.sizeBytes,
            prev?.verified_sha256 || '',
            shaOk ? 1 : 0,
            probe.latencyMs,
            now,
            probe.detail,
        ).run();
        results.push({ id: nodeId, label: mirror.label, url: mirror.url, ...probe, sha256Verified: shaOk });
    }

    await appendAuditLog(env, {
        actorRole: role,
        action: 'verify_node',
        channel: release.channel,
        releaseId,
        versionName: release.version_name,
        versionCode: release.version_code,
        apkSha256: release.sha256,
        result: results.some(r => r.accessible) ? 'ok' : 'failed',
        detail: { results },
    });

    return json({ items: results });
}

export async function publishApprovedRelease(req, env, id, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const body = await limitedJson(req, 8192);
    const auth = await verifyHighPrivilegeAuth(req, env, body);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const release = await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(id).first();
    if (!release) return json({ error: 'release_not_found' }, 404);
    if (release.status === 'withdrawn') return json({ error: 'release_withdrawn' }, 409);
    if (release.status !== 'approved' || !release.approved_digest) {
        return json({ error: 'candidate_not_approved' }, 409);
    }

    // 校验管理员确认绑定的摘要与当前候选完全一致（任何参数修改都会导致摘要失配，要求重新审核）
    const currentDigest = await computeApprovalDigest({
        id: release.id,
        channel: release.channel,
        versionCode: release.version_code,
        sha256: release.sha256,
        minSupportedVersionCode: release.min_supported_version_code,
        forceUpdate: Boolean(release.force_update),
        releaseNotes: release.release_notes,
    });
    if (currentDigest !== release.approved_digest || (body.expectedDigest && body.expectedDigest !== currentDigest)) {
        return json({ error: 'approval_digest_mismatch_reapproval_required' }, 409);
    }
    if (body.expectedSha256 && String(body.expectedSha256).toLowerCase() !== release.sha256) {
        return json({ error: 'apk_sha256_confirmation_mismatch' }, 409);
    }

    const downloadUrls = parseJsonSafe(release.download_urls_json, []);
    const isPrivateBeta = release.channel === 'private_beta';
    let reachableCount = 0;
    const probeNow = Date.now();

    if (isPrivateBeta) {
        const betaApk = await env.DB.prepare('SELECT * FROM beta_apk_objects WHERE release_id=?').bind(release.id).first();
        if (!betaApk || betaApk.sha256 !== release.sha256) {
            return json({ error: 'private_beta_r2_apk_missing' }, 400);
        }
        const obj = await env.LOGS_BUCKET.get(betaApk.r2_key, { range: { offset: 0, length: 1 } });
        if (!obj) {
            return json({ error: 'private_beta_r2_object_unreachable' }, 502);
        }
        try { await obj.body?.cancel(); } catch { /* ignore */ }
        reachableCount = 1;
    } else {
        if (!downloadUrls.length) {
            return json({ error: 'missing_download_urls' }, 400);
        }

        // 正式策略生效前，必须在服务端实时核验至少一个主/备下载节点真实可下载且文件大小一致，并将探测结果立即回写持久化！
        for (const mirror of downloadUrls) {
            const probe = await probeApkDownloadUrl(mirror.url, release.apk_size_bytes);
            if (probe.accessible) reachableCount++;
            const nodeId = `${release.id}:${mirror.id}`;
            const prev = await env.DB.prepare('SELECT verified_sha256, integrity_ok FROM download_nodes WHERE id=?').bind(nodeId).first();
            const shaOk = Boolean(prev?.integrity_ok) && prev?.verified_sha256 === release.sha256;
            await env.DB.prepare(
                `INSERT OR REPLACE INTO download_nodes(
                    id, release_id, node_type, label, url, accessible, http_status,
                    verified_size_bytes, verified_sha256, integrity_ok, latency_ms, last_checked_at, detail
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            ).bind(
                nodeId,
                release.id,
                mirror.id,
                mirror.label || mirror.id,
                mirror.url,
                probe.accessible ? 1 : 0,
                probe.httpStatus,
                probe.sizeBytes,
                prev?.verified_sha256 || '',
                shaOk ? 1 : 0,
                probe.latencyMs,
                probeNow,
                probe.detail,
            ).run();
        }
    }
    if (reachableCount === 0) {
        await appendAuditLog(env, {
            actorRole: role,
            action: 'publish_release',
            channel: release.channel,
            releaseId: release.id,
            versionName: release.version_name,
            versionCode: release.version_code,
            apkSha256: release.sha256,
            result: 'failed',
            detail: { reason: 'all_download_urls_unreachable' },
        });
        return json({ error: 'download_nodes_unreachable_abort_publish' }, 502);
    }

    const currentPolicy = await env.DB.prepare(
        'SELECT policy_revision FROM update_policies WHERE channel=?',
    ).bind(release.channel).first();
    const nextRevision = (currentPolicy?.policy_revision ?? 0) + 1;

    const now = Date.now();
    const expiresAtMs = now + 30 * 86400_000;
    const minSupported = release.force_update
        ? release.min_supported_version_code
        : Math.min(release.min_supported_version_code, release.version_code - 1, 1);
    const effectiveMinSupported = release.force_update
        ? release.min_supported_version_code
        : Math.max(1, Number(body.nonForceMinVersionCode || 1));

    const unsignedManifest = {
        schemaVersion: 1,
        appId: TINGYU_APP_ID,
        channel: release.channel,
        policyRevision: nextRevision,
        policyAction: 'normal',
        updateEnabled: true,
        latestVersionName: release.version_name,
        latestVersionCode: release.version_code,
        minSupportedVersionCode: release.force_update ? release.min_supported_version_code : effectiveMinSupported,
        releaseId: release.id,
        gitCommit: release.git_commit,
        releaseNotes: release.release_notes,
        publishedAt: new Date(now).toISOString(),
        publishedAtEpochMs: now,
        policyExpiresAt: new Date(expiresAtMs).toISOString(),
        policyExpiresAtEpochMs: expiresAtMs,
        offlineGraceHours: DEFAULT_OFFLINE_GRACE_HOURS,
        apkSizeBytes: release.apk_size_bytes,
        sha256: release.sha256,
        apkCertSha256: release.apk_cert_sha256,
        minSdk: release.min_sdk,
        supportedAbis: parseJsonSafe(release.abis_json, ['arm64-v8a', 'armeabi-v7a']),
        downloadUrls,
    };

    const signedManifest = await signUpdateManifest(
        unsignedManifest,
        auth.signing.privateKeyJwk,
        auth.signing.keyId,
    );
    const signedJson = JSON.stringify(signedManifest, null, 2);

    const nodeSync = {
        cloudflareLivePolicy: { status: 'synced', at: now, policyRevision: nextRevision },
        cnbStaticJson: {
            status: 'pending_cli_sync',
            hint: '客户端已通过云端实时签名策略节点立即生效；可在电脑运行 release-cli sync 将相同签名文件镜像至 CNB/GitHub 静态分支',
        },
    };

    await env.DB.batch([
        env.DB.prepare(
            `INSERT OR REPLACE INTO update_policies(
                channel, policy_revision, policy_action, update_enabled,
                latest_version_name, latest_version_code, min_supported_version_code,
                release_id, signed_manifest_json, node_sync_json, updated_at
            ) VALUES(?,?,?,1,?,?,?,?,?,?,?)`,
        ).bind(
            release.channel,
            nextRevision,
            'normal',
            release.version_name,
            release.version_code,
            signedManifest.minSupportedVersionCode,
            release.id,
            signedJson,
            JSON.stringify(nodeSync),
            now,
        ),
        env.DB.prepare(
            "UPDATE releases SET status='published', published_at=?, updated_at=? WHERE id=?",
        ).bind(now, now, release.id),
        env.DB.prepare(
            "UPDATE feedback_links SET workflow_stage='published', fixed_version=?, updated_at=? WHERE target_version=? AND workflow_stage IN ('tested_ok','pending_test','fixing','confirmed')",
        ).bind(release.version_name, now, release.version_name),
        env.DB.prepare(
            "UPDATE issue_notes SET workflow_stage='published', fixed_version=?, updated_at=? WHERE target_version=? AND workflow_stage IN ('tested_ok','pending_test','fixing','confirmed')",
        ).bind(release.version_name, now, release.version_name),
    ]);

    await appendAuditLog(env, {
        actorRole: role,
        action: 'publish_release',
        channel: release.channel,
        releaseId: release.id,
        versionName: release.version_name,
        versionCode: release.version_code,
        apkSha256: release.sha256,
        policyRevision: nextRevision,
        result: 'ok',
        detail: {
            forceUpdate: Boolean(release.force_update),
            minSupportedVersionCode: signedManifest.minSupportedVersionCode,
            reachableNodes: reachableCount,
        },
    });

    return json({
        ok: true,
        policyRevision: nextRevision,
        manifest: signedManifest,
        nodeSync,
    });
}

export async function mutateChannelPolicy(req, env, channel, mode, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    if (!ALLOWED_CHANNELS.includes(channel)) return json({ error: 'invalid_channel' }, 400);

    const body = await limitedJson(req, 8192);
    const auth = await verifyHighPrivilegeAuth(req, env, body);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const existing = await env.DB.prepare('SELECT * FROM update_policies WHERE channel=?').bind(channel).first();
    const baseManifest = parseJsonSafe(existing?.signed_manifest_json, null);
    const nextRevision = (existing?.policy_revision ?? 0) + 1;
    const now = Date.now();
    const expiresAtMs = now + 30 * 86400_000;

    let policyAction = 'normal';
    let updateEnabled = Boolean(existing?.update_enabled);
    let minSupported = existing?.min_supported_version_code ?? 1;
    let releaseNotes = baseManifest?.releaseNotes || '听屿更新策略调整';

    if (mode === 'pause') {
        // 暂停推送：停止向客户端推送新版本，保留已安装用户正常使用
        policyAction = 'pause';
        updateEnabled = false;
    } else if (mode === 'unlock') {
        // 紧急解除强制更新：立即降低 minSupportedVersionCode 并签发更高 policyRevision，使被锁旧版客户端立即恢复可用！
        policyAction = 'emergency_unlock';
        updateEnabled = false;
        minSupported = Math.max(1, Number(body.safeMinVersionCode || 1));
        if (body.reason) releaseNotes = scrubText(String(body.reason)).slice(0, 2000);
    } else if (mode === 'renew') {
        if (!baseManifest) return json({ error: 'no_existing_policy_to_renew' }, 404);
        policyAction = existing.policy_action === 'emergency_unlock' ? 'emergency_unlock' : existing.policy_action === 'pause' ? 'pause' : 'normal';
        updateEnabled = Boolean(existing.update_enabled);
        minSupported = existing.min_supported_version_code;
    } else if (mode === 'adjust') {
        if (!baseManifest) return json({ error: 'no_existing_policy_to_adjust' }, 404);
        policyAction = 'normal';
        updateEnabled = body.updateEnabled !== undefined ? Boolean(body.updateEnabled) : Boolean(existing.update_enabled);
        minSupported = Number.isInteger(body.minSupportedVersionCode)
            ? body.minSupportedVersionCode
            : existing.min_supported_version_code;
        if (minSupported < 1 || minSupported > (baseManifest.latestVersionCode || 1)) {
            return json({ error: 'invalid_min_supported_version_code' }, 400);
        }
        if (body.releaseNotes !== undefined) {
            releaseNotes = scrubText(String(body.releaseNotes)).slice(0, 8000);
        }
    } else {
        return json({ error: 'invalid_policy_mutation_mode' }, 400);
    }

    const unsignedManifest = {
        schemaVersion: 1,
        appId: TINGYU_APP_ID,
        channel,
        policyRevision: nextRevision,
        policyAction,
        updateEnabled,
        latestVersionName: baseManifest?.latestVersionName || '1.5.78',
        latestVersionCode: baseManifest?.latestVersionCode || 293,
        minSupportedVersionCode: minSupported,
        releaseId: baseManifest?.releaseId || 'policy-control',
        gitCommit: baseManifest?.gitCommit || '',
        releaseNotes,
        publishedAt: new Date(now).toISOString(),
        publishedAtEpochMs: now,
        policyExpiresAt: new Date(expiresAtMs).toISOString(),
        policyExpiresAtEpochMs: expiresAtMs,
        offlineGraceHours: DEFAULT_OFFLINE_GRACE_HOURS,
        apkSizeBytes: baseManifest?.apkSizeBytes || 0,
        sha256: baseManifest?.sha256 || '0'.repeat(64),
        apkCertSha256: baseManifest?.apkCertSha256 || EXPECTED_APK_CERT_SHA256,
        minSdk: baseManifest?.minSdk || 24,
        supportedAbis: baseManifest?.supportedAbis || ['arm64-v8a', 'armeabi-v7a'],
        downloadUrls: baseManifest?.downloadUrls || [],
    };

    const signedManifest = await signUpdateManifest(
        unsignedManifest,
        auth.signing.privateKeyJwk,
        auth.signing.keyId,
    );
    const signedJson = JSON.stringify(signedManifest, null, 2);
    const nodeSync = {
        cloudflareLivePolicy: { status: 'synced', at: now, policyRevision: nextRevision },
        cnbStaticJson: { status: 'pending_cli_sync', at: now },
    };

    await env.DB.prepare(
        `INSERT OR REPLACE INTO update_policies(
            channel, policy_revision, policy_action, update_enabled,
            latest_version_name, latest_version_code, min_supported_version_code,
            release_id, signed_manifest_json, node_sync_json, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
        channel,
        nextRevision,
        policyAction,
        updateEnabled ? 1 : 0,
        signedManifest.latestVersionName,
        signedManifest.latestVersionCode,
        signedManifest.minSupportedVersionCode,
        signedManifest.releaseId,
        signedJson,
        JSON.stringify(nodeSync),
        now,
    ).run();

    await appendAuditLog(env, {
        actorRole: role,
        action: mode === 'pause' ? 'pause_updates' : mode === 'unlock' ? 'emergency_unlock' : 'update_policy',
        channel,
        releaseId: signedManifest.releaseId,
        versionName: signedManifest.latestVersionName,
        versionCode: signedManifest.latestVersionCode,
        apkSha256: signedManifest.sha256,
        policyRevision: nextRevision,
        result: 'ok',
        detail: { mode, policyAction, updateEnabled, minSupportedVersionCode: minSupported },
    });

    return json({ ok: true, policyRevision: nextRevision, manifest: signedManifest });
}

export async function recordExternalNodeSync(req, env, role) {
    if (!['admin', 'prepare'].includes(role)) return json({ error: 'forbidden' }, 403);
    const body = await limitedJson(req, 4096);
    const channel = String(body.channel || 'stable');
    const row = await env.DB.prepare('SELECT * FROM update_policies WHERE channel=?').bind(channel).first();
    if (!row) return json({ error: 'policy_not_found' }, 404);
    const sync = parseJsonSafe(row.node_sync_json, {});
    if (body.cnbSynced) {
        sync.cnbStaticJson = { status: 'synced', at: Date.now(), policyRevision: row.policy_revision, url: String(body.cnbUrl || '') };
    }
    if (body.githubSynced) {
        sync.githubStaticJson = { status: 'synced', at: Date.now(), policyRevision: row.policy_revision, url: String(body.githubUrl || '') };
    }
    await env.DB.prepare('UPDATE update_policies SET node_sync_json=?, updated_at=? WHERE channel=?')
        .bind(JSON.stringify(sync), Date.now(), channel)
        .run();
    await appendAuditLog(env, {
        actorRole: role,
        action: 'sync_static_nodes',
        channel,
        releaseId: row.release_id,
        versionName: row.latest_version_name,
        versionCode: row.latest_version_code,
        policyRevision: row.policy_revision,
        result: 'ok',
        detail: sync,
    });
    return json({ ok: true, nodeSync: sync });
}

export async function listAuditLogs(url, env) {
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
    const channel = url.searchParams.get('channel') || '';
    const rows = channel
        ? (await env.DB.prepare(
            'SELECT * FROM release_audit_logs WHERE channel=? ORDER BY seq DESC LIMIT ?',
        ).bind(channel, limit).all()).results
        : (await env.DB.prepare(
            'SELECT * FROM release_audit_logs ORDER BY seq DESC LIMIT ?',
        ).bind(limit).all()).results;
    return json({
        items: rows.map(r => ({ ...r, detail: parseJsonSafe(r.detail_json, {}) })),
    });
}

export async function updateFeedbackReleaseLink(req, env, feedbackId, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const fb = await env.DB.prepare("SELECT id FROM feedback WHERE id=? AND phase='ready'").bind(feedbackId).first();
    if (!fb) return json({ error: 'feedback_not_found' }, 404);

    const data = await limitedJson(req, 4096);
    const stage = WORKFLOW_STAGES.includes(data.workflowStage) ? data.workflowStage : 'confirmed';
    const targetVersion = String(data.targetVersion || '').trim().slice(0, 48);
    const fixedVersion = String(data.fixedVersion || '').trim().slice(0, 48);
    const mergedIssueId = String(data.mergedIssueId || '').trim().slice(0, 80);
    const now = Date.now();

    await env.DB.prepare(
        `INSERT OR REPLACE INTO feedback_links(
            feedback_id, workflow_stage, target_version, fixed_version, merged_issue_id, updated_at
        ) VALUES(?,?,?,?,?,?)`,
    ).bind(feedbackId, stage, targetVersion, fixedVersion, mergedIssueId, now).run();

    return json({ ok: true, feedbackId, workflowStage: stage, targetVersion, fixedVersion, mergedIssueId });
}

export async function updateIssueReleaseNote(req, env, issueId, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const data = await limitedJson(req, 8192);
    const stage = WORKFLOW_STAGES.includes(data.workflowStage) ? data.workflowStage : 'confirmed';
    const title = scrubText(String(data.title || '')).slice(0, 200);
    const priorityLabel = String(data.priorityLabel || '').slice(0, 16);
    const targetVersion = String(data.targetVersion || '').trim().slice(0, 48);
    const fixedVersion = String(data.fixedVersion || '').trim().slice(0, 48);
    const fixCommit = String(data.fixCommit || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
    const aiAnalysis = scrubText(String(data.aiAnalysis || '')).slice(0, 4000);
    const now = Date.now();

    await env.DB.prepare(
        `INSERT OR REPLACE INTO issue_notes(
            issue_id, title, workflow_stage, priority_label, target_version,
            fixed_version, fix_commit, ai_analysis, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?)`,
    ).bind(issueId, title, stage, priorityLabel, targetVersion, fixedVersion, fixCommit, aiAnalysis, now).run();

    return json({ ok: true, issueId, workflowStage: stage, targetVersion, fixedVersion });
}
