// tingyu-android/shared/updateProtocol.mjs
// 听屿正式静态更新配置协议（Schema v1）：规范化 JSON、ECDSA-P256-SHA256 (ASN.1 DER) 签名/验签、多节点裁决与客户端策略计算。
// 同时兼容 Cloudflare Workers (WebCrypto) 与 Node.js >= 20 运行时，无任何第三方依赖。

export const UPDATE_SCHEMA_VERSION = 1;
export const TINGYU_APP_ID = 'io.github.huleixin.tingyu';
export const UPDATE_SIGNATURE_ALGORITHM = 'ECDSA-P256-SHA256';
export const ALLOWED_CHANNELS = ['stable', 'testing', 'automotive'];
export const ALLOWED_POLICY_ACTIONS = ['normal', 'pause', 'emergency_unlock'];
export const DEFAULT_OFFLINE_GRACE_HOURS = 168; // 7 days

/**
 * 递归按字典序（UTF-16 码元升序）排序对象键，输出无空白规范化 JSON 字符串。
 * 签名计算前剥离顶层 `signature` 字段，保留 `keyId` 与 `signatureAlgorithm` 防止算法替换攻击。
 */
export function canonicalizeValue(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map(item => canonicalizeValue(item)).join(',') + ']';
    }
    const keys = Object.keys(value)
        .filter(k => value[k] !== undefined)
        .sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalizeValue(value[k])).join(',') + '}';
}

export function canonicalizeManifestForSigning(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('invalid_manifest_object');
    }
    const { signature: _sig, ...unsignedPayload } = manifest;
    return canonicalizeValue(unsignedPayload);
}

function encodeAsn1Length(len) {
    if (len < 128) return [len];
    const bytes = [];
    let n = len;
    while (n > 0) {
        bytes.unshift(n & 0xff);
        n >>= 8;
    }
    return [0x80 | bytes.length, ...bytes];
}

function encodeAsn1Integer(raw32) {
    let start = 0;
    while (start < raw32.length - 1 && raw32[start] === 0) {
        start++;
    }
    const trimmed = raw32.slice(start);
    const needsPad = (trimmed[0] & 0x80) !== 0;
    const body = needsPad ? new Uint8Array([0x00, ...trimmed]) : trimmed;
    return new Uint8Array([0x02, ...encodeAsn1Length(body.length), ...body]);
}

/** WebCrypto ECDSA P1363 (64-byte r||s) -> 标准 ASN.1 DER (兼容 Android Java SHA256withECDSA) */
export function p1363ToDer(p1363Bytes) {
    const bytes = p1363Bytes instanceof Uint8Array ? p1363Bytes : new Uint8Array(p1363Bytes);
    if (bytes.length !== 64) throw new Error('invalid_p1363_length');
    const rDer = encodeAsn1Integer(bytes.slice(0, 32));
    const sDer = encodeAsn1Integer(bytes.slice(32, 64));
    const seqLen = rDer.length + sDer.length;
    return new Uint8Array([0x30, ...encodeAsn1Length(seqLen), ...rDer, ...sDer]);
}

function readAsn1Length(bytes, offset) {
    if (offset >= bytes.length) throw new Error('invalid_der_length');
    const first = bytes[offset];
    if ((first & 0x80) === 0) return { length: first, nextOffset: offset + 1 };
    const count = first & 0x7f;
    if (count === 0 || count > 2 || offset + 1 + count > bytes.length) throw new Error('invalid_der_length');
    let len = 0;
    for (let i = 0; i < count; i++) {
        len = (len << 8) | bytes[offset + 1 + i];
    }
    return { length: len, nextOffset: offset + 1 + count };
}

function readAsn1IntegerTo32(bytes, offset) {
    if (bytes[offset] !== 0x02) throw new Error('invalid_der_integer_tag');
    const { length, nextOffset } = readAsn1Length(bytes, offset + 1);
    if (length < 1 || nextOffset + length > bytes.length) throw new Error('invalid_der_integer_bounds');
    let slice = bytes.slice(nextOffset, nextOffset + length);
    while (slice.length > 32 && slice[0] === 0x00) {
        slice = slice.slice(1);
    }
    if (slice.length > 32) throw new Error('der_integer_overflow');
    const out = new Uint8Array(32);
    out.set(slice, 32 - slice.length);
    return { value: out, nextOffset: nextOffset + length };
}

/** 标准 ASN.1 DER -> WebCrypto ECDSA P1363 (64-byte r||s) */
export function derToP1363(derBytes) {
    const bytes = derBytes instanceof Uint8Array ? derBytes : new Uint8Array(derBytes);
    if (bytes.length < 8 || bytes[0] !== 0x30) throw new Error('invalid_der_sequence');
    const seq = readAsn1Length(bytes, 1);
    if (seq.nextOffset + seq.length !== bytes.length) throw new Error('invalid_der_total_length');
    const r = readAsn1IntegerTo32(bytes, seq.nextOffset);
    const s = readAsn1IntegerTo32(bytes, r.nextOffset);
    if (s.nextOffset !== bytes.length) throw new Error('invalid_der_trailing_bytes');
    const out = new Uint8Array(64);
    out.set(r.value, 0);
    out.set(s.value, 32);
    return out;
}

