PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS analysis_signals (
  id TEXT PRIMARY KEY NOT NULL,
  answer_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  subject_code TEXT NOT NULL CHECK (subject_code IN ('BIZ', 'CONTRACT', 'THEORY')),
  domain TEXT NOT NULL,
  concept TEXT NOT NULL,
  selected_choice TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  confusion_code TEXT,
  confusion_label TEXT,
  confusion_source TEXT NOT NULL CHECK (confusion_source IN ('curated-choice-map', 'question-metadata-fallback', 'correct-answer')),
  evidence_material TEXT,
  evidence_page INTEGER,
  learner_action TEXT NOT NULL,
  instructor_action_type TEXT NOT NULL CHECK (instructor_action_type IN ('explanation', 'drill', 'recall')),
  instructor_action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (answer_id) REFERENCES exam_answers(id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS analysis_signals_confusion_idx
  ON analysis_signals(subject_code, domain, concept, confusion_code, created_at);
CREATE INDEX IF NOT EXISTS analysis_signals_learner_idx
  ON analysis_signals(learner_id, question_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lecture_interventions (
  id TEXT PRIMARY KEY NOT NULL,
  synthetic_batch_id TEXT,
  subject_code TEXT NOT NULL CHECK (subject_code IN ('BIZ', 'CONTRACT', 'THEORY')),
  domain TEXT NOT NULL,
  concept TEXT NOT NULL,
  question_id TEXT,
  wrong_choice TEXT,
  confusion_code TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('explanation', 'drill', 'recall')),
  action_label TEXT NOT NULL,
  evidence_material TEXT,
  evidence_page INTEGER,
  baseline_answer_count INTEGER NOT NULL,
  baseline_correct_count INTEGER NOT NULL,
  baseline_affected_learners INTEGER NOT NULL,
  baseline_target_choice_count INTEGER NOT NULL,
  baseline_total_learners INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('planned', 'applied', 'measured', 'closed')),
  applied_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS lecture_interventions_target_idx
  ON lecture_interventions(subject_code, domain, concept, status, applied_at DESC);

CREATE TABLE IF NOT EXISTS review_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  learner_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  concept TEXT NOT NULL,
  confusion_code TEXT,
  confusion_label TEXT,
  evidence_material TEXT,
  evidence_page INTEGER,
  source_signal_id TEXT NOT NULL,
  intervention_id TEXT,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'due', 'completed', 'dismissed')),
  repeat_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  completion_signal_id TEXT,
  FOREIGN KEY (learner_id) REFERENCES learners(id) ON DELETE CASCADE,
  FOREIGN KEY (source_signal_id) REFERENCES analysis_signals(id) ON DELETE CASCADE,
  FOREIGN KEY (intervention_id) REFERENCES lecture_interventions(id) ON DELETE SET NULL,
  UNIQUE (learner_id, question_id)
);

CREATE INDEX IF NOT EXISTS review_tasks_due_idx ON review_tasks(learner_id, status, due_at);
