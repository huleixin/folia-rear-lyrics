import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fixture, admin, read } from './harness.mjs';
import { p1363ToDer, bytesToBase64, verifyUpdateManifest } from '../../shared/updateProtocol.mjs';

async function generateTestEcKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey)));
  const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { kp, spki, privateJwk };
}

async function signDevicePop(kpOrBundle, method, path, installId, timestamp, nonce, bodyStr) {
  const kp = kpOrBundle.kp ?? kpOrBundle;
  const bodySha = createHash('sha256').update(bodyStr).digest('hex');
  const msg = `${method.toUpperCase()}|${path}|${installId}|${timestamp}|${nonce}|${bodySha}`;
  const sigP1363 = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    kp.privateKey,
    new TextEncoder().encode(msg),
  );
  return bytesToBase64(p1363ToDer(new Uint8Array(sigP1363)));
}

async function callBeta(f, kp, path, installId, deviceToken, extraBody = {}) {
  const bodyObj = { installId, appVersionName: '1.5.84', appVersionCode: 300, ...extraBody };
  const bodyStr = JSON.stringify(bodyObj);
  const timestamp = Date.now();
  const nonce = randomUUID();
  const signature = await signDevicePop(kp, 'POST', path, installId, timestamp, nonce, bodyStr);
  return f.call(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Beta-Token': deviceToken,
      'X-Beta-Timestamp': String(timestamp),
      'X-Beta-Nonce': nonce,
      'X-Beta-Signature': signature,
    },
    body: bodyStr,
  });
}

test('private beta invites: atomic single-use redemption, zero plaintext storage, expiry & cancellation', async () => {
  const f = fixture();

  // 1. 生成一次性邀请码（仅管理员可操作）
  const readDenied = await f.call('/api/admin/beta/invites', {
    method: 'POST',
    headers: { ...read, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'tester', note: 'unauthorized' }),
  });
  assert.equal(readDenied.status, 403);

  const createRes = await f.call('/api/admin/beta/invites', {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'tester', note: '内测同学A', inviteTtlMinutes: 5, authDurationDays: 30 }),
  });
  assert.equal(createRes.status, 201);
  const { invite } = await createRes.json();
  assert.ok(invite.code.startsWith('TYB-'));

  // 数据库绝不保存可兑换明文
  const dbInvite = f.sql.prepare('SELECT * FROM beta_invites WHERE id=?').get(invite.id);
  assert.ok(dbInvite.code_hash);
  assert.notEqual(dbInvite.code_hash, invite.code);
  assert.ok(!JSON.stringify(dbInvite).includes(invite.code));

  // 2. 并发竞争兑换同一邀请码：严格只能有 1 台设备成功，另一台返回 409 invite_used
  const dev1 = await generateTestEcKeyPair();
  const dev2 = await generateTestEcKeyPair();
  const id1 = randomUUID();
  const id2 = randomUUID();
  const [r1, r2] = await Promise.all([
    f.call('/api/beta/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.1' },
      body: JSON.stringify({ code: invite.code, installId: id1, publicKeySpki: dev1.spki, deviceModel: 'Phone1' }),
    }),
    f.call('/api/beta/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.2' },
      body: JSON.stringify({ code: invite.code, installId: id2, publicKeySpki: dev2.spki, deviceModel: 'Phone2' }),
    }),
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  // 3. 验证过期邀请码与取消邀请码均无法兑换
  const expCreate = await f.call('/api/admin/beta/invites', {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'tester', inviteTtlMinutes: 5, authDurationDays: 7 }),
  });
  const expInv = (await expCreate.json()).invite;
  f.sql.prepare('UPDATE beta_invites SET invite_expires_at=? WHERE id=?').run(Date.now() - 1000, expInv.id);
  const expRedeem = await f.call('/api/beta/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.3' },
    body: JSON.stringify({ code: expInv.code, installId: randomUUID(), publicKeySpki: dev1.spki }),
  });
  assert.equal(expRedeem.status, 410);
  assert.equal((await expRedeem.json()).error, 'invite_expired');

  const cancelCreate = await f.call('/api/admin/beta/invites', {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'developer', note: '取消测试' }),
  });
  const cancelInv = (await cancelCreate.json()).invite;
  const cancelRes = await f.call(`/api/admin/beta/invites/${cancelInv.id}/cancel`, {
    method: 'POST',
    headers: admin,
  });
  assert.equal(cancelRes.status, 200);
  const cancelledRedeem = await f.call('/api/beta/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.4' },
    body: JSON.stringify({ code: cancelInv.code, installId: randomUUID(), publicKeySpki: dev1.spki }),
  });
  assert.equal(cancelledRedeem.status, 403);
  assert.equal((await cancelledRedeem.json()).error, 'invite_cancelled');
});

