CREATE TABLE IF NOT EXISTS ux_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id   TEXT    NOT NULL,
    user_id      INTEGER,
    page_path    TEXT    NOT NULL,
    event_name   TEXT    NOT NULL,
    event_group  TEXT    NOT NULL DEFAULT 'behavior',
    label        TEXT,
    value        INTEGER,
    device_type  TEXT    NOT NULL DEFAULT 'desktop',
    meta_json    TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ux_events_created ON ux_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ux_events_page ON ux_events(page_path, created_at);
CREATE INDEX IF NOT EXISTS idx_ux_events_name ON ux_events(event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_ux_events_session ON ux_events(session_id, created_at);
