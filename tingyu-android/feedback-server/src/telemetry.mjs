// feedback-server/src/telemetry.mjs
// 听屿轻量化匿名运营统计、官方 Release 下载计数同步与免费额度保护模块。
// 核心原则：
// 1. 绝不采集任何个人身份、账号、歌单、播放曲目或原始 IP；设备标识经服务端不可逆单向哈希脱敏存储。
// 2. 绝不无限追加心跳流水：每台匿名设备仅维护 1 行状态 + 每日至多 1 行有期限日活去重记录，历史自动归档为日/月聚合表。
// 3. 严格区分统计口径：GitHub 官方下载计数 vs CNB 官方计数（未开放时返回 null 标注暂无统计，绝不伪造为 0） vs 应用内更新节点计数。
// 4. 免费额度熔断保护：独立每日写入预算，接近上限自动降频或暂停非必要统计，优先保障软件内更新、版本发布、用户反馈与管理鉴权。

import { json, hash, limitedJson, rate, ipKey } from './security.mjs';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/huleixin/folia-rear-lyrics/releases?per_page=100';
const CNB_RELEASES_API = 'https://api.cnb.cool/tingyu-2026/releases/-/releases?page=1&pageSize=50';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_HEARTBEAT_KEYS = new Set([
    'installId',
    'versionName',
    'versionCode',
    'channel',
    'androidVersion',
    'deviceModel',
    'isForeground',
    'isPlaying',
    'previousVersionCode',
]);
const ALLOWED_EVENT_KEYS = new Set([
    'installId',
    'event',
    'targetVersionCode',
    'targetVersionName',
    'channel',
    'mirrorId',
]);
const ALLOWED_UPDATE_EVENTS = new Set([
    'download_started',
    'download_succeeded',
    'download_failed',
    'verify_failed',
]);

let summaryCache = { key: '', expiresAt: 0, payload: null };
let lastDownloadSyncAt = 0;

export function invalidateTelemetrySummaryCache() {
    summaryCache = { key: '', expiresAt: 0, payload: null };
}

/** 将毫秒时间戳转换为北京时间 (UTC+8) YYYY-MM-DD 日期字符串 */
export function toCnDay(ms = Date.now()) {
    const d = new Date(ms + 8 * 3600_000);
    return d.toISOString().slice(0, 10);
}

export function shiftCnDay(dayStr, deltaDays) {
    const base = Date.parse(`${dayStr}T00:00:00Z`);
    return new Date(base + deltaDays * 86400_000).toISOString().slice(0, 10);
}

function cleanShortText(val, maxLen = 48) {
    if (typeof val !== 'string') return '';
    return val.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, maxLen);
}

async function getTelemetrySettings(env) {
    const rows = (await env.DB.prepare(
        "SELECT key, value FROM settings WHERE key IN ('telemetry_enabled','telemetry_interval_sec','telemetry_daily_write_budget','telemetry_started_day')",
    ).all()).results;
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const enabled = map.telemetry_enabled !== 'false';
    const baseIntervalSec = Math.max(300, Math.min(7200, Number(map.telemetry_interval_sec) || 600));
    const dailyBudget = Math.max(1000, Math.min(90000, Number(map.telemetry_daily_write_budget) || 40000));
    const startedDay = map.telemetry_started_day || '';

    const today = toCnDay();
    const writeKey = `telemetry_writes:${today}`;
    const usedRow = await env.DB.prepare('SELECT value FROM metrics WHERE key=?').bind(writeKey).first();
    const usedWrites = Number(usedRow?.value || 0);
    const ratio = usedWrites / dailyBudget;

    let throttleMode = 'normal';
    let effectiveIntervalSec = baseIntervalSec;
    if (!enabled) {
        throttleMode = 'disabled_by_admin';
        effectiveIntervalSec = 3600;
    } else if (ratio >= 0.9) {
        throttleMode = 'paused_quota_guard';
        effectiveIntervalSec = 3600;
    } else if (ratio >= 0.7) {
        throttleMode = 'throttled_quota_guard';
        effectiveIntervalSec = Math.max(baseIntervalSec, 1800);
    }
    const activeWindowMinutes = Math.max(15, Math.ceil((effectiveIntervalSec * 1.5) / 60));

    return {
        enabled,
        baseIntervalSec,
        effectiveIntervalSec,
        activeWindowMinutes,
        dailyBudget,
        usedWrites,
        throttleMode,
        startedDay,
        today,
        writeKey,
    };
}

async function recordTelemetryWrites(env, writeKey, count = 1) {
    if (count <= 0) return;
    await env.DB.prepare(
        'INSERT INTO metrics(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = value + excluded.value',
    ).bind(writeKey, count).run();
}

async function deriveDeviceHash(env, installId) {
    const salt = String(env.FEEDBACK_ADMIN_TOKEN || 'ty-default-salt').slice(0, 20);
    return hash(`ty-anon-device-v1:${salt}:${installId.toLowerCase()}`);
}

/**
 * POST /api/public/telemetry/heartbeat
 * 匿名在线活跃设备低频心跳接口（严格字段白名单、去重防刷、免费额度熔断保护）。
 */
