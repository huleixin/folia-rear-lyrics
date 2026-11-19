import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, payload, submission, read, admin } from './harness.mjs';
import { EXPECTED_APK_CERT_SHA256 } from '../src/releases.mjs';
import {
    bytesToBase64,
    verifyUpdateManifest,
    selectAuthoritativeManifest,
    evaluateClientUpdateDecision,
} from '../../shared/updateProtocol.mjs';

async function makeEphemeralSigningEnv(baseEnv) {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
    );
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const spkiBuf = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const spkiBase64 = bytesToBase64(new Uint8Array(spkiBuf));
    const keyId = 'test-policy-k1';
    const env = {
        ...baseEnv,
        RELEASE_PREPARE_TOKEN: 'test-prepare-only-token-not-real',
        RELEASE_PUBLISH_SECRET: 'test-publish-secret-not-real-001',
        UPDATE_SIGNING_KEY_ID: keyId,
        UPDATE_SIGNING_PRIVATE_KEY_JWK: JSON.stringify({ keyId, privateKeyJwk }),
    };
    return { env, keyId, trustedKeys: { [keyId]: spkiBase64 } };
}

const SAMPLE_SHA256 = 'e26b0812b3d6da734c2af0c2f7816ecdaa6a31127618d141a814af164c7d1469';
const SAMPLE_SIZE = 58485998;

function sampleCandidatePayload(overrides = {}) {
    return {
        channel: 'stable',
        versionName: '1.5.79',
        versionCode: 294,
        minSupportedVersionCode: 294,
        forceUpdate: true,
        apkSizeBytes: SAMPLE_SIZE,
        sha256: SAMPLE_SHA256,
        apkCertSha256: EXPECTED_APK_CERT_SHA256,
        minSdk: 24,
        supportedAbis: ['arm64-v8a', 'armeabi-v7a'],
        gitCommit: '48511843',
        releaseNotes: '1. 新增软件内安全更新机制\n2. 修复本地音乐模式耦合问题',
        downloadUrls: [
            {
                id: 'cnb-primary',
                label: 'CNB 国内主节点',
                url: 'https://cnb.example.test/releases/tingyu-1.5.79-release.apk',
                priority: 1,
            },
        ],
        ...overrides,
    };
}

test('strict role isolation: read, prepare, admin, and independent publish secret', async () => {
    const f = fixture();
    const { env } = await makeEphemeralSigningEnv(f.env);
    Object.assign(f.env, env);

    const prepareHeaders = {
        Authorization: 'Bearer test-prepare-only-token-not-real',
        'Content-Type': 'application/json',
    };

    // 1. read role cannot create candidates
    assert.equal(
        (await f.call('/api/admin/releases/candidates', {
            method: 'POST',
            headers: { ...read, 'Content-Type': 'application/json' },
            body: JSON.stringify(sampleCandidatePayload()),
        })).status,
        403,
    );

    // 2. prepare role CAN create candidate draft, CANNOT read feedback logs, approve, or publish
    const created = await f.call('/api/admin/releases/candidates', {
        method: 'POST',
        headers: prepareHeaders,
        body: JSON.stringify(sampleCandidatePayload()),
    });
    assert.equal(created.status, 201);
    const { release } = await created.json();
    assert.equal(release.status, 'candidate');

    assert.equal(
        (await f.call('/api/admin/feedback', { headers: prepareHeaders })).status,
        403,
    );
    assert.equal(
        (await f.call(`/api/admin/releases/${release.id}`, {
            method: 'PATCH',
            headers: prepareHeaders,
            body: JSON.stringify({ reviewAction: 'approve' }),
        })).status,
        403,
    );
    assert.equal(
        (await f.call(`/api/admin/releases/${release.id}/publish`, {
            method: 'POST',
            headers: {
                ...prepareHeaders,
                'X-Publish-Secret': f.env.RELEASE_PUBLISH_SECRET,
            },
            body: JSON.stringify({ confirmNonce: 'nonce_prepare_blocked_123456' }),
        })).status,
        403,
    );

    // 3. admin role can approve, but CANNOT publish without valid X-Publish-Secret
    const approvedRes = await f.call(`/api/admin/releases/${release.id}`, {
        method: 'PATCH',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewAction: 'approve' }),
    });
    assert.equal(approvedRes.status, 200);
    const approved = (await approvedRes.json()).release;
    assert.equal(approved.status, 'approved');
    assert.match(approved.approved_digest, /^[a-f0-9]{64}$/);

    const missingSecret = await f.call(`/api/admin/releases/${release.id}/publish`, {
        method: 'POST',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmNonce: 'nonce_missing_secret_123456' }),
    });
    assert.equal(missingSecret.status, 403);
    assert.equal((await missingSecret.json()).error, 'publish_secret_invalid');
});

