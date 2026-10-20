-- Exercises handed out to students, and every attempt at one.

CREATE TABLE assignments (
  -- The exercise's own ID (e_…), so handing it out again updates the same assignment.
  id TEXT PRIMARY KEY,
  -- What the student's link carries: random and hard to guess.
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  lesson_title TEXT NOT NULL DEFAULT '',
  -- JSON: the exercise with its answers, the lesson's theme, and where its files are.
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  closed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  -- The assignment's version when the attempt was graded.
  version INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  -- Random ID kept in the student's browser; tells apart students with the same name.
  client_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  -- JSON: the answers handed in, and the grade of each question.
  answers TEXT,
  grade TEXT,
  score INTEGER,
  max_score INTEGER,
  percent INTEGER
);

CREATE INDEX attempts_by_assignment ON attempts (assignment_id, submitted_at);
CREATE INDEX attempts_by_client ON attempts (assignment_id, client_id);
