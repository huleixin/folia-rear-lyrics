import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, admin, read } from './harness.mjs';
import { toCnDay, shiftCnDay, invalidateTelemetrySummaryCache } from '../src/telemetry.mjs';

const VALID_ID_1 = '550e8400-e29b-41d4-a716-446655440001';
const VALID_ID_2 = '550e8400-e29b-41d4-a716-446655440002';

test('telemetry heartbeat enforces strict privacy whitelist, deduplicates within window, and confirms real boot upgrade', async () => {
  invalidateTelemetrySummaryCache();
  const f = fixture();

  // 1. 携带未授权隐私字段必须被 400 拒绝
  for (const extra of [{ phone: '13800000000' }, { cookie: 'MUSIC_U=xxx' }, { songTitle: 'test.mp3' }, { imei: '12345' }]) {
    const badRes = await f.call('/api/public/telemetry/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installId: VALID_ID_1,
        versionName: '1.5.81',
        versionCode: 297,
        channel: 'stable',
        androidVersion: '15',
        deviceModel: '23127PN0CC',
        isForeground: true,
        isPlaying: false,
        ...extra,
      }),
    });
    assert.equal(badRes.status, 400);
    assert.equal((await badRes.json()).error, 'unsafe_or_unknown_fields');
  }

  // 2. 首次合法冷启动心跳写入 1 台活跃设备（且数据库仅存单向哈希，绝不存明文 UUID）
  const hb1 = await f.call('/api/public/telemetry/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.1' },
    body: JSON.stringify({
      installId: VALID_ID_1,
      versionName: '1.5.81',
      versionCode: 297,
      channel: 'stable',
      androidVersion: '15',
      deviceModel: '23127PN0CC',
      isForeground: true,
      isPlaying: true,
    }),
  });
  assert.equal(hb1.status, 200);
  const hb1Json = await hb1.json();
  assert.equal(hb1Json.accepted, true);
  assert.equal(hb1Json.deduplicated, false);

  const rawRows = f.sql.prepare('SELECT * FROM telemetry_devices').all();
  assert.equal(rawRows.length, 1);
  assert.notEqual(rawRows[0].device_hash, VALID_ID_1);

  // 3. 8 分钟内同版本同状态的重复心跳直接内存去重，不增加 D1 写入计数
  const writesBefore = f.sql.prepare("SELECT value FROM metrics WHERE key LIKE 'telemetry_writes:%'").get()?.value ?? 0;
  const hbDup = await f.call('/api/public/telemetry/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.1' },
    body: JSON.stringify({
      installId: VALID_ID_1,
      versionName: '1.5.81',
      versionCode: 297,
      channel: 'stable',
      androidVersion: '15',
      deviceModel: '23127PN0CC',
      isForeground: true,
      isPlaying: true,
    }),
  });
  const hbDupJson = await hbDup.json();
  assert.equal(hbDupJson.deduplicated, true);
  const writesAfter = f.sql.prepare("SELECT value FROM metrics WHERE key LIKE 'telemetry_writes:%'").get()?.value ?? 0;
  assert.equal(writesAfter, writesBefore);

  // 4. 客户端模拟下载新版本 v1.5.82 (298) 事件 + 覆盖安装后新版实际冷启动上报版本推进心跳
  const evStart = await f.call('/api/public/telemetry/update-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.1' },
    body: JSON.stringify({
      installId: VALID_ID_1,
      event: 'download_started',
      targetVersionCode: 298,
      targetVersionName: '1.5.82',
      channel: 'stable',
      mirrorId: 'cnb-primary',
    }),
  });
  assert.equal(evStart.status, 200);

  const evOk = await f.call('/api/public/telemetry/update-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.1' },
    body: JSON.stringify({
      installId: VALID_ID_1,
      event: 'download_succeeded',
      targetVersionCode: 298,
      targetVersionName: '1.5.82',
      channel: 'stable',
      mirrorId: 'cnb-primary',
    }),
  });
  assert.equal(evOk.status, 200);

  // 尚未启动新版时 installConfirmed 必须为 0
  invalidateTelemetrySummaryCache();
  let sumRes = await f.call('/api/admin/telemetry/summary?range=7d&fresh=1', { headers: admin });
  let sumJson = await sumRes.json();
  assert.equal(sumJson.updateFunnel.installConfirmed, 0);
  assert.equal(sumJson.updateFunnel.downloadSucceeded, 1);

  // 新版 v1.5.82 (298) 覆盖升级后首次冷启动（同一 installId，版本 297 -> 298）
  const hbUpgraded = await f.call('/api/public/telemetry/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.1.1' },
    body: JSON.stringify({
      installId: VALID_ID_1,
      versionName: '1.5.82',
      versionCode: 298,
      channel: 'stable',
      androidVersion: '15',
      deviceModel: '23127PN0CC',
      isForeground: true,
      isPlaying: false,
      previousVersionCode: 297,
    }),
  });
  assert.equal((await hbUpgraded.json()).upgradeConfirmed, true);

  invalidateTelemetrySummaryCache();
  sumRes = await f.call('/api/admin/telemetry/summary?range=7d&fresh=1', { headers: admin });
  sumJson = await sumRes.json();
  assert.equal(sumJson.kpis.totalObservedDevices, 1, '覆盖升级保持同一匿名安装 ID 不重复计为新设备');
  assert.equal(sumJson.kpis.activeRecentDevices, 1);
  assert.equal(sumJson.kpis.dauToday, 1);
  assert.equal(sumJson.updateFunnel.installConfirmed, 1, '新版实际启动后确认覆盖更新成功');
  assert.equal(sumJson.retention.day1.ratePercent, null, '首日样本未跨过次日观察窗时必须诚实返回 null');
});

