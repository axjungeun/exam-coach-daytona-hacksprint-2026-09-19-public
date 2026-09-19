ALTER TABLE exam_attempts ADD COLUMN content_mode TEXT NOT NULL DEFAULT 'official';
ALTER TABLE feedback_reports ADD COLUMN content_mode TEXT NOT NULL DEFAULT 'official';

CREATE INDEX IF NOT EXISTS exam_attempts_content_mode_idx
  ON exam_attempts(content_mode, round, subject_code);

CREATE INDEX IF NOT EXISTS feedback_reports_content_mode_idx
  ON feedback_reports(content_mode, created_at DESC);
