-- Anonymous cumulative count survives personal-data retention; no user/device identifiers.
CREATE TABLE metrics (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
INSERT INTO metrics(key,value) SELECT 'accepted_total',count(*) FROM feedback WHERE phase='ready';
CREATE TRIGGER feedback_accepted AFTER UPDATE OF phase ON feedback
WHEN OLD.phase='pending' AND NEW.phase='ready'
BEGIN UPDATE metrics SET value=value+1 WHERE key='accepted_total'; END;
