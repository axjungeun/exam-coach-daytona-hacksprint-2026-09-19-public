PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS feedback_reports (
  id TEXT PRIMARY KEY NOT NULL,
  learner_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('content', 'grading', 'screen', 'other')),
  message TEXT NOT NULL,
  round INTEGER,
  subject_code TEXT CHECK (subject_code IN ('BIZ', 'CONTRACT', 'THEORY')),
  question_no INTEGER,
  page_path TEXT,
  client_error TEXT,
  user_agent TEXT,
  viewport TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS feedback_reports_status_idx ON feedback_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_reports_learner_idx ON feedback_reports(learner_id, created_at DESC);
