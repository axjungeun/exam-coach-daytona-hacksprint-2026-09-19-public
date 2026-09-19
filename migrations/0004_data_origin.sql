ALTER TABLE learners ADD COLUMN data_origin TEXT NOT NULL DEFAULT 'real';
ALTER TABLE learners ADD COLUMN synthetic_batch_id TEXT;
ALTER TABLE learners ADD COLUMN synthetic_persona TEXT;

CREATE INDEX IF NOT EXISTS learners_origin_batch_idx
  ON learners(data_origin, synthetic_batch_id);
