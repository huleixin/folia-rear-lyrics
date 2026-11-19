-- feedback-server/migrations/0005_private_beta.sql
-- 听屿私有内测权限体系：一次性邀请码（仅存安全散列）、设备绑定授权（Keystore 公钥 PoP 验签）、私有内测更新策略与下载鉴权。
-- 严格向前兼容：完整保留 0001-0004 所有表结构与历史数据。

-- 1. 内测一次性邀请码表（服务端绝不保存可兑换明文，仅保存 SHA-256 散列与末 4 位脱敏提示）
CREATE TABLE IF NOT EXISTS beta_invites (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    code_hint TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'tester', -- 'developer' | 'tester'
    note TEXT NOT NULL DEFAULT '',
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    invite_expires_at INTEGER NOT NULL,
    auth_duration_ms INTEGER NOT NULL DEFAULT 2592000000, -- 0 表示长期有效（仅开发者设备），默认 30 天
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'used' | 'cancelled'
    created_at INTEGER NOT NULL,
    used_at INTEGER NOT NULL DEFAULT 0,
    used_by_device_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_beta_invites_status ON beta_invites(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_invites_exp ON beta_invites(invite_expires_at);

-- 2. 内测授权设备表（绑定独立随机安装标识散列 + 客户端 Android Keystore ECDSA 公钥）
CREATE TABLE IF NOT EXISTS beta_devices (
    id TEXT PRIMARY KEY,
    install_id_hash TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL,
    public_key_spki TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'tester', -- 'developer' | 'tester'
    note TEXT NOT NULL DEFAULT '',
    device_model TEXT NOT NULL DEFAULT '',
    android_version TEXT NOT NULL DEFAULT '',
    app_version_name TEXT NOT NULL DEFAULT '',
    app_version_code INTEGER NOT NULL DEFAULT 0,
    active_channel TEXT NOT NULL DEFAULT 'stable',
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'revoked'
    activated_at INTEGER NOT NULL,
    last_verified_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL DEFAULT 0, -- 0 表示长期有效
    revoked_at INTEGER NOT NULL DEFAULT 0,
    revoke_reason TEXT NOT NULL DEFAULT '',
    invite_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_beta_devices_status ON beta_devices(status, role, last_verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_beta_devices_exp ON beta_devices(expires_at);

-- 3. 私有内测 APK 存储元数据表（关联私有 R2 对象键，绝不通过公开直链暴露）
CREATE TABLE IF NOT EXISTS beta_apk_objects (
    release_id TEXT PRIMARY KEY,
    r2_key TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    version_name TEXT NOT NULL,
    version_code INTEGER NOT NULL,
    uploaded_at INTEGER NOT NULL
);
