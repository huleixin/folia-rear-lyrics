import {
    TINGYU_APP_ID,
    DEFAULT_OFFLINE_GRACE_HOURS,
    signUpdateManifest,
    derToP1363,
    base64ToBytes,
} from '../../shared/updateProtocol.mjs';
import { json, hash, equal, random, limitedJson, rate, ipKey, signed, verified } from './security.mjs';
import { appendAuditLog, getSigningCredentials } from './releases.mjs';

// feedback-server/src/beta.mjs
// 听屿私有内测权限体系服务端：
// 1. 一次性高熵邀请码生成（仅存加盐单向散列，绝不存可兑换明文）与原子化防并发兑换。
// 2. 基于 Android Keystore ECDSA-P256 设备公钥的 PoP 验签、防重放与可撤销长期/短期授权。
// 3. 私有内测策略下发（实时签发短期 R2 下载凭据并签名）与支持 HTTP Range 断点续传的受保护 R2 APK 分发。

const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 去除 0/O/1/I/L 易混淆字符
const DEFAULT_INVITE_TTL_MS = 5 * 60_000; // 默认 5 分钟
const DEFAULT_TESTER_AUTH_MS = 30 * 86400_000; // 默认 30 天
const DOWNLOAD_TICKET_TTL_MS = 15 * 60_000; // 15 分钟短期下载凭据（过期后已授权设备可无缝重领）
const MAX_CLOCK_SKEW_MS = 10 * 60_000;

function cleanText(val, maxLen = 64) {
    if (typeof val !== 'string') return '';
    return val.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, maxLen);
}

function generateInviteCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    let chars = '';
    for (let i = 0; i < 12; i++) {
        chars += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
    }
    return `TYB-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function normalizeInviteCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function hashInviteCode(env, rawCode) {
    const pepper = String(env.FEEDBACK_ADMIN_TOKEN || 'ty-beta-pepper').slice(0, 24);
    return hash(`ty-beta-invite-v1:${pepper}:${normalizeInviteCode(rawCode)}`);
}

async function hashInstallId(env, installId) {
    const pepper = String(env.FEEDBACK_ADMIN_TOKEN || 'ty-beta-pepper').slice(0, 24);
    return hash(`ty-beta-device-v1:${pepper}:${String(installId).trim().toLowerCase()}`);
}

async function verifyDevicePopSignature(spkiBase64, signatureBase64, payloadString) {
    try {
        const spkiBytes = base64ToBytes(spkiBase64);
        const key = await crypto.subtle.importKey(
            'spki',
            spkiBytes,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
        );
        const derBytes = base64ToBytes(signatureBase64);
        const p1363 = derToP1363(derBytes);
        const data = new TextEncoder().encode(payloadString);
        return await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            p1363,
            data,
        );
    } catch {
        return false;
    }
}

async function authenticateBetaDevice(req, env, path, rawBodyText) {
    let body;
    try {
        body = rawBodyText ? JSON.parse(rawBodyText) : {};
    } catch {
        return { ok: false, status: 400, error: 'invalid_json' };
    }
    const installId = String(body.installId || '').trim();
    const deviceToken = String(req.headers.get('X-Beta-Token') || body.deviceToken || '').trim();
    const timestamp = Number(req.headers.get('X-Beta-Timestamp') || body.timestamp || 0);
    const nonce = String(req.headers.get('X-Beta-Nonce') || body.nonce || '').trim();
    const signature = String(req.headers.get('X-Beta-Signature') || body.signature || '').trim();

    if (!/^[0-9a-f-]{36}$/i.test(installId) || deviceToken.length < 32 || !/^[a-zA-Z0-9_-]{12,96}$/.test(nonce) || signature.length < 64) {
        return { ok: false, status: 401, error: 'beta_credentials_missing' };
    }
    const now = Date.now();
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS) {
        return { ok: false, status: 401, error: 'beta_timestamp_skew' };
    }

    const installHash = await hashInstallId(env, installId);
    const device = await env.DB.prepare(
        'SELECT * FROM beta_devices WHERE install_id_hash=?',
    ).bind(installHash).first();
    if (!device) {
        return { ok: false, status: 403, error: 'beta_unauthorized' };
    }
    if (device.status !== 'active') {
        return { ok: false, status: 403, error: 'beta_revoked' };
    }
    if (device.expires_at > 0 && device.expires_at <= now) {
        return { ok: false, status: 403, error: 'beta_expired' };
    }

    const providedTokenHash = await hash(deviceToken);
    if (!(await equal(providedTokenHash, device.token_hash))) {
        return { ok: false, status: 403, error: 'beta_token_invalid' };
    }

    const bodySha256 = await hash(rawBodyText || '');
    const canonicalSignInput = `${req.method.toUpperCase()}|${path}|${installId}|${timestamp}|${nonce}|${bodySha256}`;
    const sigOk = await verifyDevicePopSignature(device.public_key_spki, signature, canonicalSignInput);
    if (!sigOk) {
        return { ok: false, status: 403, error: 'beta_pop_signature_invalid' };
    }

    // 防重放（nonce 在 15 分钟窗口内仅允许使用一次）
    const replayKey = await hash(`beta-pop:${device.id}:${nonce}`);
    const seen = await env.DB.prepare('SELECT hash FROM challenges WHERE hash=? AND expires_at>?').bind(replayKey, now).first();
    if (seen) {
        return { ok: false, status: 409, error: 'beta_nonce_replayed' };
    }
    await env.DB.prepare('INSERT OR REPLACE INTO challenges(hash, expires_at) VALUES(?, ?)').bind(replayKey, now + 15 * 60_000).run();

    // 刷新最近验证时间与非敏感端侧版本信息
    const nextAppVer = cleanText(body.appVersionName || '', 32) || device.app_version_name;
    const nextAppCode = Number.isInteger(body.appVersionCode) && body.appVersionCode > 0
        ? body.appVersionCode
        : device.app_version_code;
    const nextChannel = ['stable', 'private_beta'].includes(body.activeChannel)
        ? body.activeChannel
        : device.active_channel;

    await env.DB.prepare(
        `UPDATE beta_devices SET last_verified_at=?, app_version_name=?, app_version_code=?, active_channel=? WHERE id=?`,
    ).bind(now, nextAppVer, nextAppCode, nextChannel, device.id).run();

    return { ok: true, device: { ...device, last_verified_at: now, app_version_name: nextAppVer, app_version_code: nextAppCode, active_channel: nextChannel }, body, now };
}

/** POST /api/beta/redeem — 一次性邀请码兑换并绑定客户端 Keystore 公钥 */
export async function redeemBetaInvite(req, env) {
    const ip = await ipKey(req, env);
    if (!(await rate(env, `betared:${ip}:${Math.floor(Date.now() / 900_000)}`, 12, 1800_000))) {
        return json({ error: 'rate_limit' }, 429);
    }

    const body = await limitedJson(req, 4096);
    const codeRaw = String(body.code || '').trim();
    const normalizedCode = normalizeInviteCode(codeRaw);
    const installId = String(body.installId || '').trim();
    const publicKeySpki = String(body.publicKeySpki || '').trim();

    if (normalizedCode.length < 8 || normalizedCode.length > 32) {
        return json({ error: 'invite_invalid' }, 400);
    }
    if (!/^[0-9a-f-]{36}$/i.test(installId)) {
        return json({ error: 'invalid_install_id' }, 400);
    }
    // 校验是否为合法 ECDSA P-256 SPKI 公钥
    try {
        const spkiBytes = base64ToBytes(publicKeySpki);
        await crypto.subtle.importKey('spki', spkiBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    } catch {
        return json({ error: 'invalid_device_public_key' }, 400);
    }

    const now = Date.now();
    const codeHash = await hashInviteCode(env, codeRaw);
    const deviceId = 'dev-' + crypto.randomUUID().slice(0, 18);

    // 原子化兑换：单条 UPDATE ... WHERE ... RETURNING * 严格防止并发重复兑换同一个邀请码
    const consumed = await env.DB.prepare(
        `UPDATE beta_invites
         SET used_count = used_count + 1,
             status = CASE WHEN used_count + 1 >= max_uses THEN 'used' ELSE 'active' END,
             used_at = ?,
             used_by_device_id = ?
         WHERE code_hash = ?
           AND status = 'active'
           AND used_count < max_uses
           AND invite_expires_at > ?
         RETURNING *`,
    ).bind(now, deviceId, codeHash, now).first();

    if (!consumed) {
        const existingInvite = await env.DB.prepare(
            'SELECT status, used_count, max_uses, invite_expires_at FROM beta_invites WHERE code_hash=?',
        ).bind(codeHash).first();
        if (!existingInvite) return json({ error: 'invite_invalid' }, 404);
        if (existingInvite.status === 'cancelled') return json({ error: 'invite_cancelled' }, 403);
        if (existingInvite.status === 'used' || existingInvite.used_count >= existingInvite.max_uses) {
            return json({ error: 'invite_used' }, 409);
        }
        if (existingInvite.invite_expires_at <= now) {
            return json({ error: 'invite_expired' }, 410);
        }
        return json({ error: 'invite_invalid' }, 400);
    }

    const deviceToken = random();
    const tokenHash = await hash(deviceToken);
    const installHash = await hashInstallId(env, installId);
    const expiresAt = consumed.auth_duration_ms > 0 ? now + consumed.auth_duration_ms : 0;
    const deviceModel = cleanText(body.deviceModel || '', 48);
    const androidVersion = cleanText(body.androidVersion || '', 24);
    const appVersionName = cleanText(body.appVersionName || '', 32);
    const appVersionCode = Number.isInteger(body.appVersionCode) ? body.appVersionCode : 0;

    await env.DB.prepare(
        `INSERT INTO beta_devices(
            id, install_id_hash, token_hash, public_key_spki, role, note,
            device_model, android_version, app_version_name, app_version_code,
            active_channel, status, activated_at, last_verified_at, expires_at,
            revoked_at, revoke_reason, invite_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?,'private_beta','active',?,?,?,0,'',?)
        ON CONFLICT(install_id_hash) DO UPDATE SET
            id = excluded.id,
            token_hash = excluded.token_hash,
            public_key_spki = excluded.public_key_spki,
            role = excluded.role,
            note = CASE WHEN excluded.note != '' THEN excluded.note ELSE beta_devices.note END,
            device_model = excluded.device_model,
            android_version = excluded.android_version,
            app_version_name = excluded.app_version_name,
            app_version_code = excluded.app_version_code,
            active_channel = 'private_beta',
            status = 'active',
            activated_at = excluded.activated_at,
            last_verified_at = excluded.last_verified_at,
            expires_at = excluded.expires_at,
            revoked_at = 0,
            revoke_reason = '',
            invite_id = excluded.invite_id`,
    ).bind(
        deviceId,
        installHash,
        tokenHash,
        publicKeySpki,
        consumed.role,
        consumed.note || '',
        deviceModel,
        androidVersion,
        appVersionName,
        appVersionCode,
        now,
        now,
        expiresAt,
        consumed.id,
    ).run();

    await appendAuditLog(env, {
        actorRole: 'beta_client',
        action: 'beta_invite_redeem',
        channel: 'private_beta',
        result: 'ok',
        detail: {
            inviteId: consumed.id,
            deviceId,
            role: consumed.role,
            expiresAt,
        },
    });

    return json({
        ok: true,
        authorized: true,
        deviceId,
        deviceToken,
        role: consumed.role,
        note: consumed.note || '',
        activatedAt: now,
        expiresAt,
        serverTimeMs: now,
    });
}

/** POST /api/beta/verify — 已授权设备在线校验与刷新授权状态 */
export async function verifyBetaDevice(req, env) {
    const rawText = await req.text();
    if (rawText.length > 8192) return json({ error: 'body_too_large' }, 413);
    const auth = await authenticateBetaDevice(req, env, '/api/beta/verify', rawText);
    if (!auth.ok) return json({ ok: false, authorized: false, error: auth.error }, auth.status);

    return json({
        ok: true,
        authorized: true,
        deviceId: auth.device.id,
        role: auth.device.role,
        note: auth.device.note,
        activatedAt: auth.device.activated_at,
        expiresAt: auth.device.expires_at,
        lastVerifiedAt: auth.device.last_verified_at,
        serverTimeMs: auth.now,
    });
}

/** POST /api/beta/leave — 设备主动退出内测资格 */
export async function leaveBetaProgram(req, env) {
    const rawText = await req.text();
    if (rawText.length > 8192) return json({ error: 'body_too_large' }, 413);
    const auth = await authenticateBetaDevice(req, env, '/api/beta/leave', rawText);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

    await env.DB.prepare(
        "UPDATE beta_devices SET status='revoked', active_channel='stable', revoked_at=?, revoke_reason='user_left' WHERE id=?",
    ).bind(auth.now, auth.device.id).run();

    await appendAuditLog(env, {
        actorRole: 'beta_client',
        action: 'beta_device_leave',
        channel: 'private_beta',
        result: 'ok',
        detail: { deviceId: auth.device.id, role: auth.device.role },
    });

    return json({ ok: true, left: true });
}

/** POST /api/beta/policy — 获取私有内测更新策略（仅已授权设备可访问，实时签发短期 R2 下载凭据并重签） */
export async function getPrivateBetaPolicy(req, env, reqUrl) {
    const rawText = await req.text();
    if (rawText.length > 8192) return json({ error: 'body_too_large' }, 413);
    const auth = await authenticateBetaDevice(req, env, '/api/beta/policy', rawText);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const row = await env.DB.prepare(
        "SELECT * FROM update_policies WHERE channel='private_beta'",
    ).first();
    if (!row?.signed_manifest_json) {
        return json({ error: 'policy_not_published' }, 404);
    }

    const baseManifest = JSON.parse(row.signed_manifest_json);
    const apkObj = baseManifest.releaseId
        ? await env.DB.prepare('SELECT * FROM beta_apk_objects WHERE release_id=?').bind(baseManifest.releaseId).first()
        : null;

    if (!apkObj || !baseManifest.updateEnabled) {
        return new Response(row.signed_manifest_json, {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        });
    }

    const signing = getSigningCredentials(env);
    if (!signing) {
        return json({ error: 'publish_signing_not_configured' }, 503);
    }

    const ticket = await signed(
        {
            kind: 'beta_dl',
            deviceId: auth.device.id,
            releaseId: apkObj.release_id,
            sha256: apkObj.sha256,
            exp: auth.now + DOWNLOAD_TICKET_TTL_MS,
        },
        env.FEEDBACK_ADMIN_TOKEN,
    );

    const origin = reqUrl.origin;
    const ticketUrls = [
        {
            id: 'beta-r2-primary',
            label: '听屿私有内测主节点',
            url: `${origin}/api/beta/download?token=${encodeURIComponent(ticket)}`,
            priority: 1,
        },
    ];
    if (origin === 'https://feedback.20262000.xyz') {
        ticketUrls.push({
            id: 'beta-r2-backup',
            label: '听屿私有内测备用节点',
            url: `https://tingyu-feedback-api.2473297053.workers.dev/api/beta/download?token=${encodeURIComponent(ticket)}`,
            priority: 2,
        });
    }

    const { signature: _oldSig, ...unsigned } = baseManifest;
    const refreshed = await signUpdateManifest(
        {
            ...unsigned,
            downloadUrls: ticketUrls,
        },
        signing.privateKeyJwk,
        signing.keyId,
    );

    return json(refreshed);
}