export function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    return btoa(binary);
}

export function base64ToBytes(b64) {
    if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64.trim())) {
        throw new Error('invalid_base64');
    }
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(b64.trim(), 'base64'));
    }
    const binary = atob(b64.trim());
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

/**
 * 严格校验正式更新配置结构（不校验密码学签名本身）。
 */
export function validateUpdateManifestStructure(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return { ok: false, error: 'manifest_not_object' };
    }
    if (manifest.schemaVersion !== UPDATE_SCHEMA_VERSION) {
        return { ok: false, error: 'unsupported_schema_version' };
    }
    if (manifest.appId !== TINGYU_APP_ID) {
        return { ok: false, error: 'app_id_mismatch' };
    }
    if (!ALLOWED_CHANNELS.includes(manifest.channel)) {
        return { ok: false, error: 'invalid_channel' };
    }
    if (!Number.isInteger(manifest.policyRevision) || manifest.policyRevision < 1) {
        return { ok: false, error: 'invalid_policy_revision' };
    }
    if (!ALLOWED_POLICY_ACTIONS.includes(manifest.policyAction)) {
        return { ok: false, error: 'invalid_policy_action' };
    }
    if (typeof manifest.updateEnabled !== 'boolean') {
        return { ok: false, error: 'invalid_update_enabled' };
    }
    if (typeof manifest.latestVersionName !== 'string' || !manifest.latestVersionName.trim()) {
        return { ok: false, error: 'invalid_latest_version_name' };
    }
    if (!Number.isInteger(manifest.latestVersionCode) || manifest.latestVersionCode < 1) {
        return { ok: false, error: 'invalid_latest_version_code' };
    }
    if (!Number.isInteger(manifest.minSupportedVersionCode) || manifest.minSupportedVersionCode < 1) {
        return { ok: false, error: 'invalid_min_supported_version_code' };
    }
    if (manifest.minSupportedVersionCode > manifest.latestVersionCode) {
        return { ok: false, error: 'min_supported_exceeds_latest' };
    }
    if (typeof manifest.releaseId !== 'string' || !manifest.releaseId.trim()) {
        return { ok: false, error: 'invalid_release_id' };
    }
    if (typeof manifest.releaseNotes !== 'string') {
        return { ok: false, error: 'invalid_release_notes' };
    }
    if (!Number.isInteger(manifest.publishedAtEpochMs) || manifest.publishedAtEpochMs <= 0) {
        return { ok: false, error: 'invalid_published_at' };
    }
    if (!Number.isInteger(manifest.policyExpiresAtEpochMs) || manifest.policyExpiresAtEpochMs <= manifest.publishedAtEpochMs) {
        return { ok: false, error: 'invalid_policy_expires_at' };
    }
    if (!Number.isInteger(manifest.offlineGraceHours) || manifest.offlineGraceHours < 1 || manifest.offlineGraceHours > 720) {
        return { ok: false, error: 'invalid_offline_grace_hours' };
    }
    if (!Number.isInteger(manifest.minSdk) || manifest.minSdk < 21) {
        return { ok: false, error: 'invalid_min_sdk' };
    }
    if (!Array.isArray(manifest.supportedAbis) || manifest.supportedAbis.length === 0 || !manifest.supportedAbis.every(a => typeof a === 'string' && a.length > 0)) {
        return { ok: false, error: 'invalid_supported_abis' };
    }
    if (manifest.updateEnabled) {
        if (!Number.isInteger(manifest.apkSizeBytes) || manifest.apkSizeBytes < 1024 * 1024) {
            return { ok: false, error: 'invalid_apk_size' };
        }
        if (typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
            return { ok: false, error: 'invalid_apk_sha256' };
        }
        if (typeof manifest.apkCertSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.apkCertSha256)) {
            return { ok: false, error: 'invalid_apk_cert_sha256' };
        }
        if (!Array.isArray(manifest.downloadUrls) || manifest.downloadUrls.length === 0) {
            return { ok: false, error: 'missing_download_urls' };
        }
        for (const node of manifest.downloadUrls) {
            if (!node || typeof node.id !== 'string' || typeof node.label !== 'string' || typeof node.url !== 'string' || !node.url.startsWith('https://')) {
                return { ok: false, error: 'invalid_download_url_entry' };
            }
        }
    }
    if (manifest.signatureAlgorithm !== UPDATE_SIGNATURE_ALGORITHM) {
        return { ok: false, error: 'unsupported_signature_algorithm' };
    }
    if (typeof manifest.keyId !== 'string' || !manifest.keyId.trim()) {
        return { ok: false, error: 'missing_key_id' };
    }
    if (typeof manifest.signature !== 'string' || manifest.signature.length < 64) {
        return { ok: false, error: 'missing_signature' };
    }
    return { ok: true };
}

/**
 * 使用 ECDSA-P256 私钥 (JWK) 对更新配置进行规范化签名，输出 ASN.1 DER Base64。
 */