test('approval digest binding, unreachable/HTML download protection, ECDSA publish, pause, emergency unlock & immutable audit chain', async () => {
    const f = fixture();
    const { env, trustedKeys } = await makeEphemeralSigningEnv(f.env);
    Object.assign(f.env, env);

    // Seed a user feedback item linked to version 1.5.79
    const sub = await submission(f, payload({ description: '本地歌单返回后状态测试' }));
    const fbId = (await (await f.call('/api/feedback', sub.request)).json()).id;
    assert.equal(
        (await f.call(`/api/admin/feedback/${fbId}/link`, {
            method: 'PATCH',
            headers: { ...admin, 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowStage: 'tested_ok', targetVersion: '1.5.79' }),
        })).status,
        200,
    );

    // Create candidate
    const createRes = await f.call('/api/admin/releases/candidates', {
        method: 'POST',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleCandidatePayload()),
    });
    const candidate = (await createRes.json()).release;

    // Approve candidate
    const approveRes = await f.call(`/api/admin/releases/${candidate.id}`, {
        method: 'PATCH',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewAction: 'approve' }),
    });
    const approved = (await approveRes.json()).release;

    // Modify draft notes AFTER approval -> status reverts and old digest cannot publish!
    await f.call(`/api/admin/releases/${candidate.id}`, {
        method: 'PATCH',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewAction: 'save_draft', releaseNotes: '修改后的更新说明必须重新审核' }),
    });
    const stalePublish = await f.call(`/api/admin/releases/${candidate.id}/publish`, {
        method: 'POST',
        headers: {
            ...admin,
            'Content-Type': 'application/json',
            'X-Publish-Secret': f.env.RELEASE_PUBLISH_SECRET,
        },
        body: JSON.stringify({
            confirmNonce: 'nonce_stale_approval_0001',
            expectedDigest: approved.approved_digest,
        }),
    });
    assert.equal(stalePublish.status, 409);

    // Re-approve updated candidate
    const reApprove = await (await f.call(`/api/admin/releases/${candidate.id}`, {
        method: 'PATCH',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewAction: 'approve' }),
    })).json();
    const validDigest = reApprove.release.approved_digest;

    const origFetch = globalThis.fetch;
    try {
        // Case A: Download URL returns an HTML login page -> MUST abort publish!
        globalThis.fetch = async () => new Response('<html>login required</html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
        });
        const htmlBlocked = await f.call(`/api/admin/releases/${candidate.id}/publish`, {
            method: 'POST',
            headers: {
                ...admin,
                'Content-Type': 'application/json',
                'X-Publish-Secret': f.env.RELEASE_PUBLISH_SECRET,
            },
            body: JSON.stringify({
                confirmNonce: 'nonce_html_page_blocked_0002',
                expectedDigest: validDigest,
                expectedSha256: SAMPLE_SHA256,
            }),
        });
        assert.equal(htmlBlocked.status, 502);
        assert.equal((await htmlBlocked.json()).error, 'download_nodes_unreachable_abort_publish');

        // Case B: Download URL returns HTTP 206 binary range matching exact APK size -> Publish succeeds!
        globalThis.fetch = async () => new Response(new Uint8Array([0x50]), {
            status: 206,
            headers: {
                'content-type': 'application/vnd.android.package-archive',
                'content-range': `bytes 0-0/${SAMPLE_SIZE}`,
                'content-length': '1',
            },
        });
        const pubRes = await f.call(`/api/admin/releases/${candidate.id}/publish`, {
            method: 'POST',
            headers: {
                ...admin,
                'Content-Type': 'application/json',
                'X-Publish-Secret': f.env.RELEASE_PUBLISH_SECRET,
            },
            body: JSON.stringify({
                confirmNonce: 'nonce_real_publish_0003',
                expectedDigest: validDigest,
                expectedSha256: SAMPLE_SHA256,
            }),
        });
        assert.equal(pubRes.status, 200);
        const pubJson = await pubRes.json();
        assert.equal(pubJson.policyRevision, 1);

        // Replay with same nonce MUST fail with 409
        const replayRes = await f.call(`/api/admin/releases/${candidate.id}/publish`, {
            method: 'POST',
            headers: {
                ...admin,
                'Content-Type': 'application/json',
                'X-Publish-Secret': f.env.RELEASE_PUBLISH_SECRET,
            },
            body: JSON.stringify({
                confirmNonce: 'nonce_real_publish_0003',
                expectedDigest: validDigest,
                expectedSha256: SAMPLE_SHA256,
            }),
        });
        assert.equal(replayRes.status, 409);
        assert.equal((await replayRes.json()).error, 'duplicate_or_replayed_request');
    } finally {
        globalThis.fetch = origFetch;
    }

    // Linked feedback stage automatically moved to 'published' (NOT 'verified_resolved'!)
    const fbDetail = await (await f.call(`/api/admin/feedback/${fbId}`, { headers: read })).json();
    assert.equal(fbDetail.link.workflow_stage, 'published');
    assert.equal(fbDetail.link.fixed_version, '1.5.79');

    // Public signed manifest endpoint returns ECDSA-verified policyRevision=1
    const pubManifestRes = await f.call('/api/public/update/stable');
    assert.equal(pubManifestRes.status, 200);
    const rev1 = await pubManifestRes.json();
    assert.equal((await verifyUpdateManifest(rev1, trustedKeys)).ok, true);
    assert.equal(evaluateClientUpdateDecision({ currentVersionCode: 293, manifest: rev1 }).mode, 'force_update');

    // Pause updates -> policyRevision=2, updateEnabled=false
    const pauseRes = await f.call('/api/admin/policy/stable/pause', {
        method: 'POST',
        headers: {
            ...admin,
            'Content-Type': 'application/json',
            'X-Publish-Secret': f.env.RELEASE_PUBLISH_SECRET,
        },
        body: JSON.stringify({ confirmNonce: 'nonce_pause_testing_0004' }),
    });
    assert.equal(pauseRes.status, 200);
    const rev2 = (await pauseRes.json()).manifest;
    assert.equal(rev2.policyRevision, 2);
    assert.equal(rev2.updateEnabled, false);
    assert.equal(evaluateClientUpdateDecision({ currentVersionCode: 293, manifest: rev2 }).mode, 'none');

    // Emergency Unlock -> policyRevision=3, policyAction='emergency_unlock', minSupportedVersionCode=1
    const unlockRes = await f.call('/api/admin/policy/stable/unlock', {
        method: 'POST',
        headers: {
            ...admin,
            'Content-Type': 'application/json',
            'X-Publish-Secret': f.env.RELEASE_PUBLISH_SECRET,
        },
        body: JSON.stringify({
            confirmNonce: 'nonce_unlock_testing_0005',
            reason: '紧急解除旧版拦截测试',
        }),
    });
    assert.equal(unlockRes.status, 200);
    const rev3 = (await unlockRes.json()).manifest;
    assert.equal(rev3.policyRevision, 3);
    assert.equal(rev3.policyAction, 'emergency_unlock');
    assert.equal(rev3.minSupportedVersionCode, 1);

    // Multi-node arbitration picks highest valid policyRevision=3 even if static node still serves rev1!
    const arb = await selectAuthoritativeManifest(
        [
            { nodeId: 'cnb-static', manifest: rev1 },
            { nodeId: 'cf-live', manifest: rev3 },
        ],
        { expectedChannel: 'stable', trustedSpkiByKeyId: trustedKeys, minAcceptedRevision: 1 },
    );
    assert.equal(arb.best.nodeId, 'cf-live');
    assert.equal(arb.best.manifest.policyRevision, 3);
    assert.equal(evaluateClientUpdateDecision({ currentVersionCode: 280, manifest: arb.best.manifest }).mode, 'none');

    // Verify audit log hash chain continuity AND SQLite trigger immutability
    const audits = (await (await f.call('/api/admin/audit?limit=50', { headers: read })).json()).items.reverse();
    assert.ok(audits.length >= 5);
    let expectedPrev = '0'.repeat(64);
    for (const entry of audits) {
        assert.equal(entry.prev_hash, expectedPrev);
        expectedPrev = entry.entry_hash;
    }
    assert.throws(() => f.sql.exec("DELETE FROM release_audit_logs WHERE seq=1"), /audit_log_immutable/);
    assert.throws(() => f.sql.exec("UPDATE release_audit_logs SET result='tampered' WHERE seq=1"), /audit_log_immutable/);

    // Verify PWA endpoints and strict Service Worker exclusion of /api/*
    assert.equal((await f.call('/admin/manifest.webmanifest')).status, 200);
    const swText = await (await f.call('/admin/sw.js')).text();
    assert.ok(!swText.includes("'/api"));
    assert.ok(swText.includes('STATIC_SHELL.includes(url.pathname)'));
});