test('private beta policy, R2 range download tickets, PoP anti-replay & device revocation', async () => {
  const f = fixture();
  const policyKey = await generateTestEcKeyPair();
  f.env.UPDATE_SIGNING_PRIVATE_KEY_JWK = JSON.stringify(policyKey.privateJwk);
  f.env.UPDATE_SIGNING_KEY_ID = 'test-k1';
  f.env.RELEASE_PUBLISH_SECRET = 'test-publish-secret-xyz';

  // 1. 公开接口绝不允许泄露 private_beta 策略与历史
  const pubBlocked = await f.call('/api/public/update/private_beta');
  assert.equal(pubBlocked.status, 403);
  const pubHistBlocked = await f.call('/api/public/releases/history?channel=private_beta');
  assert.equal(pubHistBlocked.status, 403);

  // 2. 分别激活开发者长期设备与普通内测短期设备
  const devInvRes = await f.call('/api/admin/beta/invites', {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'developer', note: '开发者主力机' }),
  });
  const devInv = (await devInvRes.json()).invite;
  assert.equal(devInv.authDurationMs, 0);

  const testerInvRes = await f.call('/api/admin/beta/invites', {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'tester', note: '普通内测机', authDurationDays: 30 }),
  });
  const testerInv = (await testerInvRes.json()).invite;

  const devKeys = await generateTestEcKeyPair();
  const testerKeys = await generateTestEcKeyPair();
  const devInstallId = randomUUID();
  const testerInstallId = randomUUID();

  const devAuth = await (await f.call('/api/beta/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.2.1' },
    body: JSON.stringify({ code: devInv.code, installId: devInstallId, publicKeySpki: devKeys.spki, deviceModel: 'Xiaomi 15' }),
  })).json();
  assert.equal(devAuth.role, 'developer');
  assert.equal(devAuth.expiresAt, 0);

  const testerAuth = await (await f.call('/api/beta/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.2.2' },
    body: JSON.stringify({ code: testerInv.code, installId: testerInstallId, publicKeySpki: testerKeys.spki, deviceModel: 'Pixel 9' }),
  })).json();
  assert.equal(testerAuth.role, 'tester');
  assert.ok(testerAuth.expiresAt > Date.now());

  // 3. 准备并发布一个私有内测 APK 至私有 R2
  const fakeApk = Buffer.alloc(1_200_000, 0x5a);
  const apkSha = createHash('sha256').update(fakeApk).digest('hex');
  const candRes = await f.call('/api/admin/releases/candidates', {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'rel-private_beta-1.5.84-300',
      channel: 'private_beta',
      versionName: '1.5.84',
      versionCode: 300,
      minSupportedVersionCode: 300,
      forceUpdate: false,
      apkSizeBytes: fakeApk.byteLength,
      sha256: apkSha,
      apkCertSha256: 'a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d',
      releaseNotes: '私有内测首个版本',
      downloadUrls: [{ id: 'beta-r2-primary', label: '私有内测节点', url: 'https://test.invalid/api/beta/download', priority: 1 }],
    }),
  });
  assert.equal(candRes.status, 201);

  const upApkRes = await f.call('/api/admin/beta/apks/rel-private_beta-1.5.84-300', {
    method: 'PUT',
    headers: { ...admin, 'Content-Type': 'application/vnd.android.package-archive' },
    body: fakeApk,
  });
  assert.equal(upApkRes.status, 200);

  const appRes = await f.call('/api/admin/releases/rel-private_beta-1.5.84-300', {
    method: 'PATCH',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewAction: 'approve', forceUpdate: false }),
  });
  const approved = (await appRes.json()).release;

  const pubRes = await f.call('/api/admin/releases/rel-private_beta-1.5.84-300/publish', {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json', 'X-Publish-Secret': 'test-publish-secret-xyz' },
    body: JSON.stringify({
      confirmNonce: 'pub-nonce-1234567890abcdef',
      expectedDigest: approved.approved_digest,
      expectedSha256: apkSha,
    }),
  });
  assert.equal(pubRes.status, 200);

  // 4. 授权设备拉取私有策略，验证 ECDSA 签名及短期 R2 Range 下载
  const polRes = await callBeta(f, devKeys, '/api/beta/policy', devInstallId, devAuth.deviceToken);
  assert.equal(polRes.status, 200);
  const manifest = await polRes.json();
  const sigCheck = await verifyUpdateManifest(manifest, { 'test-k1': policyKey.spki });
  assert.equal(sigCheck.ok, true);
  assert.equal(manifest.channel, 'private_beta');

  const ticketUrl = new URL(manifest.downloadUrls[0].url);
  const dlRange = await f.call(`${ticketUrl.pathname}${ticketUrl.search}`, {
    headers: { Range: 'bytes=0-1023' },
  });
  assert.equal(dlRange.status, 206);
  const chunk = Buffer.from(await dlRange.arrayBuffer());
  assert.equal(chunk.byteLength, 1024);

  // 未携带有效凭据直接下载 R2 APK 必须被拦截
  const unauthDl = await f.call('/api/beta/download?token=forged');
  assert.equal(unauthDl.status, 401);

  // 5. 批量撤销普通内测授权后：普通内测设备立即被拒且旧下载票据失效，而开发者设备保持正常
  const batchRev = await f.call('/api/admin/beta/devices/revoke-testers', {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'phase_1_end' }),
  });
  assert.equal((await batchRev.json()).revokedCount, 1);

  const testerVerify = await callBeta(f, testerKeys, '/api/beta/verify', testerInstallId, testerAuth.deviceToken);
  assert.equal(testerVerify.status, 403);
  assert.equal((await testerVerify.json()).error, 'beta_revoked');

  const devVerify = await callBeta(f, devKeys, '/api/beta/verify', devInstallId, devAuth.deviceToken);
  assert.equal(devVerify.status, 200);
  assert.equal((await devVerify.json()).authorized, true);

  // 撤销开发者设备必须有明确二次确认参数
  const devRevNoConfirm = await f.call(`/api/admin/beta/devices/${devAuth.deviceId}/revoke`, {
    method: 'POST',
    headers: { ...admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(devRevNoConfirm.status, 400);

  // 设备主动退出内测
  const leaveRes = await callBeta(f, devKeys, '/api/beta/leave', devInstallId, devAuth.deviceToken);
  assert.equal(leaveRes.status, 200);
  const devAfterLeave = await callBeta(f, devKeys, '/api/beta/policy', devInstallId, devAuth.deviceToken);
  assert.equal(devAfterLeave.status, 403);
});