test('download stats keep missing CNB official count as null (never forged as 0) and compute honest snapshot deltas', async () => {
  invalidateTelemetrySummaryCache();
  const f = fixture();
  const today = toCnDay();
  const yesterday = shiftCnDay(today, -1);

  // 插入 GitHub 有计数、CNB 无官方计数 (NULL) 的真实形态
  f.sql.prepare(
    `INSERT INTO release_download_stats(
      tag_name, version_name, version_code, channel, github_asset_name, github_downloads, cnb_downloads, total_known_downloads, last_synced_at
    ) VALUES('v1.5.81', '1.5.81', 297, 'stable', 'tingyu-1.5.81-release.apk', 26, NULL, 26, ?)`,
  ).run(Date.now());

  // 仅今日快照时，todayNewDownloads 应为 null（不伪造增量）
  f.sql.prepare(
    `INSERT INTO release_download_snapshots(day, tag_name, channel, github_downloads, cnb_downloads, total_known_downloads, captured_at)
     VALUES(?, 'v1.5.81', 'stable', 26, NULL, 26, ?)`,
  ).run(today, Date.now());

  let res = await f.call('/api/admin/telemetry/summary?range=7d&fresh=1', { headers: admin });
  let data = await res.json();
  assert.equal(data.downloads.cnbOfficialStatsAvailable, false);
  assert.equal(data.downloads.cnbOfficialTotalDownloads, null);
  assert.equal(data.downloads.githubOfficialTotalDownloads, 26);
  assert.equal(data.downloads.todayNewDownloads, null);
  assert.equal(data.downloads.versions[0].cnbDownloads, null);

  // 补充昨日快照 20 次后，今日新增下载准确计算为 6 次
  f.sql.prepare(
    `INSERT INTO release_download_snapshots(day, tag_name, channel, github_downloads, cnb_downloads, total_known_downloads, captured_at)
     VALUES(?, 'v1.5.81', 'stable', 20, NULL, 20, ?)`,
  ).run(yesterday, Date.now() - 86400_000);

  res = await f.call('/api/admin/telemetry/summary?range=7d&fresh=1', { headers: admin });
  data = await res.json();
  assert.equal(data.downloads.todayNewDownloads, 6);
});

