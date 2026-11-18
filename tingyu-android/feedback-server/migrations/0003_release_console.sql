-- feedback-server/migrations/0003_release_console.sql
-- 听屿开发者管理中心扩展表：版本候选与正式管理、签名更新策略、下载节点探活、防篡改哈希链审计账本及反馈版本联动。
-- 完整保留 0001/0002 既有表结构与历史数据，零破坏性变更。

CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    version_name TEXT NOT NULL,
    version_code INTEGER NOT NULL,
    min_supported_version_code INTEGER NOT NULL DEFAULT 1,
    force_update INTEGER NOT NULL DEFAULT 1,
    apk_size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT NOT NULL DEFAULT '',
    apk_cert_sha256 TEXT NOT NULL DEFAULT '',
    min_sdk INTEGER NOT NULL DEFAULT 24,
    abis_json TEXT NOT NULL DEFAULT '["arm64-v8a","armeabi-v7a"]',
    git_commit TEXT NOT NULL DEFAULT '',
    release_notes TEXT NOT NULL DEFAULT '',
    download_urls_json TEXT NOT NULL DEFAULT '[]',
    cnb_tag TEXT NOT NULL DEFAULT '',
    cnb_release_id TEXT NOT NULL DEFAULT '',
    fixed_issues_json TEXT NOT NULL DEFAULT '[]',
    verification_json TEXT NOT NULL DEFAULT '{}',
    approved_digest TEXT NOT NULL DEFAULT '',
    approved_at INTEGER NOT NULL DEFAULT 0,
    published_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS releases_channel_code ON releases(channel, version_code DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS releases_status ON releases(channel, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS update_policies (
    channel TEXT PRIMARY KEY,
    policy_revision INTEGER NOT NULL,
    policy_action TEXT NOT NULL,
    update_enabled INTEGER NOT NULL DEFAULT 0,
    latest_version_name TEXT NOT NULL,
    latest_version_code INTEGER NOT NULL,
    min_supported_version_code INTEGER NOT NULL,
    release_id TEXT NOT NULL,
    signed_manifest_json TEXT NOT NULL,
    node_sync_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS download_nodes (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    accessible INTEGER NOT NULL DEFAULT 0,
    http_status INTEGER NOT NULL DEFAULT 0,
    verified_size_bytes INTEGER NOT NULL DEFAULT 0,
    verified_sha256 TEXT NOT NULL DEFAULT '',
    integrity_ok INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    last_checked_at INTEGER NOT NULL DEFAULT 0,
    detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS download_nodes_release ON download_nodes(release_id, node_type);

CREATE TABLE IF NOT EXISTS release_audit_logs (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    channel TEXT NOT NULL,
    release_id TEXT NOT NULL DEFAULT '',
    version_name TEXT NOT NULL DEFAULT '',
    version_code INTEGER NOT NULL DEFAULT 0,
    apk_sha256 TEXT NOT NULL DEFAULT '',
    policy_revision INTEGER NOT NULL DEFAULT 0,
    result TEXT NOT NULL,
    detail_json TEXT NOT NULL DEFAULT '{}',
    prev_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS release_audit_time ON release_audit_logs(at DESC, seq DESC);

CREATE TRIGGER IF NOT EXISTS release_audit_no_update
BEFORE UPDATE ON release_audit_logs
BEGIN
    SELECT RAISE(ABORT, 'audit_log_immutable');
END;

CREATE TRIGGER IF NOT EXISTS release_audit_no_delete
BEFORE DELETE ON release_audit_logs
BEGIN
    SELECT RAISE(ABORT, 'audit_log_immutable');
END;

CREATE TABLE IF NOT EXISTS feedback_links (
    feedback_id TEXT PRIMARY KEY,
    workflow_stage TEXT NOT NULL DEFAULT 'new',
    target_version TEXT NOT NULL DEFAULT '',
    fixed_version TEXT NOT NULL DEFAULT '',
    merged_issue_id TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_links_target ON feedback_links(target_version, fixed_version);

CREATE TABLE IF NOT EXISTS issue_notes (
    issue_id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    workflow_stage TEXT NOT NULL DEFAULT 'pending_confirm',
    priority_label TEXT NOT NULL DEFAULT '',
    target_version TEXT NOT NULL DEFAULT '',
    fixed_version TEXT NOT NULL DEFAULT '',
    fix_commit TEXT NOT NULL DEFAULT '',
    ai_analysis TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
);