export async function submitTelemetryHeartbeat(req, env) {
    const body = await limitedJson(req, 2048);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json({ error: 'invalid_json' }, 400);
    }
    for (const k of Object.keys(body)) {
        if (!ALLOWED_HEARTBEAT_KEYS.has(k)) {
            return json({ error: 'unsafe_or_unknown_fields' }, 400);
        }
    }

    const installId = String(body.installId || '').trim();
    if (!UUID_V4_RE.test(installId)) {
        return json({ error: 'invalid_install_id' }, 400);
    }
    const versionCode = Number(body.versionCode);
    const versionName = cleanShortText(body.versionName, 32);
    if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2_000_000_000 || !/^[0-9]+\.[0-9]+\.[0-9]+/.test(versionName)) {
        return json({ error: 'invalid_version' }, 400);
    }

    const channel = body.channel === 'testing' ? 'testing' : 'stable';
    const androidVersion = cleanShortText(String(body.androidVersion || ''), 24);
    const deviceModel = cleanShortText(String(body.deviceModel || ''), 48);
    const isForeground = body.isForeground === true ? 1 : 0;
    const isPlaying = body.isPlaying === true ? 1 : 0;
    const previousVersionCode = Number.isInteger(body.previousVersionCode) && body.previousVersionCode > 0
        ? body.previousVersionCode
        : 0;

    // 速率限制：单 IP 每 10 分钟最多 18 次心跳，防止恶意脚本批量伪造请求
    const ip = await ipKey(req, env);
    const rlBucket = Math.floor(Date.now() / 600_000);
    if (!(await rate(env, `telhb:${ip}:${rlBucket}`, 18, 1200_000))) {
        return json({ error: 'rate_limit', nextIntervalSec: 1200 }, 429);
    }

    const cfg = await getTelemetrySettings(env);
    if (!cfg.enabled || cfg.throttleMode === 'paused_quota_guard') {
        return json({
            ok: true,
            accepted: false,
            throttleMode: cfg.throttleMode,
            nextIntervalSec: cfg.effectiveIntervalSec,
        });
    }

    const now = Date.now();
    const today = cfg.today;
    const deviceHash = await deriveDeviceHash(env, installId);
    const existing = await env.DB.prepare(
        'SELECT version_code, first_seen_day, last_seen_at, last_seen_day, is_foreground, is_playing, upgraded_from_code FROM telemetry_devices WHERE device_hash=?',
    ).bind(deviceHash).first();

    // 新设备注册单独限流：单 IP 每小时最多新增 6 台全新匿名设备，阻断伪造海量新增设备攻击
    if (!existing) {
        const newBucket = Math.floor(now / 3600_000);
        if (!(await rate(env, `telnew:${ip}:${newBucket}`, 6, 7200_000))) {
            return json({ error: 'new_device_rate_limit', nextIntervalSec: 1800 }, 429);
        }
    }

    // 8 分钟内同版本同日期的重复心跳直接内存级去重返回，零 D1 写入！
    const minDedupGapMs = Math.min(480_000, Math.floor(cfg.effectiveIntervalSec * 750));
    if (
        existing
        && existing.version_code === versionCode
        && existing.last_seen_day === today
        && now - existing.last_seen_at < minDedupGapMs
        && existing.is_foreground === isForeground
        && existing.is_playing === isPlaying
    ) {
        return json({
            ok: true,
            accepted: true,
            deduplicated: true,
            nextIntervalSec: cfg.effectiveIntervalSec,
        });
    }

    // 识别覆盖升级后的真实首次启动确认（仅当新版实际启动上报心跳时计入 install_confirmed）
    let detectedUpgradeFrom = 0;
    if (existing && existing.version_code > 0 && versionCode > existing.version_code) {
        detectedUpgradeFrom = existing.version_code;
    } else if (!existing && previousVersionCode > 0 && previousVersionCode < versionCode) {
        detectedUpgradeFrom = previousVersionCode;
    }

    const statements = [];
    let writeCount = 0;

    if (!cfg.startedDay) {
        statements.push(
            env.DB.prepare("UPDATE settings SET value=? WHERE key='telemetry_started_day' AND value=''").bind(today),
        );
        writeCount++;
    }

    if (!existing) {
        statements.push(
            env.DB.prepare(
                `INSERT INTO telemetry_devices(
                    device_hash, version_name, version_code, channel, android_version, device_model,
                    first_seen_at, first_seen_day, last_seen_at, last_seen_day,
                    is_foreground, is_playing, upgraded_from_code, upgrade_confirmed_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            ).bind(
                deviceHash,
                versionName,
                versionCode,
                channel,
                androidVersion,
                deviceModel,
                now,
                today,
                now,
                today,
                isForeground,
                isPlaying,
                detectedUpgradeFrom,
                detectedUpgradeFrom > 0 ? now : 0,
            ),
        );
        writeCount++;
    } else {
        statements.push(
            env.DB.prepare(
                `UPDATE telemetry_devices SET
                    version_name=?, version_code=?, channel=?, android_version=?, device_model=?,
                    last_seen_at=?, last_seen_day=?, is_foreground=?, is_playing=?,
                    upgraded_from_code = CASE WHEN ? > 0 THEN ? ELSE upgraded_from_code END,
                    upgrade_confirmed_at = CASE WHEN ? > 0 THEN ? ELSE upgrade_confirmed_at END
                 WHERE device_hash=?`,
            ).bind(
                versionName,
                versionCode,
                channel,
                androidVersion || 'unknown',
                deviceModel || 'unknown',
                now,
                today,
                isForeground,
                isPlaying,
                detectedUpgradeFrom,
                detectedUpgradeFrom,
                detectedUpgradeFrom,
                now,
                deviceHash,
            ),
        );
        writeCount++;
    }

    const isNewToday = !existing ? 1 : 0;
    if (!existing || existing.last_seen_day !== today || existing.version_code !== versionCode) {
        statements.push(
            env.DB.prepare(
                `INSERT INTO telemetry_device_days(device_hash, day, is_new, version_code, channel)
                 VALUES(?,?,?,?,?)
                 ON CONFLICT(device_hash, day) DO UPDATE SET version_code=excluded.version_code, channel=excluded.channel`,
            ).bind(deviceHash, today, isNewToday, versionCode, channel),
        );
        writeCount++;
    }

    if (detectedUpgradeFrom > 0) {
        statements.push(
            env.DB.prepare(
                `INSERT INTO telemetry_update_rollups(
                    day, version_code, version_name, channel, mirror_id,
                    download_started, download_succeeded, download_failed, verify_failed, install_confirmed, updated_at
                ) VALUES(?,?,?,?,?,0,0,0,0,1,?)
                ON CONFLICT(day, version_code, channel, mirror_id) DO UPDATE SET
                    version_name=excluded.version_name,
                    install_confirmed = telemetry_update_rollups.install_confirmed + 1,
                    updated_at=excluded.updated_at`,
            ).bind(today, versionCode, versionName, channel, 'boot_confirmed', now),
        );
        writeCount++;
    }

    await env.DB.batch(statements);
    await recordTelemetryWrites(env, cfg.writeKey, writeCount);

    return json({
        ok: true,
        accepted: true,
        deduplicated: false,
        upgradeConfirmed: detectedUpgradeFrom > 0,
        nextIntervalSec: cfg.effectiveIntervalSec,
    });
}

/**
 * POST /api/public/telemetry/update-event
 * 软件内更新下载、完成、失败、校验失败事件上报（聚合计数 + 设备级防重放去重）。
 */
export async function submitTelemetryUpdateEvent(req, env) {
    const body = await limitedJson(req, 2048);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return json({ error: 'invalid_json' }, 400);
    }
    for (const k of Object.keys(body)) {
        if (!ALLOWED_EVENT_KEYS.has(k)) {
            return json({ error: 'unsafe_or_unknown_fields' }, 400);
        }
    }

    const installId = String(body.installId || '').trim();
    if (!UUID_V4_RE.test(installId)) {
        return json({ error: 'invalid_install_id' }, 400);
    }
    const event = String(body.event || '');
    if (!ALLOWED_UPDATE_EVENTS.has(event)) {
        return json({ error: 'invalid_event' }, 400);
    }
    const targetVersionCode = Number(body.targetVersionCode);
    const targetVersionName = cleanShortText(String(body.targetVersionName || ''), 32);
    if (!Number.isInteger(targetVersionCode) || targetVersionCode < 1 || targetVersionCode > 2_000_000_000) {
        return json({ error: 'invalid_target_version' }, 400);
    }
    const channel = body.channel === 'testing' ? 'testing' : 'stable';
    const rawMirror = cleanShortText(String(body.mirrorId || 'unknown'), 32).toLowerCase();
    const mirrorId = rawMirror.startsWith('cnb')
        ? 'cnb-primary'
        : rawMirror.startsWith('github')
            ? 'github-backup'
            : (rawMirror.replace(/[^a-z0-9_-]/g, '') || 'unknown');

    const ip = await ipKey(req, env);
    if (!(await rate(env, `telupd:${ip}:${Math.floor(Date.now() / 600_000)}`, 24, 1200_000))) {
        return json({ error: 'rate_limit' }, 429);
    }

    const cfg = await getTelemetrySettings(env);
    if (!cfg.enabled || cfg.throttleMode === 'paused_quota_guard') {
        return json({ ok: true, accepted: false });
    }

    const now = Date.now();
    const deviceHash = await deriveDeviceHash(env, installId);
    // 同一设备对同一目标版本的同类事件每 2 小时最多计入 1 次，防止重试循环污染成功率
    const dedupKey = await hash(`tel-upd-dedup:${deviceHash}:${event}:${targetVersionCode}:${mirrorId}:${Math.floor(now / 7200_000)}`);
    const seen = await env.DB.prepare('SELECT hash FROM challenges WHERE hash=? AND expires_at>?').bind(dedupKey, now).first();
    if (seen) {
        return json({ ok: true, accepted: true, deduplicated: true });
    }

    const col = event; // verified in ALLOWED_UPDATE_EVENTS
    await env.DB.batch([
        env.DB.prepare('INSERT OR REPLACE INTO challenges(hash, expires_at) VALUES(?, ?)').bind(dedupKey, now + 7200_000),
        env.DB.prepare(
            `INSERT INTO telemetry_update_rollups(
                day, version_code, version_name, channel, mirror_id,
                download_started, download_succeeded, download_failed, verify_failed, install_confirmed, updated_at
            ) VALUES(?,?,?,?,?, ?,?,?,?, 0, ?)
            ON CONFLICT(day, version_code, channel, mirror_id) DO UPDATE SET
                version_name = CASE WHEN excluded.version_name != '' THEN excluded.version_name ELSE telemetry_update_rollups.version_name END,
                download_started = telemetry_update_rollups.download_started + excluded.download_started,
                download_succeeded = telemetry_update_rollups.download_succeeded + excluded.download_succeeded,
                download_failed = telemetry_update_rollups.download_failed + excluded.download_failed,
                verify_failed = telemetry_update_rollups.verify_failed + excluded.verify_failed,
                updated_at = excluded.updated_at`,
        ).bind(
            cfg.today,
            targetVersionCode,
            targetVersionName,
            channel,
            mirrorId,
            col === 'download_started' ? 1 : 0,
            col === 'download_succeeded' ? 1 : 0,
            col === 'download_failed' ? 1 : 0,
            col === 'verify_failed' ? 1 : 0,
            now,
        ),
    ]);
    await recordTelemetryWrites(env, cfg.writeKey, 2);
    invalidateTelemetrySummaryCache();

    return json({ ok: true, accepted: true });
}

/**
 * 同步 GitHub 与 CNB 官方 Release APK 下载次数，并写入当日下载快照。
 * 严格排除源码压缩包及非 APK 附件；若 CNB 官方接口未开放下载次数字段，cnb_downloads 保持 NULL（绝不伪造为 0）。
 */
export async function syncOfficialDownloadCounts(env, { force = false } = {}) {
    const now = Date.now();
    if (!force && now - lastDownloadSyncAt < 10 * 60_000) {
        return { ok: true, throttled: true };
    }
    lastDownloadSyncAt = now;
    const today = toCnDay(now);

    const dbReleases = (await env.DB.prepare('SELECT * FROM releases ORDER BY version_code DESC').all()).results;
    const byTag = new Map();
    const byVersionName = new Map();
    for (const r of dbReleases) {
        const tag = r.cnb_tag || (r.channel === 'stable' ? `v${r.version_name}` : `v${r.version_name}-testing`);
        byTag.set(tag, r);
        if (!byVersionName.has(r.version_name) || r.channel === 'stable') {
            byVersionName.set(r.version_name, r);
        }
    }

    const merged = new Map();

    // 1. 先载入 D1 已知的所有正式/测试版本记录（确保即使仅发在 CNB 的测试版也在版本表内）
    for (const r of dbReleases) {
        if (r.status === 'withdrawn' || r.status === 'draft') continue;
        const tag = r.cnb_tag || (r.channel === 'stable' ? `v${r.version_name}` : `v${r.version_name}-${r.channel}`);
        let urls = [];
        try { urls = JSON.parse(r.download_urls_json || '[]'); } catch { urls = []; }
        const cnbMirror = urls.find(u => String(u.id || '').startsWith('cnb') || String(u.url || '').includes('cnb.cool'));
        const ghMirror = urls.find(u => String(u.id || '').startsWith('github') || String(u.url || '').includes('github.com'));
        merged.set(tag, {
            tagName: tag,
            releaseId: r.id,
            versionName: r.version_name,
            versionCode: r.version_code,
            channel: r.channel,
            publishedAt: r.published_at ? new Date(r.published_at).toISOString() : new Date(r.created_at).toISOString(),
            cnbAssetId: r.cnb_release_id || '',
            cnbAssetName: cnbMirror ? String(cnbMirror.url).split('/').pop() || '' : '',
            cnbDownloads: null, // 官方未返回前严格为 null
            githubAssetId: '',
            githubAssetName: ghMirror ? String(ghMirror.url).split('/').pop() || '' : '',
            githubDownloads: null,
        });
    }

    // 2. 拉取 GitHub 官方 Releases 接口（公开免鉴权或可选 Token）
    let githubApiOk = false;
    let githubApiError = '';
    try {
        const headers = {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'Tingyu-DeveloperConsole/1.0',
        };
        if (env.GITHUB_PUBLIC_TOKEN) {
            headers.Authorization = `Bearer ${env.GITHUB_PUBLIC_TOKEN}`;
        }
        const ghRes = await fetch(GITHUB_RELEASES_API, { headers });
        if (ghRes.ok) {
            const list = await ghRes.json();
            if (Array.isArray(list)) {
                githubApiOk = true;
                for (const rel of list) {
                    if (rel.draft) continue;
                    const apkAssets = (rel.assets || []).filter(
                        a => a && typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk'),
                    );
                    if (!apkAssets.length) continue;
                    const tag = String(rel.tag_name || '').trim();
                    const verMatch = /(\d+\.\d+\.\d+(?:-[a-zA-Z0-9._-]+)?)/.exec(tag);
                    const verName = verMatch ? verMatch[1] : tag.replace(/^v/i, '');
                    const matchedDb = byTag.get(tag) || byVersionName.get(verName);
                    const ghSum = apkAssets.reduce((acc, a) => acc + (Number(a.download_count) || 0), 0);
                    const primaryApk = apkAssets[0];

                    const prev = merged.get(tag) || {
                        tagName: tag,
                        releaseId: matchedDb?.id || '',
                        versionName: matchedDb?.version_name || verName,
                        versionCode: matchedDb?.version_code || 0,
                        channel: matchedDb?.channel || (rel.prerelease || /test/i.test(tag) ? 'testing' : 'stable'),
                        publishedAt: rel.published_at || rel.created_at || '',
                        cnbAssetId: matchedDb?.cnb_release_id || '',
                        cnbAssetName: '',
                        cnbDownloads: null,
                    };
                    prev.githubAssetId = apkAssets.map(a => String(a.id)).join(',');
                    prev.githubAssetName = primaryApk.name;
                    prev.githubDownloads = ghSum;
                    merged.set(tag, prev);
                }
            }
        } else {
            githubApiError = `github_http_${ghRes.status}`;
        }
    } catch {
        githubApiError = 'github_network_error';
    }

    // 3. 尝试查询 CNB 官方 Releases 接口（若配置了只读凭据或公开可读，且官方返回可靠计数字段时采纳；否则诚实保留 null）
    let cnbCountSupported = false;
    if (env.CNB_READ_TOKEN) {
        try {
            const cnbRes = await fetch(CNB_RELEASES_API, {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${env.CNB_READ_TOKEN}`,
                    'User-Agent': 'Tingyu-DeveloperConsole/1.0',
                },
            });
            if (cnbRes.ok) {
                const raw = await cnbRes.json();
                const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
                for (const rel of items) {
                    const tag = String(rel.tag_name || '');
                    const apkAssets = (rel.assets || []).filter(
                        a => a && typeof a.name === 'string' && a.name.toLowerCase().endsWith('.apk') && !a.name.includes('seed'),
                    );
                    if (!apkAssets.length) continue;
                    const primary = apkAssets[0];
                    const hasCountField = apkAssets.some(
                        a => typeof a.download_count === 'number' || typeof a.downloadCount === 'number',
                    );
                    const entry = merged.get(tag);
                    if (entry) {
                        entry.cnbAssetId = String(primary.id || rel.id || entry.cnbAssetId);
                        entry.cnbAssetName = primary.name || entry.cnbAssetName;
                        if (hasCountField) {
                            cnbCountSupported = true;
                            entry.cnbDownloads = apkAssets.reduce(
                                (s, a) => s + Number(a.download_count ?? a.downloadCount ?? 0),
                                0,
                            );
                        }
                    }
                }
            }
        } catch { /* ignore CNB network failure and preserve existing/null */ }
    }

    // 4. 保留库中已登记的 cnb_asset_id / 既有已知计数（避免 GitHub 临时限流把历史已知计数冲掉）
    const existingRows = (await env.DB.prepare('SELECT * FROM release_download_stats').all()).results;
    const existingByTag = new Map(existingRows.map(r => [r.tag_name, r]));

    const batch = [];
    for (const item of merged.values()) {
        const old = existingByTag.get(item.tagName);
        const cnbDl = item.cnbDownloads !== null ? item.cnbDownloads : (old?.cnb_downloads ?? null);
        const ghDl = item.githubDownloads !== null ? item.githubDownloads : (old?.github_downloads ?? null);
        const totalKnown = (cnbDl ?? 0) + (ghDl ?? 0);
        const cnbAssetId = item.cnbAssetId || old?.cnb_asset_id || '';
        const cnbAssetName = item.cnbAssetName || old?.cnb_asset_name || '';
        const ghAssetId = item.githubAssetId || old?.github_asset_id || '';
        const ghAssetName = item.githubAssetName || old?.github_asset_name || '';

        batch.push(
            env.DB.prepare(
                `INSERT INTO release_download_stats(
                    tag_name, release_id, version_name, version_code, channel, published_at,
                    cnb_asset_id, cnb_asset_name, cnb_downloads,
                    github_asset_id, github_asset_name, github_downloads,
                    total_known_downloads, last_synced_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(tag_name) DO UPDATE SET
                    release_id = CASE WHEN excluded.release_id != '' THEN excluded.release_id ELSE release_download_stats.release_id END,
                    version_name = excluded.version_name,
                    version_code = CASE WHEN excluded.version_code > 0 THEN excluded.version_code ELSE release_download_stats.version_code END,
                    channel = excluded.channel,
                    published_at = CASE WHEN excluded.published_at != '' THEN excluded.published_at ELSE release_download_stats.published_at END,
                    cnb_asset_id = CASE WHEN excluded.cnb_asset_id != '' THEN excluded.cnb_asset_id ELSE release_download_stats.cnb_asset_id END,
                    cnb_asset_name = CASE WHEN excluded.cnb_asset_name != '' THEN excluded.cnb_asset_name ELSE release_download_stats.cnb_asset_name END,
                    cnb_downloads = excluded.cnb_downloads,
                    github_asset_id = CASE WHEN excluded.github_asset_id != '' THEN excluded.github_asset_id ELSE release_download_stats.github_asset_id END,
                    github_asset_name = CASE WHEN excluded.github_asset_name != '' THEN excluded.github_asset_name ELSE release_download_stats.github_asset_name END,
                    github_downloads = excluded.github_downloads,
                    total_known_downloads = excluded.total_known_downloads,
                    last_synced_at = excluded.last_synced_at`,
            ).bind(
                item.tagName,
                item.releaseId,
                item.versionName,
                item.versionCode,
                item.channel,
                item.publishedAt,
                cnbAssetId,
                cnbAssetName,
                cnbDl,
                ghAssetId,
                ghAssetName,
                ghDl,
                totalKnown,
                now,
            ),
        );

        batch.push(
            env.DB.prepare(
                `INSERT INTO release_download_snapshots(
                    day, tag_name, channel, cnb_downloads, github_downloads, total_known_downloads, captured_at
                ) VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(day, tag_name) DO UPDATE SET
                    cnb_downloads = excluded.cnb_downloads,
                    github_downloads = excluded.github_downloads,
                    total_known_downloads = excluded.total_known_downloads,
                    captured_at = excluded.captured_at`,
            ).bind(today, item.tagName, item.channel, cnbDl, ghDl, totalKnown, now),
        );
    }

    if (batch.length) {
        // Chunk batches to stay well within D1 batch statement limits
        for (let i = 0; i < batch.length; i += 40) {
            await env.DB.batch(batch.slice(i, i + 40));
        }
    }
    invalidateTelemetrySummaryCache();

    return {
        ok: true,
        syncedVersions: merged.size,
        githubApiOk,
        githubApiError,
        cnbCountSupported,
        syncedAt: now,
    };
}

