import { authenticateLearner, getLearnerDatabase } from "../../lib/learner-auth";

type AttemptRow = {
  id: string;
  round: number;
  subject_code: string;
  attempt_no: number;
  score: number;
  total: number;
  started_at: string | null;
  submitted_at: string;
};

type AnswerRow = {
  attempt_id: string;
  question_id: string;
  concept: string;
  correct: number;
  answered_at: string;
};

type ReviewTaskRow = {
  id: string;
  question_id: string;
  concept: string;
  confusion_code: string | null;
  confusion_label: string | null;
  evidence_material: string | null;
  evidence_page: number | null;
  due_at: string;
  status: string;
  repeat_count: number;
  intervention_id: string | null;
  intervention_action: string | null;
};

export async function GET(request: Request) {
  const db = getLearnerDatabase();
  if (!db) return Response.json({ error: "학습 기록 데이터베이스가 준비되지 않았습니다." }, { status: 503 });
  const learner = await authenticateLearner(request, db);
  if (!learner) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const attempts = await db.prepare(
    `SELECT id, round, subject_code, attempt_no, score, total, started_at, submitted_at
     FROM exam_attempts WHERE learner_id = ? ORDER BY submitted_at DESC LIMIT 100`,
  ).bind(learner.id).all<AttemptRow>();
  const answers = await db.prepare(
    `SELECT attempt_id, question_id, concept, correct, answered_at
     FROM exam_answers WHERE learner_id = ? ORDER BY answered_at DESC LIMIT 4000`,
  ).bind(learner.id).all<AnswerRow>();
  let reviewTaskRows: ReviewTaskRow[] = [];
  try {
    const reviewTasks = await db.prepare(
      `SELECT r.id, r.question_id, r.concept, r.confusion_code, r.confusion_label,
              r.evidence_material, r.evidence_page, r.due_at, r.status, r.repeat_count,
              r.intervention_id, i.action_label AS intervention_action
       FROM review_tasks r
       LEFT JOIN lecture_interventions i ON i.id = r.intervention_id
       WHERE r.learner_id = ? AND r.status IN ('pending', 'due')
       ORDER BY r.due_at ASC LIMIT 200`,
    ).bind(learner.id).all<ReviewTaskRow>();
    reviewTaskRows = reviewTasks.results;
  } catch {
    reviewTaskRows = [];
  }

  return Response.json({
    learner: { id: learner.id, nickname: learner.nickname },
    attempts: attempts.results.map((row) => ({
      id: row.id,
      round: row.round,
      subjectCode: row.subject_code,
      attemptNo: row.attempt_no,
      score: row.score,
      total: row.total,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
    })),
    history: answers.results.map((row) => ({
      attemptId: row.attempt_id,
      questionId: row.question_id,
      concept: row.concept,
      correct: Boolean(row.correct),
      answeredAt: row.answered_at,
      source: "app",
    })),
    reviewQueue: reviewTaskRows.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      concept: row.concept,
      confusionCode: row.confusion_code,
      confusionLabel: row.confusion_label,
      evidence: row.evidence_material
        ? { material: row.evidence_material, page: row.evidence_page }
        : null,
      dueAt: row.due_at,
      status: new Date(row.due_at).getTime() <= Date.now() ? "due" : row.status,
      repeatCount: Number(row.repeat_count),
      intervention: row.intervention_id
        ? { id: row.intervention_id, action: row.intervention_action }
        : null,
    })),
  });
}
