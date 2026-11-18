-- feedback-server/migrations/0004_telemetry_and_downloads.sql
-- 听屿开发者管理中心第四阶段扩展：官方版本下载计数与快照、轻量化匿名活跃设备统计（零无限追加）、更新效果漏斗及聚合归档。
-- 严格向前兼容：完整保留 0001/0002/0003 所有历史反馈、诊断日志、版本记录、更新策略及审计哈希链。

-- 1. 各版本官方 APK 下载次数统计表（关联真实 APK 附件 ID，排除源码包；cnb_downloads 允许为 NULL 表示官方未开放计数，严禁伪造为 0）
CREATE TABLE IF NOT EXISTS release_download_stats (
    tag_name TEXT PRIMARY KEY,
    release_id TEXT NOT NULL DEFAULT '',
    version_name TEXT NOT NULL,
    version_code INTEGER NOT NULL DEFAULT 0,
    channel TEXT NOT NULL DEFAULT 'stable',
    published_at TEXT NOT NULL DEFAULT '',
    cnb_asset_id TEXT NOT NULL DEFAULT '',
    cnb_asset_name TEXT NOT NULL DEFAULT '',
    cnb_downloads INTEGER,
    github_asset_id TEXT NOT NULL DEFAULT '',
    github_asset_name TEXT NOT NULL DEFAULT '',
    github_downloads INTEGER,
    total_known_downloads INTEGER NOT NULL DEFAULT 0,
    last_synced_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rds_code ON release_download_stats(version_code DESC, published_at DESC);

-- 2. 每日下载计数快照表（用于计算真实每日新增下载量与下载趋势；无前序快照日期不伪造趋势）
CREATE TABLE IF NOT EXISTS release_download_snapshots (
    day TEXT NOT NULL,
    tag_name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'stable',
    cnb_downloads INTEGER,
    github_downloads INTEGER,
    total_known_downloads INTEGER NOT NULL DEFAULT 0,
    captured_at INTEGER NOT NULL,
    PRIMARY KEY (day, tag_name)
);
CREATE INDEX IF NOT EXISTS idx_rdsnap_day ON release_download_snapshots(day ASC);

-- 3. 匿名活跃设备状态表（每个匿名安装 ID 仅占 1 行，覆盖升级保持同一 ID，绝不无限追加心跳流水）
CREATE TABLE IF NOT EXISTS telemetry_devices (
    device_hash TEXT PRIMARY KEY,
    version_name TEXT NOT NULL,
    version_code INTEGER NOT NULL,
    channel TEXT NOT NULL DEFAULT 'stable',
    android_version TEXT NOT NULL DEFAULT '',
    device_model TEXT NOT NULL DEFAULT '',
    first_seen_at INTEGER NOT NULL,
    first_seen_day TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    last_seen_day TEXT NOT NULL,
    is_foreground INTEGER NOT NULL DEFAULT 0,
    is_playing INTEGER NOT NULL DEFAULT 0,
    upgraded_from_code INTEGER NOT NULL DEFAULT 0,
    upgrade_confirmed_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_td_last_seen ON telemetry_devices(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_td_version ON telemetry_devices(version_code DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_td_first_day ON telemetry_devices(first_seen_day);

-- 4. 有期限的设备日活去重表（每台设备每天至多 1 行，保留近 45 天用于精确计算 7d/30d 活跃及次日/7日留存率，过期自动归档清理）
CREATE TABLE IF NOT EXISTS telemetry_device_days (
    device_hash TEXT NOT NULL,
    day TEXT NOT NULL,
    is_new INTEGER NOT NULL DEFAULT 0,
    version_code INTEGER NOT NULL DEFAULT 0,
    channel TEXT NOT NULL DEFAULT 'stable',
    PRIMARY KEY (device_hash, day)
);
CREATE INDEX IF NOT EXISTS idx_tdd_day ON telemetry_device_days(day, is_new);

-- 5. 永久历史日度与月度运营聚合表（小体积永久保存历史每日新增、DAU、留存分子分母与月活）
CREATE TABLE IF NOT EXISTS telemetry_daily_rollups (
    day TEXT PRIMARY KEY,
    dau INTEGER NOT NULL DEFAULT 0,
    new_devices INTEGER NOT NULL DEFAULT 0,
    ret_1d_cohort INTEGER NOT NULL DEFAULT 0,
    ret_1d_retained INTEGER NOT NULL DEFAULT 0,
    ret_7d_cohort INTEGER NOT NULL DEFAULT 0,
    ret_7d_retained INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_monthly_rollups (
    month TEXT PRIMARY KEY,
    mau INTEGER NOT NULL DEFAULT 0,
    new_devices INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

-- 6. 软件内更新下载、校验与覆盖安装首启确认聚合表（按日/版本/渠道/节点聚合，零无限流水）
CREATE TABLE IF NOT EXISTS telemetry_update_rollups (
    day TEXT NOT NULL,
    version_code INTEGER NOT NULL,
    version_name TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'stable',
    mirror_id TEXT NOT NULL DEFAULT 'unknown',
    download_started INTEGER NOT NULL DEFAULT 0,
    download_succeeded INTEGER NOT NULL DEFAULT 0,
    download_failed INTEGER NOT NULL DEFAULT 0,
    verify_failed INTEGER NOT NULL DEFAULT 0,
    install_confirmed INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (day, version_code, channel, mirror_id)
);
CREATE INDEX IF NOT EXISTS idx_tur_version ON telemetry_update_rollups(version_code DESC, day DESC);

-- 初始化运营统计默认安全参数（若不存在则写入，保留管理员已有设置）
INSERT OR IGNORE INTO settings(key, value) VALUES ('telemetry_enabled', 'true');
INSERT OR IGNORE INTO settings(key, value) VALUES ('telemetry_interval_sec', '600');
INSERT OR IGNORE INTO settings(key, value) VALUES ('telemetry_daily_write_budget', '40000');
INSERT OR IGNORE INTO settings(key, value) VALUES ('telemetry_started_day', '');
