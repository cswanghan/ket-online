CREATE TABLE IF NOT EXISTS vocab_progress (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    word_key   TEXT    NOT NULL,
    word       TEXT    NOT NULL,
    topic      TEXT    NOT NULL,
    seen       INTEGER NOT NULL DEFAULT 0,
    streak     INTEGER NOT NULL DEFAULT 0,
    mastered   INTEGER NOT NULL DEFAULT 0,
    wrong      INTEGER NOT NULL DEFAULT 0,
    favorite   INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (user_id, word_key)
);

CREATE INDEX IF NOT EXISTS idx_vocab_progress_user ON vocab_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_vocab_progress_user_topic ON vocab_progress(user_id, topic);