/**
 * 定时归档昨日/历史日活、留存率、月活，并清理超过 45 天的细粒度 `telemetry_device_days` 明细记录。
 */
export async function rollupAndPruneTelemetry(env) {
    const now = Date.now();
    const today = toCnDay(now);

    // 聚合最近 10 天的日度指标（确保次日留存与 7 日留存在跨天后自动回填准确分子分母）
    for (let offset = 0; offset <= 9; offset++) {
        const targetDay = shiftCnDay(today, -offset);
        const dayStats = await env.DB.prepare(
            'SELECT count(*) AS dau, sum(is_new = 1) AS new_devs FROM telemetry_device_days WHERE day=?',
        ).bind(targetDay).first();
        const dau = Number(dayStats?.dau || 0);
        const newDevs = Number(dayStats?.new_devs || 0);
        if (dau === 0 && offset > 1) continue;

        const nextDay = shiftCnDay(targetDay, 1);
        const dayPlus7 = shiftCnDay(targetDay, 7);

        let ret1Cohort = 0;
        let ret1Retained = 0;
        if (nextDay <= today) {
            ret1Cohort = newDevs;
            if (ret1Cohort > 0) {
                const r1 = await env.DB.prepare(
                    `SELECT count(*) AS c FROM telemetry_device_days a
                     INNER JOIN telemetry_device_days b ON a.device_hash = b.device_hash
                     WHERE a.day=? AND a.is_new=1 AND b.day=?`,
                ).bind(targetDay, nextDay).first();
                ret1Retained = Number(r1?.c || 0);
            }
        }

        let ret7Cohort = 0;
        let ret7Retained = 0;
        if (dayPlus7 <= today) {
            ret7Cohort = newDevs;
            if (ret7Cohort > 0) {
                const r7 = await env.DB.prepare(
                    `SELECT count(*) AS c FROM telemetry_device_days a
                     INNER JOIN telemetry_device_days b ON a.device_hash = b.device_hash
                     WHERE a.day=? AND a.is_new=1 AND b.day=?`,
                ).bind(targetDay, dayPlus7).first();
                ret7Retained = Number(r7?.c || 0);
            }
        }

        await env.DB.prepare(
            `INSERT INTO telemetry_daily_rollups(
                day, dau, new_devices, ret_1d_cohort, ret_1d_retained, ret_7d_cohort, ret_7d_retained, updated_at
            ) VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(day) DO UPDATE SET
                dau=excluded.dau,
                new_devices=excluded.new_devices,
                ret_1d_cohort=excluded.ret_1d_cohort,
                ret_1d_retained=excluded.ret_1d_retained,
                ret_7d_cohort=excluded.ret_7d_cohort,
                ret_7d_retained=excluded.ret_7d_retained,
                updated_at=excluded.updated_at`,
        ).bind(targetDay, dau, newDevs, ret1Cohort, ret1Retained, ret7Cohort, ret7Retained, now).run();
    }

    // 更新当月月活聚合
    const curMonth = today.slice(0, 7);
    const mRow = await env.DB.prepare(
        'SELECT count(DISTINCT device_hash) AS mau, sum(is_new = 1) AS new_devs FROM telemetry_device_days WHERE day LIKE ?',
    ).bind(`${curMonth}-%`).first();
    if (Number(mRow?.mau || 0) > 0) {
        await env.DB.prepare(
            `INSERT INTO telemetry_monthly_rollups(month, mau, new_devices, updated_at)
             VALUES(?,?,?,?)
             ON CONFLICT(month) DO UPDATE SET mau=excluded.mau, new_devices=excluded.new_devices, updated_at=excluded.updated_at`,
        ).bind(curMonth, Number(mRow.mau || 0), Number(mRow.new_devs || 0), now).run();
    }

    // 清理超过 45 天的日活去重明细与超过 180 天的下载快照（保留永久 rollup 聚合表，控制 D1 存储零膨胀）
    const cutoff45d = shiftCnDay(today, -45);
    const cutoff180d = shiftCnDay(today, -180);
    await env.DB.batch([
        env.DB.prepare('DELETE FROM telemetry_device_days WHERE day < ?').bind(cutoff45d),
        env.DB.prepare('DELETE FROM release_download_snapshots WHERE day < ?').bind(cutoff180d),
    ]);
}