test('overview cleanly separates stable/testing/candidate releases and maps cnb-primary & github-backup node states', async () => {
  const f = fixture();
  const now = Date.now();

  // 插入已发布的正式版 v1.5.81 与已发布的测试版 v1.5.80（验证测试版绝不会污染 candidateRelease）
  const urlsJson = JSON.stringify([
    { id: 'cnb-primary', label: 'CNB 国内高速主节点', url: 'https://cnb.cool/tingyu-2026/releases/-/releases/download/v1.5.81/tingyu-1.5.81-release.apk', priority: 1 },
    { id: 'github-backup', label: 'GitHub 备用节点', url: 'https://github.com/huleixin/folia-rear-lyrics/releases/download/v1.5.81/tingyu-1.5.81-release.apk', priority: 2 },
  ]);

  f.sql.prepare(
    `INSERT INTO releases(id, channel, status, version_name, version_code, min_supported_version_code, force_update,
      apk_size_bytes, sha256, apk_cert_sha256, download_urls_json, created_at, updated_at, published_at)
     VALUES('rel-stable-1.5.81-297', 'stable', 'published', '1.5.81', 297, 297, 1, 15000000, ?, ?, ?, ?, ?, ?)`,
  ).run('a'.repeat(64), 'a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d', urlsJson, now, now, now);

  f.sql.prepare(
    `INSERT INTO releases(id, channel, status, version_name, version_code, min_supported_version_code, force_update,
      apk_size_bytes, sha256, apk_cert_sha256, download_urls_json, created_at, updated_at, published_at)
     VALUES('rel-testing-1.5.80-296', 'testing', 'published', '1.5.80', 296, 296, 1, 15000000, ?, ?, '[]', ?, ?, ?)`,
  ).run('b'.repeat(64), 'a36ef2a5324b55d1b8469bd83b081f43ec9c9ce563f0e6cf67567f8ece02249d', now, now, now);

  // CNB 节点刚检测正常，GitHub 节点超过 3 小时前检测 -> 应分别识别为「正常」和「数据过期」
  f.sql.prepare(
    `INSERT INTO download_nodes(id, release_id, node_type, label, url, accessible, http_status, verified_size_bytes, verified_sha256, integrity_ok, latency_ms, last_checked_at, detail)
     VALUES('rel-stable-1.5.81-297:cnb-primary', 'rel-stable-1.5.81-297', 'cnb-primary', 'CNB 国内高速主节点', 'https://cnb.cool/a.apk', 1, 206, 15000000, ?, 1, 92, ?, 'range_supported_ok')`,
  ).run('a'.repeat(64), now - 60_000);

  f.sql.prepare(
    `INSERT INTO download_nodes(id, release_id, node_type, label, url, accessible, http_status, verified_size_bytes, verified_sha256, integrity_ok, latency_ms, last_checked_at, detail)
     VALUES('rel-stable-1.5.81-297:github-backup', 'rel-stable-1.5.81-297', 'github-backup', 'GitHub 备用节点', 'https://github.com/a.apk', 1, 200, 15000000, '', 0, 280, ?, 'direct_stream_ok')`,
  ).run(now - 3 * 3600_000);

  const ovRes = await f.call('/api/admin/overview', { headers: admin });
  assert.equal(ovRes.status, 200);
  const ov = await ovRes.json();

  assert.equal(ov.stableRelease.version_name, '1.5.81');
  assert.equal(ov.testingRelease.version_name, '1.5.80');
  assert.equal(ov.candidateRelease, null, '已发布的测试版不得混入待审候选版本');
  assert.equal(ov.nodeSummary.cnbPrimary.stateLabel, '正常');
  assert.equal(ov.nodeSummary.cnbPrimary.httpStatus, 206);
  assert.equal(ov.nodeSummary.githubBackup.stateLabel, '数据过期');
});

test('telemetry endpoints enforce admin authorization and quota circuit breaker', async () => {
  invalidateTelemetrySummaryCache();
  const f = fixture();

  // 未登录访问运营统计后台接口必须返回 401
  const unauth = await f.call('/api/admin/telemetry/summary');
  assert.equal(unauth.status, 401);

  // 只读权限可以读取 summary，但禁止修改统计配额设置 (403)
  const readOk = await f.call('/api/admin/telemetry/summary', { headers: read });
  assert.equal(readOk.status, 200);
  const readDenied = await f.call('/api/admin/telemetry/config', {
    method: 'PATCH',
    headers: { ...read, 'Content-Type': 'application/json' },
    body: JSON.stringify({ telemetryEnabled: false }),
  });
  assert.equal(readDenied.status, 403);

  // 触发 88% 每日写入预算熔断后，心跳自动降级为 accepted: false, throttleMode: paused_quota_guard，且暂停期间保持严格 0 次额外 D1 写入
  const today = toCnDay();
  f.sql.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('telemetry_daily_write_budget', '1000')").run();
  f.sql.prepare('INSERT OR REPLACE INTO metrics(key, value) VALUES(?, 950)').run(`telemetry_writes:${today}`);
  const countersBefore = f.sql.prepare('SELECT count(*) AS c FROM counters').get().c;

  const hbPaused = await f.call('/api/public/telemetry/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.9.9' },
    body: JSON.stringify({
      installId: VALID_ID_2,
      versionName: '1.5.82',
      versionCode: 298,
      channel: 'stable',
      androidVersion: '14',
      deviceModel: 'Pixel',
      isForeground: true,
      isPlaying: false,
    }),
  });
  const pausedBody = await hbPaused.json();
  assert.equal(pausedBody.accepted, false);
  assert.equal(pausedBody.throttleMode, 'paused_quota_guard');
  assert.equal(pausedBody.nextIntervalSec, 3600);
  const countersAfter = f.sql.prepare('SELECT count(*) AS c FROM counters').get().c;
  assert.equal(countersAfter, countersBefore, '额度熔断暂停期间不得向 counters 表产生任何额外 D1 写入');
  const writeCountAfter = f.sql.prepare('SELECT value FROM metrics WHERE key=?').get(`telemetry_writes:${today}`).value;
  assert.equal(writeCountAfter, 950);
});