export async function signUpdateManifest(unsignedManifest, privateKeyJwk, keyId) {
    const draft = {
        ...unsignedManifest,
        signatureAlgorithm: UPDATE_SIGNATURE_ALGORITHM,
        keyId,
    };
    delete draft.signature;
    const canonical = canonicalizeManifestForSigning(draft);
    const key = await crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign'],
    );
    const p1363Sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        new TextEncoder().encode(canonical),
    );
    const derSig = p1363ToDer(new Uint8Array(p1363Sig));
    const signedManifest = {
        ...draft,
        signature: bytesToBase64(derSig),
    };
    const structCheck = validateUpdateManifestStructure(signedManifest);
    if (!structCheck.ok) {
        throw new Error(`manifest_validation_failed:${structCheck.error}`);
    }
    return signedManifest;
}

/**
 * 使用内置可信公钥表 `{ [keyId]: spkiBase64 }` 验证更新配置真实性与完整性。
 */
export async function verifyUpdateManifest(manifest, trustedSpkiByKeyId) {
    const structCheck = validateUpdateManifestStructure(manifest);
    if (!structCheck.ok) return structCheck;
    const spkiBase64 = trustedSpkiByKeyId?.[manifest.keyId];
    if (!spkiBase64) return { ok: false, error: 'untrusted_key_id' };
    try {
        const spkiBytes = base64ToBytes(spkiBase64);
        const key = await crypto.subtle.importKey(
            'spki',
            spkiBytes,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
        );
        const derBytes = base64ToBytes(manifest.signature);
        const p1363Bytes = derToP1363(derBytes);
        const canonical = canonicalizeManifestForSigning(manifest);
        const valid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            p1363Bytes,
            new TextEncoder().encode(canonical),
        );
        return valid ? { ok: true } : { ok: false, error: 'invalid_signature' };
    } catch {
        return { ok: false, error: 'signature_verification_error' };
    }
}

/**
 * 多节点裁决：在通过签名校验、渠道匹配且未过期的配置中，按 `policyRevision` 严格选择最新策略。
 */
export async function selectAuthoritativeManifest(candidates, { expectedChannel, trustedSpkiByKeyId, nowMs = Date.now(), minAcceptedRevision = 0 }) {
    let best = null;
    const rejections = [];
    for (const entry of candidates) {
        const manifest = entry?.manifest ?? entry;
        const nodeId = entry?.nodeId ?? 'unknown';
        const verified = await verifyUpdateManifest(manifest, trustedSpkiByKeyId);
        if (!verified.ok) {
            rejections.push({ nodeId, error: verified.error });
            continue;
        }
        if (manifest.channel !== expectedChannel) {
            rejections.push({ nodeId, error: 'channel_mismatch' });
            continue;
        }
        if (manifest.policyExpiresAtEpochMs <= nowMs) {
            rejections.push({ nodeId, error: 'policy_expired' });
            continue;
        }
        if (manifest.policyRevision < minAcceptedRevision) {
            rejections.push({ nodeId, error: 'stale_policy_revision_replay' });
            continue;
        }
        if (!best || manifest.policyRevision > best.manifest.policyRevision) {
            best = { nodeId, manifest };
        }
    }
    return { best, rejections };
}

/**
 * 计算客户端当前应执行的更新动作：none / optional_update / force_update。
 */
export function evaluateClientUpdateDecision({
    currentVersionCode,
    manifest,
    nowMs = Date.now(),
    lastVerifiedAtMs = nowMs,
}) {
    if (!manifest) return { mode: 'none', reason: 'no_manifest' };
    if (manifest.policyExpiresAtEpochMs <= nowMs) {
        return { mode: 'none', reason: 'policy_expired' };
    }
    const graceMs = (manifest.offlineGraceHours || DEFAULT_OFFLINE_GRACE_HOURS) * 3600 * 1000;
    const withinOfflineGrace = (nowMs - lastVerifiedAtMs) <= graceMs;

    if (manifest.policyAction === 'emergency_unlock') {
        if (manifest.updateEnabled && currentVersionCode < manifest.latestVersionCode) {
            return { mode: 'optional_update', reason: 'emergency_unlocked_optional' };
        }
        return { mode: 'none', reason: 'emergency_unlocked' };
    }

    const requiresForce = currentVersionCode < manifest.minSupportedVersionCode;
    if (requiresForce && manifest.updateEnabled && withinOfflineGrace) {
        return { mode: 'force_update', reason: 'below_min_supported_version_code' };
    }
    if (requiresForce && !withinOfflineGrace) {
        return { mode: 'optional_update', reason: 'offline_grace_exceeded_degraded_to_optional' };
    }
    if (manifest.policyAction === 'pause' || !manifest.updateEnabled) {
        return { mode: 'none', reason: 'updates_paused_or_disabled' };
    }
    if (currentVersionCode < manifest.latestVersionCode) {
        return { mode: 'optional_update', reason: 'newer_version_available' };
    }
    return { mode: 'none', reason: 'up_to_date' };
}
