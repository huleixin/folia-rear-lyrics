-- feedback-server/migrations/0001_feedback.sql: private feedback ledger and bounded abuse counters.
CREATE TABLE IF NOT EXISTS feedback (
 id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 idempotency_hash TEXT NOT NULL UNIQUE, status_hash TEXT NOT NULL, payload_hash TEXT NOT NULL,
 category TEXT NOT NULL, version TEXT NOT NULL, version_code INTEGER NOT NULL, git_commit TEXT NOT NULL,
 model TEXT NOT NULL, os TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 issue_id TEXT NOT NULL, description TEXT NOT NULL, steps TEXT NOT NULL, metadata TEXT NOT NULL,
 log_key TEXT, log_hash TEXT, log_bytes INTEGER NOT NULL DEFAULT 0, phase TEXT NOT NULL DEFAULT 'pending',
 fix_commit TEXT NOT NULL DEFAULT '', fix_note TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_time ON feedback(created_at DESC, id);
CREATE INDEX IF NOT EXISTS feedback_issue ON feedback(issue_id, phase, created_at);
CREATE INDEX IF NOT EXISTS feedback_filters ON feedback(category, version, status);
CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS challenges (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pairings (hash TEXT PRIMARY KEY, role TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fix_history (feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE, at INTEGER NOT NULL, status TEXT NOT NULL, git_commit TEXT NOT NULL, note TEXT NOT NULL);
INSERT OR IGNORE INTO settings VALUES ('uploads_enabled','false');
CREATE TABLE IF NOT EXISTS quota (id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL DEFAULT 0, CHECK(bytes>=0));
INSERT OR IGNORE INTO quota(id,bytes) VALUES(1,0);
CREATE TRIGGER IF NOT EXISTS quota_insert AFTER INSERT ON feedback BEGIN UPDATE quota SET bytes=bytes+NEW.log_bytes WHERE id=1; END;
CREATE TRIGGER IF NOT EXISTS quota_delete AFTER DELETE ON feedback BEGIN UPDATE quota SET bytes=bytes-OLD.log_bytes WHERE id=1; END;
