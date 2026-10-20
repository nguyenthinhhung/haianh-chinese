-- Counting requests per client (failed sign-ins, attempts started) to slow down abuse.
CREATE TABLE hits (
  -- What is counted and for whom: "login:<hashed IP>", "start:<hashed IP>"…
  key TEXT NOT NULL,
  -- Unix seconds.
  at INTEGER NOT NULL
);
CREATE INDEX hits_by_key ON hits (key, at);

-- The teacher may set a deadline after which no new attempt starts.
ALTER TABLE assignments ADD COLUMN closes_at TEXT;

-- Handed in after the time limit or the deadline (with a little grace).
ALTER TABLE attempts ADD COLUMN late INTEGER NOT NULL DEFAULT 0;