/**
 * 构建下载统计汇总与每日趋势（严格诚实：无历史快照时不伪造昨日/7日增量；CNB 无官方计数时返回 null）。
 */
export async function queryDownloadAnalytics(env, { sinceDay, untilDay }) {
    const versionRows = (await env.DB.prepare(
        'SELECT * FROM release_download_stats ORDER BY version_code DESC, published_at DESC',
    ).all()).results;

    const inAppMirrorRows = (await env.DB.prepare(
        `SELECT version_code, mirror_id,
                sum(download_started) AS started,
                sum(download_succeeded) AS succeeded
         FROM telemetry_update_rollups
         GROUP BY version_code, mirror_id`,
    ).all()).results;

    const inAppByVersion = new Map();
    let inAppCnbDownloads = 0;
    let inAppGithubDownloads = 0;
    for (const r of inAppMirrorRows) {
        if (r.mirror_id === 'boot_confirmed') continue;
        const okCount = Number(r.succeeded || 0);
        const cur = inAppByVersion.get(r.version_code) || { cnb: 0, github: 0, other: 0 };
        if (r.mirror_id === 'cnb-primary') {
            cur.cnb += okCount;
            inAppCnbDownloads += okCount;
        } else if (r.mirror_id === 'github-backup') {
            cur.github += okCount;
            inAppGithubDownloads += okCount;
        } else {
            cur.other += okCount;
        }
        inAppByVersion.set(r.version_code, cur);
    }

    let totalCumulative = 0;
    let githubTotal = 0;
    let cnbTotal = 0;
    let anyCnbOfficialCount = false;
    let stableTotal = 0;
    let testingTotal = 0;
    let lastSyncedAt = 0;

    const versions = versionRows.map(v => {
        const cnbDl = v.cnb_downloads !== null && v.cnb_downloads !== undefined ? Number(v.cnb_downloads) : null;
        const ghDl = v.github_downloads !== null && v.github_downloads !== undefined ? Number(v.github_downloads) : null;
        if (cnbDl !== null) {
            anyCnbOfficialCount = true;
            cnbTotal += cnbDl;
        }
        if (ghDl !== null) {
            githubTotal += ghDl;
        }
        const inApp = inAppByVersion.get(v.version_code) || { cnb: 0, github: 0, other: 0 };
        // 若 CNB 暂无官方计数，合计值采用「GitHub 官方下载数 + 应用内 CNB 更新完成数」，并在字段中清晰拆分不混淆
        const effectiveTotal = (cnbDl !== null ? cnbDl : inApp.cnb) + (ghDl ?? 0);
        totalCumulative += effectiveTotal;
        if (v.channel === 'testing') testingTotal += effectiveTotal;
        else stableTotal += effectiveTotal;
        if (v.last_synced_at > lastSyncedAt) lastSyncedAt = v.last_synced_at;

        return {
            tagName: v.tag_name,
            releaseId: v.release_id,
            versionName: v.version_name,
            versionCode: v.version_code,
            publishedAt: v.published_at,
            channel: v.channel,
            assetName: v.cnb_asset_name || v.github_asset_name || '',
            cnbAssetId: v.cnb_asset_id,
            cnbDownloads: cnbDl, // null when CNB API does not expose count!
            inAppCnbDownloads: inApp.cnb,
            inAppGithubDownloads: inApp.github,
            githubAssetId: v.github_asset_id,
            githubDownloads: ghDl,
            totalDownloads: effectiveTotal,
            lastSyncedAt: v.last_synced_at,
        };
    });

    // 每日快照与真实增量计算
    const snapRows = (await env.DB.prepare(
        `SELECT day, sum(total_known_downloads) AS total_dl
         FROM release_download_snapshots
         GROUP BY day
         ORDER BY day ASC`,
    ).all()).results;

    const snapByDay = new Map(snapRows.map(r => [r.day, Number(r.total_dl || 0)]));
    const firstSnapshotDay = snapRows[0]?.day || '';
    const today = toCnDay();
    const yesterday = shiftCnDay(today, -1);
    const day7Ago = shiftCnDay(today, -7);
    const day30Ago = shiftCnDay(today, -30);

    const calcDelta = (endDay, startDay) => {
        if (!snapByDay.has(endDay) || !snapByDay.has(startDay)) return null;
        return Math.max(0, snapByDay.get(endDay) - snapByDay.get(startDay));
    };

    const todayNewDownloads = calcDelta(today, yesterday);
    const yesterdayDownloads = calcDelta(yesterday, shiftCnDay(today, -2));
    const last7dDownloads = calcDelta(today, day7Ago);
    const last30dDownloads = calcDelta(today, day30Ago);

    const dailyTrend = snapRows
        .filter(r => (!sinceDay || r.day >= sinceDay) && (!untilDay || r.day <= untilDay))
        .map(r => {
            const prevDay = shiftCnDay(r.day, -1);
            const hasPrev = snapByDay.has(prevDay);
            return {
                day: r.day,
                cumulativeDownloads: Number(r.total_dl || 0),
                dailyNewDownloads: hasPrev ? Math.max(0, Number(r.total_dl || 0) - snapByDay.get(prevDay)) : null,
            };
        });

    const ranking = [...versions].sort((a, b) => b.totalDownloads - a.totalDownloads).slice(0, 10);

    return {
        totalCumulativeDownloads: totalCumulative,
        cnbOfficialStatsAvailable: anyCnbOfficialCount,
        cnbOfficialTotalDownloads: anyCnbOfficialCount ? cnbTotal : null,
        cnbStatusNote: anyCnbOfficialCount
            ? '来自 CNB 官方 Release 附件接口'
            : 'CNB 官方 Release OpenAPI 暂未开放附件 download_count 字段（拒绝伪造为 0；已单独统计应用内更新经 CNB 节点完成数）',
        githubOfficialTotalDownloads: githubTotal,
        inAppNodeDownloads: {
            cnbPrimary: inAppCnbDownloads,
            githubBackup: inAppGithubDownloads,
        },
        stableDownloads: stableTotal,
        testingDownloads: testingTotal,
        todayNewDownloads,
        yesterdayDownloads,
        last7dDownloads,
        last30dDownloads,
        snapshotStartedDay: firstSnapshotDay,
        lastSyncedAt,
        versions,
        ranking,
        dailyTrend,
    };
}

