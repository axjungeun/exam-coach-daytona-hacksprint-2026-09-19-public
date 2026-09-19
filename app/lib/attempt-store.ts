import { resolveAnalysisSignal } from "./analysis-signal";

export type PersistedQuestion = {
  id: string;
  subject: string;
  questionNo: number;
  domain: string;
  concept: string;
  keywords: string[];
  numericType?: string;
};

export type PersistAttemptInput = {
  learnerId: string;
  clientSubmissionId: string;
  round: number;
  contentMode?: "official" | "original_practice";
  subjectCode: string;
  score: number;
  total: number;
  startedAt?: string | null;
  submittedAt: string;
  questions: PersistedQuestion[];
  answers: Record<string, string>;
  results: Record<string, { correct: boolean }>;
};

export async function persistExamAttempt(db: D1Database, input: PersistAttemptInput) {
  const existing = await db.prepare(
    "SELECT id, attempt_no FROM exam_attempts WHERE learner_id = ? AND client_submission_id = ? LIMIT 1",
  ).bind(input.learnerId, input.clientSubmissionId).first<{ id: string; attempt_no: number }>();
  if (existing) return { attemptId: existing.id, attemptNo: existing.attempt_no, duplicate: true };

  const next = await db.prepare(
    "SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attempt_no FROM exam_attempts WHERE learner_id = ? AND round = ? AND subject_code = ? AND content_mode = ?",
  ).bind(input.learnerId, input.round, input.subjectCode, input.contentMode ?? "official").first<{ attempt_no: number }>();
  const attemptNo = Number(next?.attempt_no ?? 1);
  const attemptId = crypto.randomUUID();
  const answerRows = input.questions.map((question) => {
    const answerId = crypto.randomUUID();
    const signalId = crypto.randomUUID();
    const correct = Boolean(input.results[question.id]?.correct);
    const selectedChoice = input.answers[question.id];
    const signal = resolveAnalysisSignal({
      question: { ...question, subjectCode: input.subjectCode },
      selectedChoice,
      correct,
      answeredAt: input.submittedAt,
    });
    return { answerId, signalId, question, selectedChoice, correct, signal };
  });
  const statements = [
    db.prepare(
      `INSERT INTO exam_attempts
       (id, learner_id, client_submission_id, round, content_mode, subject_code, attempt_no, score, total, started_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      attemptId,
      input.learnerId,
      input.clientSubmissionId,
      input.round,
      input.contentMode ?? "official",
      input.subjectCode,
      attemptNo,
      input.score,
      input.total,
      input.startedAt ?? null,
      input.submittedAt,
    ),
    ...answerRows.map((row) => db.prepare(
      `INSERT INTO exam_answers
       (id, attempt_id, learner_id, question_id, question_no, domain, concept, primary_keyword, selected_choice, correct, answered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.answerId,
      attemptId,
      input.learnerId,
      row.question.id,
      row.question.questionNo,
      row.question.domain,
      row.question.concept,
      row.question.keywords[0] ?? null,
      row.selectedChoice,
      row.correct ? 1 : 0,
      input.submittedAt,
    )),
    ...answerRows.map((row) => db.prepare(
      `INSERT INTO analysis_signals
       (id, answer_id, attempt_id, learner_id, question_id, subject_code, domain, concept, selected_choice, correct,
        confusion_code, confusion_label, confusion_source, evidence_material, evidence_page, learner_action,
        instructor_action_type, instructor_action, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.signalId,
      row.answerId,
      attemptId,
      input.learnerId,
      row.question.id,
      input.subjectCode,
      row.question.domain,
      row.question.concept,
      row.selectedChoice,
      row.correct ? 1 : 0,
      row.signal.confusionCode,
      row.signal.confusionLabel,
      row.signal.confusionSource,
      row.signal.evidence?.material ?? null,
      row.signal.evidence?.page ?? null,
      row.signal.learnerAction,
      row.signal.instructorActionType,
      row.signal.instructorAction,
      input.submittedAt,
    )),
    ...answerRows.map((row) => row.correct
      ? db.prepare(
        `UPDATE review_tasks
         SET status = 'completed', updated_at = ?, completed_at = ?, completion_signal_id = ?
         WHERE learner_id = ? AND question_id = ? AND status IN ('pending', 'due')`,
      ).bind(input.submittedAt, input.submittedAt, row.signalId, input.learnerId, row.question.id)
      : db.prepare(
        `INSERT INTO review_tasks
         (id, learner_id, question_id, concept, confusion_code, confusion_label, evidence_material, evidence_page,
          source_signal_id, intervention_id, due_at, status, repeat_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
           (SELECT id FROM lecture_interventions
            WHERE status = 'applied' AND subject_code = ? AND domain = ? AND concept = ?
            ORDER BY applied_at DESC LIMIT 1),
           ?, 'pending', 1, ?, ?)
         ON CONFLICT(learner_id, question_id) DO UPDATE SET
           concept = excluded.concept,
           confusion_code = excluded.confusion_code,
           confusion_label = excluded.confusion_label,
           evidence_material = excluded.evidence_material,
           evidence_page = excluded.evidence_page,
           source_signal_id = excluded.source_signal_id,
           intervention_id = excluded.intervention_id,
           due_at = excluded.due_at,
           status = 'pending',
           repeat_count = review_tasks.repeat_count + 1,
           updated_at = excluded.updated_at,
           completed_at = NULL,
           completion_signal_id = NULL`,
      ).bind(
        crypto.randomUUID(),
        input.learnerId,
        row.question.id,
        row.question.concept,
        row.signal.confusionCode,
        row.signal.confusionLabel,
        row.signal.evidence?.material ?? null,
        row.signal.evidence?.page ?? null,
        row.signalId,
        input.subjectCode,
        row.question.domain,
        row.question.concept,
        row.signal.reviewDueAt,
        input.submittedAt,
        input.submittedAt,
      )),
  ];
  await db.batch(statements);
  await db.prepare("UPDATE learners SET last_seen_at = ? WHERE id = ?")
    .bind(input.submittedAt, input.learnerId).run();
  return {
    attemptId,
    attemptNo,
    duplicate: false,
    reviewTasksScheduled: answerRows.filter((row) => !row.correct).length,
  };
}
