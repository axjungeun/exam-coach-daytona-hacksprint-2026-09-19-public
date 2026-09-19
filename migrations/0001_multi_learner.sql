PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS learners (
  id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL,
  learner_code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learner_sessions (
  session_hash TEXT PRIMARY KEY NOT NULL,
  learner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS learner_sessions_learner_idx ON learner_sessions(learner_id);
CREATE INDEX IF NOT EXISTS learner_sessions_expiry_idx ON learner_sessions(expires_at);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  learner_id TEXT NOT NULL,
  client_submission_id TEXT NOT NULL,
  round INTEGER NOT NULL,
  subject_code TEXT NOT NULL CHECK (subject_code IN ('BIZ', 'CONTRACT', 'THEORY')),
  attempt_no INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  started_at TEXT,
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE,
  UNIQUE (learner_id, client_submission_id)
);

CREATE INDEX IF NOT EXISTS exam_attempts_learner_idx ON exam_attempts(learner_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS exam_attempts_round_subject_idx ON exam_attempts(round, subject_code);

CREATE TABLE IF NOT EXISTS exam_answers (
  id TEXT PRIMARY KEY NOT NULL,
  attempt_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_no INTEGER NOT NULL,
  domain TEXT NOT NULL,
  concept TEXT NOT NULL,
  primary_keyword TEXT,
  selected_choice TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  answered_at TEXT NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE,
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS exam_answers_learner_idx ON exam_answers(learner_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS exam_answers_concept_idx ON exam_answers(concept, correct);