/** POST /api/beta/history — 获取私有内测版本历史（仅已授权设备可访问） */
export async function getPrivateBetaHistory(req, env) {
    const rawText = await req.text();
    if (rawText.length > 8192) return json({ error: 'body_too_large' }, 413);
    const auth = await authenticateBetaDevice(req, env, '/api/beta/history', rawText);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const rows = (await env.DB.prepare(
        `SELECT id, channel, version_name, version_code, git_commit, release_notes, force_update, published_at
         FROM releases
         WHERE channel='private_beta' AND status='published'
         ORDER BY version_code DESC, published_at DESC
         LIMIT 30`,
    ).all()).results;

    return json({
        channel: 'private_beta',
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

/** GET /api/beta/download?token=... — 校验短期凭据 + 设备实时授权状态并从私有 R2 分发 APK（支持 Range 断点续传） */
export async function downloadPrivateBetaApk(req, env, url) {
    const token = url.searchParams.get('token') || '';
    const claims = await verified(token, env.FEEDBACK_ADMIN_TOKEN);
    if (!claims || claims.kind !== 'beta_dl' || !claims.deviceId || !claims.releaseId) {
        return json({ error: 'beta_download_ticket_invalid_or_expired' }, 401);
    }

    const now = Date.now();
    const device = await env.DB.prepare('SELECT status, expires_at FROM beta_devices WHERE id=?').bind(claims.deviceId).first();
    if (!device || device.status !== 'active' || (device.expires_at > 0 && device.expires_at <= now)) {
        return json({ error: 'beta_device_not_authorized' }, 403);
    }

    const apkObj = await env.DB.prepare('SELECT * FROM beta_apk_objects WHERE release_id=?').bind(claims.releaseId).first();
    if (!apkObj) {
        return json({ error: 'beta_apk_not_found' }, 404);
    }

    const totalSize = Number(apkObj.size_bytes);
    const rangeHeader = req.headers.get('Range');
    if (rangeHeader) {
        const m = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
        if (!m) {
            return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${totalSize}` } });
        }
        const start = Number(m[1]);
        const end = m[2] ? Math.min(Number(m[2]), totalSize - 1) : totalSize - 1;
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= totalSize || end < start) {
            return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${totalSize}` } });
        }
        const length = end - start + 1;
        const obj = await env.LOGS_BUCKET.get(apkObj.r2_key, { range: { offset: start, length } });
        if (!obj) return json({ error: 'beta_apk_object_missing' }, 404);
        const body = obj.body ?? (await obj.arrayBuffer()).slice(start, end + 1);
        return new Response(body, {
            status: 206,
            headers: {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Length': String(length),
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    }

    const obj = await env.LOGS_BUCKET.get(apkObj.r2_key);
    if (!obj) return json({ error: 'beta_apk_object_missing' }, 404);
    const body = obj.body ?? (await obj.arrayBuffer());
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Length': String(totalSize),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

// ======================= Admin Beta Management Endpoints =======================

export async function getAdminBetaOverview(env) {
    const now = Date.now();
    const devices = (await env.DB.prepare('SELECT * FROM beta_devices ORDER BY activated_at DESC').all()).results;
    const invites = (await env.DB.prepare('SELECT * FROM beta_invites ORDER BY created_at DESC LIMIT 100').all()).results;
    const latestBeta = await env.DB.prepare(
        "SELECT id, version_name, version_code, status, published_at, created_at FROM releases WHERE channel='private_beta' ORDER BY version_code DESC, updated_at DESC LIMIT 1",
    ).first();
    const betaPolicy = await env.DB.prepare(
        "SELECT channel, policy_revision, policy_action, update_enabled, latest_version_name, latest_version_code, min_supported_version_code, updated_at FROM update_policies WHERE channel='private_beta'",
    ).first();
    const stablePolicy = await env.DB.prepare(
        "SELECT channel, policy_revision, policy_action, update_enabled, latest_version_name, latest_version_code, min_supported_version_code, updated_at FROM update_policies WHERE channel='stable'",
    ).first();

    let developerActive = 0;
    let testerActive = 0;
    let expiredCount = 0;
    let revokedCount = 0;
    for (const d of devices) {
        if (d.status === 'revoked') {
            revokedCount++;
        } else if (d.expires_at > 0 && d.expires_at <= now) {
            expiredCount++;
        } else if (d.role === 'developer') {
            developerActive++;
        } else {
            testerActive++;
        }
    }

    const unusedPendingInvites = invites.filter(i => i.status === 'active' && i.used_count < i.max_uses && i.invite_expires_at > now).length;

    return json({
        ok: true,
        summary: {
            publicBetaEnabled: false,
            developerDevices: developerActive,
            testerDevices: testerActive,
            activeAuthorizations: developerActive + testerActive,
            expiredAuthorizations: expiredCount,
            revokedAuthorizations: revokedCount,
            pendingInvites: unusedPendingInvites,
            latestBetaRelease: latestBeta || null,
            betaPolicy: betaPolicy || null,
            stablePolicy: stablePolicy || null,
        },
        invites: invites.map(i => ({
            id: i.id,
            codeHint: i.code_hint,
            role: i.role,
            note: i.note,
            maxUses: i.max_uses,
            usedCount: i.used_count,
            inviteExpiresAt: i.invite_expires_at,
            authDurationMs: i.auth_duration_ms,
            status: i.status === 'active' && i.invite_expires_at <= now ? 'expired' : i.status,
            createdAt: i.created_at,
            usedAt: i.used_at,
            usedByDeviceId: i.used_by_device_id,
        })),
        devices: devices.map(d => ({
            id: d.id,
            role: d.role,
            note: d.note,
            deviceModel: d.device_model,
            androidVersion: d.android_version,
            appVersionName: d.app_version_name,
            appVersionCode: d.app_version_code,
            activeChannel: d.active_channel,
            status: d.status === 'active' && d.expires_at > 0 && d.expires_at <= now ? 'expired' : d.status,
            activatedAt: d.activated_at,
            lastVerifiedAt: d.last_verified_at,
            expiresAt: d.expires_at,
            revokedAt: d.revoked_at,
            revokeReason: d.revoke_reason,
        })),
    });
}

export async function createAdminBetaInvite(req, env, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const body = await limitedJson(req, 2048);
    const inviteRole = body.role === 'developer' ? 'developer' : 'tester';
    const note = cleanText(body.note || '', 80);
    const inviteTtlMinutes = Math.max(1, Math.min(10080, Number(body.inviteTtlMinutes) || 5));
    const authDurationDays = inviteRole === 'developer'
        ? (body.authDurationDays && Number(body.authDurationDays) > 0 ? Math.min(3650, Number(body.authDurationDays)) : 0)
        : Math.max(1, Math.min(365, Number(body.authDurationDays) || 30));

    const now = Date.now();
    const inviteExpiresAt = now + inviteTtlMinutes * 60_000;
    const authDurationMs = authDurationDays > 0 ? authDurationDays * 86400_000 : 0;
    const code = generateInviteCode();
    const codeHash = await hashInviteCode(env, code);
    const codeHint = `TYB-****-****-${code.slice(-4)}`;
    const id = 'inv-' + crypto.randomUUID().slice(0, 16);

    await env.DB.prepare(
        `INSERT INTO beta_invites(
            id, code_hash, code_hint, role, note, max_uses, used_count,
            invite_expires_at, auth_duration_ms, status, created_at
        ) VALUES(?,?,?,?,?,1,0,?,?,'active',?)`,
    ).bind(id, codeHash, codeHint, inviteRole, note, inviteExpiresAt, authDurationMs, now).run();

    await appendAuditLog(env, {
        actorRole: role,
        action: 'beta_invite_create',
        channel: 'private_beta',
        result: 'ok',
        detail: { inviteId: id, role: inviteRole, inviteTtlMinutes, authDurationDays },
    });

    // 明文邀请码仅在本次创建响应中返回一次，绝不落库也绝不在列表接口再次返回
    return json({
        ok: true,
        invite: {
            id,
            code,
            codeHint,
            role: inviteRole,
            note,
            inviteExpiresAt,
            authDurationMs,
            createdAt: now,
        },
    }, 201);
}

export async function cancelAdminBetaInvite(env, inviteId, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const res = await env.DB.prepare(
        "UPDATE beta_invites SET status='cancelled' WHERE id=? AND status='active' RETURNING id",
    ).bind(inviteId).first();
    if (!res) return json({ error: 'invite_not_found_or_already_used' }, 404);
    await appendAuditLog(env, {
        actorRole: role,
        action: 'beta_invite_cancel',
        channel: 'private_beta',
        result: 'ok',
        detail: { inviteId },
    });
    return json({ ok: true, id: inviteId, status: 'cancelled' });
}

export async function updateAdminBetaDevice(req, env, deviceId, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const existing = await env.DB.prepare('SELECT * FROM beta_devices WHERE id=?').bind(deviceId).first();
    if (!existing) return json({ error: 'device_not_found' }, 404);

    const body = await limitedJson(req, 2048);
    const nextNote = body.note !== undefined ? cleanText(String(body.note), 80) : existing.note;
    let nextExpires = existing.expires_at;
    if (body.expiresAt !== undefined) {
        const val = Number(body.expiresAt);
        if (!Number.isFinite(val) || val < 0) return json({ error: 'invalid_expires_at' }, 400);
        nextExpires = val;
    } else if (body.extendDays !== undefined) {
        const days = Number(body.extendDays);
        if (!Number.isFinite(days) || days < 1 || days > 365) return json({ error: 'invalid_extend_days' }, 400);
        const base = Math.max(Date.now(), existing.expires_at || Date.now());
        nextExpires = base + days * 86400_000;
    }

    await env.DB.prepare('UPDATE beta_devices SET note=?, expires_at=? WHERE id=?').bind(nextNote, nextExpires, deviceId).run();
    return json({ ok: true, id: deviceId, note: nextNote, expiresAt: nextExpires });
}

export async function revokeAdminBetaDevice(req, env, deviceId, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const existing = await env.DB.prepare('SELECT * FROM beta_devices WHERE id=?').bind(deviceId).first();
    if (!existing) return json({ error: 'device_not_found' }, 404);

    const body = await limitedJson(req, 1024).catch(() => ({}));
    if (existing.role === 'developer' && body.confirmDeveloperRevoke !== true) {
        return json({ error: 'developer_revoke_confirmation_required' }, 400);
    }

    const now = Date.now();
    const reason = cleanText(String(body.reason || 'revoked_by_admin'), 80);
    await env.DB.prepare(
        "UPDATE beta_devices SET status='revoked', active_channel='stable', revoked_at=?, revoke_reason=? WHERE id=?",
    ).bind(now, reason, deviceId).run();

    await appendAuditLog(env, {
        actorRole: role,
        action: 'beta_device_revoke',
        channel: 'private_beta',
        result: 'ok',
        detail: { deviceId, deviceRole: existing.role, reason },
    });
    return json({ ok: true, id: deviceId, status: 'revoked' });
}

export async function revokeAllTesters(req, env, role) {
    if (role !== 'admin') return json({ error: 'admin_required' }, 403);
    const body = await limitedJson(req, 1024).catch(() => ({}));
    const now = Date.now();
    const reason = cleanText(String(body.reason || 'batch_revoke_testers'), 80);
    const res = await env.DB.prepare(
        "UPDATE beta_devices SET status='revoked', active_channel='stable', revoked_at=?, revoke_reason=? WHERE role='tester' AND status='active'",
    ).bind(now, reason).run();

    await appendAuditLog(env, {
        actorRole: role,
        action: 'beta_batch_revoke_testers',
        channel: 'private_beta',
        result: 'ok',
        detail: { revokedCount: res.meta?.changes || 0, reason },
    });
    return json({ ok: true, revokedCount: res.meta?.changes || 0 });
}

export async function uploadPrivateBetaApk(req, env, releaseId, role) {
    if (!['admin', 'prepare'].includes(role)) return json({ error: 'forbidden' }, 403);
    const release = await env.DB.prepare('SELECT * FROM releases WHERE id=?').bind(releaseId).first();
    if (!release || release.channel !== 'private_beta') {
        return json({ error: 'private_beta_release_not_found' }, 404);
    }

    const buf = await req.arrayBuffer();
    if (!buf || buf.byteLength < 1024 * 1024) {
        return json({ error: 'invalid_apk_payload' }, 400);
    }
    const actualSha256 = await hash(new Uint8Array(buf));
    if (release.sha256 && actualSha256 !== release.sha256.toLowerCase()) {
        return json({ error: 'apk_sha256_mismatch' }, 400);
    }

    const r2Key = `beta-apks/${releaseId}/${actualSha256}.apk`;
    await env.LOGS_BUCKET.put(r2Key, buf, {
        httpMetadata: { contentType: 'application/vnd.android.package-archive' },
    });

    const now = Date.now();
    await env.DB.prepare(
        `INSERT OR REPLACE INTO beta_apk_objects(release_id, r2_key, sha256, size_bytes, version_name, version_code, uploaded_at)
         VALUES(?,?,?,?,?,?,?)`,
    ).bind(releaseId, r2Key, actualSha256, buf.byteLength, release.version_name, release.version_code, now).run();

    // 保留最近 2 个内测 APK 对象，自动清理历史旧内测包以节省 R2 免费空间
    const oldObjs = (await env.DB.prepare(
        'SELECT release_id, r2_key FROM beta_apk_objects ORDER BY uploaded_at DESC LIMIT 20 OFFSET 2',
    ).all()).results;
    for (const old of oldObjs) {
        if (old.release_id === releaseId) continue;
        try { await env.LOGS_BUCKET.delete(old.r2_key); } catch { /* ignore */ }
        await env.DB.prepare('DELETE FROM beta_apk_objects WHERE release_id=?').bind(old.release_id).run();
    }

    return json({ ok: true, releaseId, r2Key, sha256: actualSha256, sizeBytes: buf.byteLength });
}