/**
 * GET /api/admin/telemetry/summary
 * 管理员专用运营统计总览接口（支持时间范围筛选 + 30 秒缓存保护 D1 读取额度）。
 */
export async function getAdminTelemetrySummary(url, env) {
    const now = Date.now();
    const today = toCnDay(now);
    const range = url.searchParams.get('range') || '7d';
    const forceFresh = url.searchParams.get('fresh') === '1';

    let sinceDay = shiftCnDay(today, -6);
    let untilDay = today;
    if (range === 'today') {
        sinceDay = today;
    } else if (range === '30d') {
        sinceDay = shiftCnDay(today, -29);
    } else if (range === 'custom') {
        const s = cleanShortText(url.searchParams.get('since') || '', 10);
        const u = cleanShortText(url.searchParams.get('until') || '', 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) sinceDay = s;
        if (/^\d{4}-\d{2}-\d{2}$/.test(u)) untilDay = u;
    }

    const cacheKey = `${range}:${sinceDay}:${untilDay}`;
    if (!forceFresh && summaryCache.key === cacheKey && summaryCache.expiresAt > now && summaryCache.payload) {
        return json(summaryCache.payload);
    }

    // 若尚未同步过官方下载统计且非本地单测域名，自动执行一次轻量同步
    const dlCountRow = await env.DB.prepare('SELECT count(*) AS c FROM release_download_stats').first();
    const isLocalTest = url.hostname === 'test.invalid' || url.hostname === '127.0.0.1';
    if (Number(dlCountRow?.c || 0) === 0 && !isLocalTest) {
        await syncOfficialDownloadCounts(env, { force: true });
    }

    // 确保今日/近期 rollup 最新
    await rollupAndPruneTelemetry(env);

    const cfg = await getTelemetrySettings(env);
    const activeCutoffMs = now - cfg.activeWindowMinutes * 60_000;
    const yesterday = shiftCnDay(today, -1);
    const day7Start = shiftCnDay(today, -6);
    const day30Start = shiftCnDay(today, -29);

    const [
        activeNowRow,
        totalDevicesRow,
        todayRow,
        yesterdayRow,
        active7dRow,
        active30dRow,
        dailyRollups,
        monthlyRollups,
        versionDistRows,
        androidDistRows,
        modelDistRows,
        updateRollupRows,
        stablePolicyRow,
        feedbackByVerRows,
        issueByVerRows,
    ] = await Promise.all([
        env.DB.prepare('SELECT count(*) AS c FROM telemetry_devices WHERE last_seen_at >= ?').bind(activeCutoffMs).first(),
        env.DB.prepare('SELECT count(*) AS c FROM telemetry_devices').first(),
        env.DB.prepare('SELECT count(*) AS dau, sum(is_new = 1) AS new_devs FROM telemetry_device_days WHERE day=?').bind(today).first(),
        env.DB.prepare('SELECT count(*) AS dau, sum(is_new = 1) AS new_devs FROM telemetry_device_days WHERE day=?').bind(yesterday).first(),
        env.DB.prepare('SELECT count(DISTINCT device_hash) AS c FROM telemetry_device_days WHERE day >= ?').bind(day7Start).first(),
        env.DB.prepare('SELECT count(DISTINCT device_hash) AS c FROM telemetry_device_days WHERE day >= ?').bind(day30Start).first(),
        env.DB.prepare('SELECT * FROM telemetry_daily_rollups WHERE day >= ? AND day <= ? ORDER BY day ASC').bind(sinceDay, untilDay).all(),
        env.DB.prepare('SELECT * FROM telemetry_monthly_rollups ORDER BY month ASC LIMIT 12').all(),
        env.DB.prepare(
            `SELECT version_name, version_code, channel, count(*) AS devices,
                    sum(last_seen_at >= ?) AS active_recent
             FROM telemetry_devices
             WHERE last_seen_day >= ?
             GROUP BY version_name, version_code, channel
             ORDER BY version_code DESC`,
        ).bind(activeCutoffMs, day30Start).all(),
        env.DB.prepare(
            `SELECT CASE WHEN android_version='' THEN '未知' ELSE android_version END AS label, count(*) AS devices
             FROM telemetry_devices
             WHERE last_seen_day >= ?
             GROUP BY label ORDER BY devices DESC LIMIT 12`,
        ).bind(day30Start).all(),
        env.DB.prepare(
            `SELECT CASE WHEN device_model='' THEN '未知型号' ELSE device_model END AS label, count(*) AS devices
             FROM telemetry_devices
             WHERE last_seen_day >= ?
             GROUP BY label ORDER BY devices DESC LIMIT 15`,
        ).bind(day30Start).all(),
        env.DB.prepare(
            `SELECT mirror_id, version_code, version_name,
                    sum(download_started) AS started,
                    sum(download_succeeded) AS succeeded,
                    sum(download_failed) AS failed,
                    sum(verify_failed) AS verify_failed,
                    sum(install_confirmed) AS install_confirmed
             FROM telemetry_update_rollups
             WHERE day >= ? AND day <= ?
             GROUP BY mirror_id, version_code, version_name`,
        ).bind(sinceDay, untilDay).all(),
        env.DB.prepare("SELECT latest_version_name, latest_version_code FROM update_policies WHERE channel='stable'").first(),
        env.DB.prepare(
            `SELECT version,
                    count(*) AS total_fb,
                    sum(category = 'crash') AS crash_fb,
                    sum(category IN ('playback', 'stutter')) AS playback_fb,
                    sum(status = 'fixed') AS resolved_fb,
                    sum(status IN ('pending', 'investigating', 'verification')) AS open_fb
             FROM feedback
             WHERE phase='ready' AND expires_at > ?
             GROUP BY version`,
        ).bind(now).all(),
        env.DB.prepare(
            `SELECT fixed_version, workflow_stage, count(*) AS cnt
             FROM issue_notes
             GROUP BY fixed_version, workflow_stage`,
        ).all(),
    ]);

    const downloads = await queryDownloadAnalytics(env, { sinceDay, untilDay });

    // 计算留存率（仅在对应观察窗口已完整跨过次日 / 7 日且样本 cohort >= 1 时给出百分比，否则返回 null 显示“暂无足够数据”）
    const recentRollupsAll = (await env.DB.prepare(
        'SELECT * FROM telemetry_daily_rollups ORDER BY day DESC LIMIT 16',
    ).all()).results;
    const latest1dEligible = recentRollupsAll.find(r => shiftCnDay(r.day, 1) <= today && r.ret_1d_cohort > 0);
    const latest7dEligible = recentRollupsAll.find(r => shiftCnDay(r.day, 7) <= today && r.ret_7d_cohort > 0);

    const ret1d = latest1dEligible
        ? {
            cohortDay: latest1dEligible.day,
            cohortSize: latest1dEligible.ret_1d_cohort,
            retained: latest1dEligible.ret_1d_retained,
            ratePercent: Number(((latest1dEligible.ret_1d_retained / latest1dEligible.ret_1d_cohort) * 100).toFixed(1)),
        }
        : { cohortDay: null, cohortSize: 0, retained: 0, ratePercent: null };

    const ret7d = latest7dEligible
        ? {
            cohortDay: latest7dEligible.day,
            cohortSize: latest7dEligible.ret_7d_cohort,
            retained: latest7dEligible.ret_7d_retained,
            ratePercent: Number(((latest7dEligible.ret_7d_retained / latest7dEligible.ret_7d_cohort) * 100).toFixed(1)),
        }
        : { cohortDay: null, cohortSize: 0, retained: 0, ratePercent: null };

    // 版本分布占比与最新正式版使用率
    const active30Total = versionDistRows.results.reduce((s, r) => s + Number(r.devices || 0), 0);
    const latestStableCode = Number(stablePolicyRow?.latest_version_code || 0);
    const latestStableName = stablePolicyRow?.latest_version_name || '';
    let latestStableDevices = 0;
    let testingChannelDevices = 0;

    const byVersion = versionDistRows.results.map(r => {
        const count = Number(r.devices || 0);
        if (latestStableCode > 0 && r.version_code === latestStableCode && r.channel === 'stable') {
            latestStableDevices += count;
        }
        if (r.channel === 'testing') {
            testingChannelDevices += count;
        }
        return {
            versionName: r.version_name,
            versionCode: r.version_code,
            channel: r.channel,
            devices: count,
            activeRecent: Number(r.active_recent || 0),
            sharePercent: active30Total > 0 ? Number(((count / active30Total) * 100).toFixed(1)) : null,
        };
    });

    const latestStableSharePercent = active30Total > 0 && latestStableCode > 0
        ? Number(((latestStableDevices / active30Total) * 100).toFixed(1))
        : null;
    const testingSharePercent = active30Total > 0
        ? Number(((testingChannelDevices / active30Total) * 100).toFixed(1))
        : null;

    // 软件内更新漏斗聚合
    let dlStarted = 0;
    let dlSucceeded = 0;
    let dlFailed = 0;
    let verifyFailed = 0;
    let installConfirmed = 0;
    const mirrorUsageMap = new Map();

    for (const r of updateRollupRows.results) {
        if (r.mirror_id === 'boot_confirmed') {
            installConfirmed += Number(r.install_confirmed || 0);
            continue;
        }
        const st = Number(r.started || 0);
        const ok = Number(r.succeeded || 0);
        const fail = Number(r.failed || 0);
        const vf = Number(r.verify_failed || 0);
        dlStarted += st;
        dlSucceeded += ok;
        dlFailed += fail;
        verifyFailed += vf;
        const m = mirrorUsageMap.get(r.mirror_id) || { mirrorId: r.mirror_id, started: 0, succeeded: 0, failed: 0 };
        m.started += st;
        m.succeeded += ok;
        m.failed += fail;
        mirrorUsageMap.set(r.mirror_id, m);
    }
    const totalTerminalDl = dlSucceeded + dlFailed;

    // 版本健康交叉矩阵（按版本并列展示活跃设备与反馈数，绝不混算虚假故障率）
    const allKnownVersions = new Set([
        ...byVersion.map(v => v.versionName),
        ...feedbackByVerRows.results.map(f => f.version).filter(Boolean),
        ...downloads.versions.map(v => v.versionName),
    ]);
    const activeByVerName = new Map();
    for (const v of byVersion) {
        activeByVerName.set(v.versionName, (activeByVerName.get(v.versionName) || 0) + v.devices);
    }
    const fbByVerName = new Map(feedbackByVerRows.results.map(f => [f.version, f]));
    const issueResolvedByVer = new Map();
    for (const r of issueByVerRows.results) {
        if (!r.fixed_version) continue;
        const cur = issueResolvedByVer.get(r.fixed_version) || { resolved: 0, open: 0 };
        if (r.workflow_stage === 'published' || r.workflow_stage === 'verified_resolved') {
            cur.resolved += Number(r.cnt || 0);
        } else {
            cur.open += Number(r.cnt || 0);
        }
        issueResolvedByVer.set(r.fixed_version, cur);
    }

    const versionHealthMatrix = [...allKnownVersions]
        .filter(Boolean)
        .slice(0, 25)
        .map(ver => {
            const fb = fbByVerName.get(ver);
            const iss = issueResolvedByVer.get(ver);
            return {
                versionName: ver,
                observedActiveDevices: activeByVerName.has(ver) ? activeByVerName.get(ver) : null,
                totalFeedback: Number(fb?.total_fb || 0),
                crashFeedback: Number(fb?.crash_fb || 0),
                playbackFeedback: Number(fb?.playback_fb || 0),
                resolvedItems: Number(fb?.resolved_fb || 0) + Number(iss?.resolved || 0),
                openItems: Number(fb?.open_fb || 0),
            };
        });

    const payload = {
        range: { mode: range, sinceDay, untilDay },
        coverageMeta: {
            telemetryEnabled: cfg.enabled,
            baseIntervalSec: cfg.baseIntervalSec,
            effectiveIntervalSec: cfg.effectiveIntervalSec,
            activeWindowMinutes: cfg.activeWindowMinutes,
            throttleMode: cfg.throttleMode,
            startedDay: cfg.startedDay || null,
            dailyWritesUsed: cfg.usedWrites,
            dailyWriteBudget: cfg.dailyBudget,
            scopeNote: '仅统计 v1.5.82 及以上且用户主动开启「匿名使用统计」开关的设备；旧版本与未开启统计的用户不纳入活跃设备统计，累计观测设备不等于实际总安装人数。',
        },
        kpis: {
            activeRecentDevices: Number(activeNowRow?.c || 0),
            dauToday: Number(todayRow?.dau || 0),
            dauYesterday: Number(yesterdayRow?.dau || 0),
            active7d: Number(active7dRow?.c || 0),
            active30d: Number(active30dRow?.c || 0),
            totalObservedDevices: Number(totalDevicesRow?.c || 0),
            newToday: Number(todayRow?.new_devs || 0),
            newYesterday: Number(yesterdayRow?.new_devs || 0),
            latestStableVersionName: latestStableName,
            latestStableSharePercent,
            testingSharePercent,
        },
        retention: {
            day1: ret1d,
            day7: ret7d,
        },
        trends: {
            dailyActiveAndNew: dailyRollups.results.map(r => ({
                day: r.day,
                dau: r.dau,
                newDevices: r.new_devices,
            })),
            monthlyActive: monthlyRollups.results.map(r => ({
                month: r.month,
                mau: r.mau,
                newDevices: r.new_devices,
            })),
        },
        distributions: {
            byVersion,
            byAndroidVersion: androidDistRows.results,
            byDeviceModel: modelDistRows.results,
        },
        updateFunnel: {
            downloadStarted: dlStarted,
            downloadSucceeded: dlSucceeded,
            downloadFailed: dlFailed,
            verifyFailed,
            installConfirmed,
            downloadSuccessRatePercent: totalTerminalDl > 0 ? Number(((dlSucceeded / totalTerminalDl) * 100).toFixed(1)) : null,
            downloadFailureRatePercent: totalTerminalDl > 0 ? Number(((dlFailed / totalTerminalDl) * 100).toFixed(1)) : null,
            newVersionCoveragePercent: latestStableSharePercent,
            byMirror: [...mirrorUsageMap.values()],
            installConfirmNote: '覆盖安装成功仅在新版 App 实际冷启动上报版本推进心跳后确认计入，不以拉起系统安装器为准。',
        },
        downloads,
        versionHealthMatrix,
        generatedAt: now,
    };

    summaryCache = {
        key: cacheKey,
        expiresAt: now + 30_000,
        payload,
    };
    return json(payload);
}

/**
 * PATCH /api/admin/telemetry/config
 * 管理员更新统计总开关、心跳间隔与每日免费额度写入预算。
 */
export async function updateAdminTelemetryConfig(req, env, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const body = await limitedJson(req, 1024);
    const statements = [];
    if (typeof body.telemetryEnabled === 'boolean') {
        statements.push(
            env.DB.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('telemetry_enabled', ?)").bind(String(body.telemetryEnabled)),
        );
    }
    if (body.intervalSec !== undefined) {
        const sec = Math.max(300, Math.min(7200, Number(body.intervalSec) || 600));
        statements.push(
            env.DB.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('telemetry_interval_sec', ?)").bind(String(sec)),
        );
    }
    if (body.dailyWriteBudget !== undefined) {
        const b = Math.max(1000, Math.min(90000, Number(body.dailyWriteBudget) || 40000));
        statements.push(
            env.DB.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('telemetry_daily_write_budget', ?)").bind(String(b)),
        );
    }
    if (!statements.length) return json({ error: 'no_valid_fields' }, 400);
    await env.DB.batch(statements);
    invalidateTelemetrySummaryCache();
    return json({ ok: true, config: await getTelemetrySettings(env) });
}
