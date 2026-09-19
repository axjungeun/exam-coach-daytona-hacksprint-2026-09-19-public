import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const learners = sqliteTable("learners", {
  id: text("id").primaryKey(),
  nickname: text("nickname").notNull(),
  learnerCodeHash: text("learner_code_hash").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  dataOrigin: text("data_origin").notNull().default("real"),
  syntheticBatchId: text("synthetic_batch_id"),
  syntheticPersona: text("synthetic_persona"),
}, (table) => [uniqueIndex("learners_code_hash_idx").on(table.learnerCodeHash)]);

export const learnerSessions = sqliteTable("learner_sessions", {
  sessionHash: text("session_hash").primaryKey(),
  learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const examAttempts = sqliteTable("exam_attempts", {
  id: text("id").primaryKey(),
  learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  clientSubmissionId: text("client_submission_id").notNull(),
  round: integer("round").notNull(),
  contentMode: text("content_mode").notNull().default("official"),
  subjectCode: text("subject_code").notNull(),
  attemptNo: integer("attempt_no").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  startedAt: text("started_at"),
  submittedAt: text("submitted_at").notNull(),
}, (table) => [uniqueIndex("exam_attempts_submission_idx").on(table.learnerId, table.clientSubmissionId)]);

export const examAnswers = sqliteTable("exam_answers", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull().references(() => examAttempts.id, { onDelete: "cascade" }),
  learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  questionNo: integer("question_no").notNull(),
  domain: text("domain").notNull(),
  concept: text("concept").notNull(),
  primaryKeyword: text("primary_keyword"),
  selectedChoice: text("selected_choice").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  answeredAt: text("answered_at").notNull(),
}, (table) => [uniqueIndex("exam_answers_attempt_question_idx").on(table.attemptId, table.questionId)]);

export const analysisSignals = sqliteTable("analysis_signals", {
  id: text("id").primaryKey(),
  answerId: text("answer_id").notNull().references(() => examAnswers.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull().references(() => examAttempts.id, { onDelete: "cascade" }),
  learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  subjectCode: text("subject_code").notNull(),
  domain: text("domain").notNull(),
  concept: text("concept").notNull(),
  selectedChoice: text("selected_choice").notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  confusionCode: text("confusion_code"),
  confusionLabel: text("confusion_label"),
  confusionSource: text("confusion_source").notNull(),
  evidenceMaterial: text("evidence_material"),
  evidencePage: integer("evidence_page"),
  learnerAction: text("learner_action").notNull(),
  instructorActionType: text("instructor_action_type").notNull(),
  instructorAction: text("instructor_action").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("analysis_signals_answer_idx").on(table.answerId)]);

export const lectureInterventions = sqliteTable("lecture_interventions", {
  id: text("id").primaryKey(),
  syntheticBatchId: text("synthetic_batch_id"),
  subjectCode: text("subject_code").notNull(),
  domain: text("domain").notNull(),
  concept: text("concept").notNull(),
  questionId: text("question_id"),
  wrongChoice: text("wrong_choice"),
  confusionCode: text("confusion_code"),
  actionType: text("action_type").notNull(),
  actionLabel: text("action_label").notNull(),
  evidenceMaterial: text("evidence_material"),
  evidencePage: integer("evidence_page"),
  baselineAnswerCount: integer("baseline_answer_count").notNull(),
  baselineCorrectCount: integer("baseline_correct_count").notNull(),
  baselineAffectedLearners: integer("baseline_affected_learners").notNull(),
  baselineTargetChoiceCount: integer("baseline_target_choice_count").notNull(),
  baselineTotalLearners: integer("baseline_total_learners").notNull(),
  status: text("status").notNull().default("applied"),
  appliedAt: text("applied_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const reviewTasks = sqliteTable("review_tasks", {
  id: text("id").primaryKey(),
  learnerId: text("learner_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull(),
  concept: text("concept").notNull(),
  confusionCode: text("confusion_code"),
  confusionLabel: text("confusion_label"),
  evidenceMaterial: text("evidence_material"),
  evidencePage: integer("evidence_page"),
  sourceSignalId: text("source_signal_id").notNull().references(() => analysisSignals.id, { onDelete: "cascade" }),
  interventionId: text("intervention_id").references(() => lectureInterventions.id, { onDelete: "set null" }),
  dueAt: text("due_at").notNull(),
  status: text("status").notNull().default("pending"),
  repeatCount: integer("repeat_count").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
  completionSignalId: text("completion_signal_id"),
}, (table) => [uniqueIndex("review_tasks_learner_question_idx").on(table.learnerId, table.questionId)]);
