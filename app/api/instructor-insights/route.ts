import { getLearnerDatabase } from "../../lib/learner-auth";
import choiceDiagnosticsData from "../../data/choice-diagnostics.json";
import practiceQuestionData from "../../data/public-practice-questions.json";
import { calculateInterventionEffect, type InterventionWindow } from "../../lib/analysis-signal";

type BatchRow = {
  batch_id: string;
  generated_at: string;
};

type SummaryRow = {
  learner_count: number;
  attempt_count: number;
  answer_count: number;
  correct_count: number;
};

type InsightRow = {
  subject_code: "BIZ" | "CONTRACT" | "THEORY";
  domain: string;
  concept: string;
  learner_count: number;
  answer_count: number;
  wrong_count: number;
  wrong_learner_count: number;
};

type ChoiceSignalRow = {
  subject_code: "BIZ" | "CONTRACT" | "THEORY";
  domain: string;
  concept: string;
  question_id: string;
  question_no: number;
  selected_choice: string;
  choice_count: number;
  choice_learner_count: number;
  confusion_code: string | null;
  confusion_label: string | null;
  confusion_source: string | null;
};

type InterventionRow = {
  id: string;
  synthetic_batch_id: string | null;
  subject_code: "BIZ" | "CONTRACT" | "THEORY";
  domain: string;
  concept: string;
  question_id: string | null;
  wrong_choice: string | null;
  confusion_code: string | null;
  action_type: "explanation" | "drill" | "recall";
  action_label: string;
  evidence_material: string | null;
  evidence_page: number | null;
  baseline_answer_count: number;
  baseline_correct_count: number;
  baseline_affected_learners: number;
  baseline_target_choice_count: number;
  baseline_total_learners: number;
  status: string;
  applied_at: string;
};

type InterventionWindowRow = {
  answer_count: number;
  correct_count: number;
  affected_learners: number;
  target_choice_count: number;
};

type PracticeQuestionIndex = {
  questions: Array<{
    id: string;
    choices: Record<string, string>;
  }>;
};

type ChoiceDiagnosisIndex = {
  questions: Record<string, {
    choices: Record<string, {
      diagnosis: string;
    }>;
  }>;
};

const subjectNames = {
  BIZ: "보험업법",
  CONTRACT: "보험계약법",
  THEORY: "손해사정이론",
};

const practiceQuestions = new Map(
  (practiceQuestionData as PracticeQuestionIndex).questions.map((question) => [question.id, question]),
);
const choiceDiagnosisIndex = choiceDiagnosticsData as ChoiceDiagnosisIndex;

function recommendation(wrongRate: number, wrongLearners: number) {
  if (wrongRate >= 65) {
    return {
      actionType: "explanation" as const,
      action: "다음 강의 첫 5분에 비교 설명 보강",
      reason: `${wrongLearners}명이 같은 내용에서 오답`,
      validation: "보강 전후 동일 키워드 정답률과 선택지 분포 비교",
    };
  }
  if (wrongRate >= 50) {
    return {
      actionType: "drill" as const,
      action: "강의 직후 함정선지 Drill 추가",
      reason: "정답 근거와 함정 선지를 함께 비교",
      validation: "Drill 전후 같은 함정선지 선택률 비교",
    };
  }
  return {
    actionType: "recall" as const,
    action: "다음 차시 시작 전 회상 퀴즈 연결",
    reason: "짧은 회상 문항으로 잔존 이해도를 확인",
    validation: "24시간 내 회상 퀴즈 정답률 확인",
  };
}

function interventionKey(subjectCode: string, domain: string, concept: string) {
  return `${subjectCode}:${domain}:${concept}`;
}

function toWindow(row: InterventionWindowRow | null, totalLearners: number): InterventionWindow {
  return {
    answerCount: Number(row?.answer_count ?? 0),
    correctCount: Number(row?.correct_count ?? 0),
    affectedLearners: Number(row?.affected_learners ?? 0),
    targetChoiceCount: Number(row?.target_choice_count ?? 0),
    totalLearners,
  };
}

export async function GET(request: Request) {
  const db = getLearnerDatabase();
  if (!db) return Response.json({ available: false, error: "강의 인사이트 데이터베이스가 준비되지 않았습니다." }, { status: 503 });

  const subject = new URL(request.url).searchParams.get("subject");
  const subjectFilter = subject && subject !== "ALL" ? subject : null;
  const filterSql = subjectFilter ? " AND a.subject_code = ?" : "";
  const batch = await db.prepare(
    `SELECT synthetic_batch_id AS batch_id, MAX(created_at) AS generated_at
     FROM learners
     WHERE data_origin = 'synthetic' AND synthetic_batch_id IS NOT NULL
     GROUP BY synthetic_batch_id
     ORDER BY generated_at DESC
     LIMIT 1`,
  ).first<BatchRow>();

  if (!batch) {
    return Response.json({ available: true, dataset: null, realData: { learnerCount: 0, attemptCount: 0 }, insights: [] });
  }

  const summaryStatement = db.prepare(
    `SELECT COUNT(DISTINCT l.id) AS learner_count,
            COUNT(DISTINCT a.id) AS attempt_count,
            COUNT(ans.id) AS answer_count,
            COALESCE(SUM(ans.correct), 0) AS correct_count
     FROM learners l
     LEFT JOIN exam_attempts a ON a.learner_id = l.id
     LEFT JOIN exam_answers ans ON ans.attempt_id = a.id
     WHERE l.data_origin = 'synthetic' AND l.synthetic_batch_id = ?${filterSql}`,
  );
  const summary = subjectFilter
    ? await summaryStatement.bind(batch.batch_id, subjectFilter).first<SummaryRow>()
    : await summaryStatement.bind(batch.batch_id).first<SummaryRow>();
  const realData = await db.prepare(
    `SELECT COUNT(DISTINCT l.id) AS learner_count, COUNT(DISTINCT a.id) AS attempt_count
     FROM learners l
     LEFT JOIN exam_attempts a ON a.learner_id = l.id
     WHERE l.data_origin = 'real'`,
  ).first<Pick<SummaryRow, "learner_count" | "attempt_count">>();

  const statement = db.prepare(
    `SELECT a.subject_code, ans.domain, ans.concept,
            COUNT(DISTINCT l.id) AS learner_count,
            COUNT(ans.id) AS answer_count,
            SUM(CASE WHEN ans.correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
            COUNT(DISTINCT CASE WHEN ans.correct = 0 THEN l.id END) AS wrong_learner_count
     FROM learners l
     JOIN exam_attempts a ON a.learner_id = l.id
     JOIN exam_answers ans ON ans.attempt_id = a.id
     WHERE l.data_origin = 'synthetic' AND l.synthetic_batch_id = ?${filterSql}
     GROUP BY a.subject_code, ans.domain, ans.concept`,
  );
  const result = subjectFilter
    ? await statement.bind(batch.batch_id, subjectFilter).all<InsightRow>()
    : await statement.bind(batch.batch_id).all<InsightRow>();
  const choiceStatement = db.prepare(
    `SELECT a.subject_code, ans.domain, ans.concept, ans.question_id, ans.question_no, ans.selected_choice,
            COUNT(ans.id) AS choice_count,
            COUNT(DISTINCT l.id) AS choice_learner_count,
            MAX(sig.confusion_code) AS confusion_code,
            MAX(sig.confusion_label) AS confusion_label,
            MAX(sig.confusion_source) AS confusion_source
     FROM learners l
     JOIN exam_attempts a ON a.learner_id = l.id
     JOIN exam_answers ans ON ans.attempt_id = a.id
     LEFT JOIN analysis_signals sig ON sig.answer_id = ans.id
     WHERE l.data_origin = 'synthetic' AND l.synthetic_batch_id = ?${filterSql}
       AND ans.correct = 0 AND ans.selected_choice IS NOT NULL
     GROUP BY a.subject_code, ans.domain, ans.concept, ans.question_id, ans.question_no, ans.selected_choice
     ORDER BY choice_count DESC, choice_learner_count DESC, ans.question_id, ans.selected_choice`,
  );
  const choiceResult = subjectFilter
    ? await choiceStatement.bind(batch.batch_id, subjectFilter).all<ChoiceSignalRow>()
    : await choiceStatement.bind(batch.batch_id).all<ChoiceSignalRow>();
  const dominantChoiceByConcept = new Map<string, ChoiceSignalRow>();
  for (const row of choiceResult.results) {
    const key = `${row.subject_code}:${row.domain}:${row.concept}`;
    if (!dominantChoiceByConcept.has(key)) dominantChoiceByConcept.set(key, row);
  }
  const datasetLearners = Number(summary?.learner_count ?? 0);

  const interventionStatement = db.prepare(
    `SELECT id, synthetic_batch_id, subject_code, domain, concept, question_id, wrong_choice, confusion_code,
            action_type, action_label, evidence_material, evidence_page, baseline_answer_count,
            baseline_correct_count, baseline_affected_learners, baseline_target_choice_count,
            baseline_total_learners, status, applied_at
     FROM lecture_interventions
     WHERE synthetic_batch_id = ?${subjectFilter ? " AND subject_code = ?" : ""}
       AND status IN ('applied', 'measured')
     ORDER BY applied_at DESC`,
  );
  const interventionResult = subjectFilter
    ? await interventionStatement.bind(batch.batch_id, subjectFilter).all<InterventionRow>()
    : await interventionStatement.bind(batch.batch_id).all<InterventionRow>();
  const latestInterventions = new Map<string, InterventionRow>();
  for (const row of interventionResult.results) {
    const key = interventionKey(row.subject_code, row.domain, row.concept);
    if (!latestInterventions.has(key)) latestInterventions.set(key, row);
  }
  const interventionStates = new Map<string, {
    row: InterventionRow;
    post: InterventionWindow;
    effect: ReturnType<typeof calculateInterventionEffect>;
  }>();
  await Promise.all([...latestInterventions.entries()].map(async ([key, row]) => {
    const post = await db.prepare(
      `SELECT COUNT(ans.id) AS answer_count,
              COALESCE(SUM(ans.correct), 0) AS correct_count,
              COUNT(DISTINCT CASE WHEN ans.correct = 0 THEN l.id END) AS affected_learners,
              COALESCE(SUM(CASE WHEN ans.selected_choice = ? THEN 1 ELSE 0 END), 0) AS target_choice_count
       FROM learners l
       JOIN exam_attempts a ON a.learner_id = l.id
       JOIN exam_answers ans ON ans.attempt_id = a.id
       WHERE l.data_origin = 'synthetic' AND l.synthetic_batch_id = ?
         AND a.subject_code = ? AND ans.domain = ? AND ans.concept = ? AND ans.answered_at > ?`,
    ).bind(row.wrong_choice, batch.batch_id, row.subject_code, row.domain, row.concept, row.applied_at)
      .first<InterventionWindowRow>();
    const baseline: InterventionWindow = {
      answerCount: Number(row.baseline_answer_count),
      correctCount: Number(row.baseline_correct_count),
      affectedLearners: Number(row.baseline_affected_learners),
      targetChoiceCount: Number(row.baseline_target_choice_count),
      totalLearners: Number(row.baseline_total_learners),
    };
    const postWindow = toWindow(post, datasetLearners);
    interventionStates.set(key, {
      row,
      post: postWindow,
      effect: calculateInterventionEffect(baseline, postWindow),
    });
  }));

  const insights = result.results.map((row) => {
    const learnerCount = Number(row.learner_count);
    const wrongLearners = Number(row.wrong_learner_count);
    const answerCount = Number(row.answer_count);
    const wrongCount = Number(row.wrong_count);
    const wrongRate = answerCount ? Math.round((wrongCount / answerCount) * 100) : 0;
    const affectedRate = datasetLearners ? Math.round((wrongLearners / datasetLearners) * 100) : 0;
    const baselineDemandScore = Math.min(100, Math.round(wrongRate * 0.8 + affectedRate * 0.2));
    const guidance = recommendation(wrongRate, wrongLearners);
    const dominantChoice = dominantChoiceByConcept.get(`${row.subject_code}:${row.domain}:${row.concept}`) ?? null;
    const mappedDiagnosis = dominantChoice
      ? choiceDiagnosisIndex.questions[dominantChoice.question_id]?.choices[dominantChoice.selected_choice] ?? null
      : null;
    const confusionCode = dominantChoice?.confusion_code
      ?? (dominantChoice && mappedDiagnosis ? `confusion:${dominantChoice.question_id}:${dominantChoice.selected_choice}` : null);
    const confusionLabel = dominantChoice?.confusion_label ?? mappedDiagnosis?.diagnosis ?? null;
    const confusionSource = dominantChoice?.confusion_source === "curated-choice-map"
      ? "공통 분석 신호 · 수동 검수 선택지 혼동맵"
      : dominantChoice?.confusion_source === "question-metadata-fallback"
        ? "공통 분석 신호 · 문항 메타데이터 보조 분류"
        : mappedDiagnosis
          ? "수동 검수 선택지 혼동맵"
          : "선택지별 혼동맵 연결 대기";
    const interventionState = interventionStates.get(interventionKey(row.subject_code, row.domain, row.concept)) ?? null;
    const demandScore = interventionState?.effect.updatedDemandScore ?? baselineDemandScore;
    return {
      id: `${row.subject_code}:${row.domain}:${row.concept}`,
      subjectCode: row.subject_code,
      subject: subjectNames[row.subject_code],
      domain: row.domain,
      concept: row.concept,
      learnerCount,
      wrongLearners,
      answerCount,
      wrongCount,
      accuracy: 100 - wrongRate,
      wrongRate,
      demandScore,
      baselineDemandScore,
      recommendation: guidance.action,
      reason: guidance.reason,
      validation: guidance.validation,
      dominantWrongQuestionId: dominantChoice?.question_id ?? null,
      dominantWrongQuestionNo: dominantChoice ? Number(dominantChoice.question_no) : null,
      dominantWrongChoice: dominantChoice?.selected_choice ?? null,
      dominantWrongChoiceText: dominantChoice
        ? practiceQuestions.get(dominantChoice.question_id)?.choices[dominantChoice.selected_choice] ?? null
        : null,
      dominantWrongChoiceCount: Number(dominantChoice?.choice_count ?? 0),
      dominantWrongLearners: Number(dominantChoice?.choice_learner_count ?? 0),
      confusionCode,
      confusionLabel,
      confusionSource,
      intervention: interventionState ? {
        id: interventionState.row.id,
        status: interventionState.effect.measurementReady ? "measured" : interventionState.row.status,
        actionType: interventionState.row.action_type,
        actionLabel: interventionState.row.action_label,
        appliedAt: interventionState.row.applied_at,
        evidence: interventionState.row.evidence_material
          ? { material: interventionState.row.evidence_material, page: interventionState.row.evidence_page }
          : null,
        baseline: {
          answerCount: Number(interventionState.row.baseline_answer_count),
          accuracy: interventionState.effect.baselineAccuracy,
          targetChoiceRate: interventionState.effect.baselineTargetChoiceRate,
          affectedLearners: Number(interventionState.row.baseline_affected_learners),
        },
        post: {
          answerCount: interventionState.post.answerCount,
          accuracy: interventionState.effect.postAccuracy,
          targetChoiceRate: interventionState.effect.postTargetChoiceRate,
          affectedLearners: interventionState.post.affectedLearners,
        },
        effect: interventionState.effect,
      } : null,
    };
  }).sort((left, right) => right.demandScore - left.demandScore || right.wrongLearners - left.wrongLearners);

  const answerCount = Number(summary?.answer_count ?? 0);
  const correctCount = Number(summary?.correct_count ?? 0);
  return Response.json({
    available: true,
    dataset: {
      origin: "synthetic",
      label: "시연용 합성 데이터",
      batchId: batch.batch_id,
      generatedAt: batch.generated_at,
      learnerCount: datasetLearners,
      attemptCount: Number(summary?.attempt_count ?? 0),
      answerCount,
      averageAccuracy: answerCount ? Math.round((correctCount / answerCount) * 1000) / 10 : 0,
    },
    realData: {
      learnerCount: Number(realData?.learner_count ?? 0),
      attemptCount: Number(realData?.attempt_count ?? 0),
    },
    insights,
    scoring: "보강 전 기초식 = 오답률 80% + 영향 학습자 비율 20%. 보강 후 5건 이상이면 잔존 오답률 60% + 영향 학습자 비율 20% + 목표 오답선지 잔존율 20%로 다시 계산",
  });
}

export async function POST(request: Request) {
  const db = getLearnerDatabase();
  if (!db) return Response.json({ available: false, error: "강의 인사이트 데이터베이스가 준비되지 않았습니다." }, { status: 503 });
  try {
    const input = await request.json() as {
      subjectCode?: "BIZ" | "CONTRACT" | "THEORY";
      domain?: string;
      concept?: string;
      questionId?: string | null;
      wrongChoice?: string | null;
      confusionCode?: string | null;
      evidenceMaterial?: string | null;
      evidencePage?: number | null;
    };
    if (!input.subjectCode || !["BIZ", "CONTRACT", "THEORY"].includes(input.subjectCode)
      || !input.domain?.trim() || !input.concept?.trim()) {
      return Response.json({ error: "보강할 과목과 개념을 확인해 주세요." }, { status: 400 });
    }

    const batch = await db.prepare(
      `SELECT synthetic_batch_id AS batch_id, MAX(created_at) AS generated_at
       FROM learners
       WHERE data_origin = 'synthetic' AND synthetic_batch_id IS NOT NULL
       GROUP BY synthetic_batch_id ORDER BY generated_at DESC LIMIT 1`,
    ).first<BatchRow>();
    if (!batch) return Response.json({ error: "보강 기준이 될 합성 데이터가 없습니다." }, { status: 409 });

    const existing = await db.prepare(
      `SELECT id FROM lecture_interventions
       WHERE synthetic_batch_id = ? AND subject_code = ? AND domain = ? AND concept = ?
         AND status IN ('applied', 'measured') ORDER BY applied_at DESC LIMIT 1`,
    ).bind(batch.batch_id, input.subjectCode, input.domain.trim(), input.concept.trim()).first<{ id: string }>();
    if (existing) return Response.json({ saved: true, duplicate: true, interventionId: existing.id });

    const baseline = await db.prepare(
      `SELECT COUNT(ans.id) AS answer_count,
              COALESCE(SUM(ans.correct), 0) AS correct_count,
              COUNT(DISTINCT CASE WHEN ans.correct = 0 THEN l.id END) AS affected_learners,
              COALESCE(SUM(CASE WHEN ans.selected_choice = ? THEN 1 ELSE 0 END), 0) AS target_choice_count
       FROM learners l
       JOIN exam_attempts a ON a.learner_id = l.id
       JOIN exam_answers ans ON ans.attempt_id = a.id
       WHERE l.data_origin = 'synthetic' AND l.synthetic_batch_id = ?
         AND a.subject_code = ? AND ans.domain = ? AND ans.concept = ?`,
    ).bind(input.wrongChoice, batch.batch_id, input.subjectCode, input.domain.trim(), input.concept.trim())
      .first<InterventionWindowRow>();
    const totalLearners = await db.prepare(
      `SELECT COUNT(*) AS learner_count FROM learners
       WHERE data_origin = 'synthetic' AND synthetic_batch_id = ?`,
    ).bind(batch.batch_id).first<{ learner_count: number }>();
    const answerCount = Number(baseline?.answer_count ?? 0);
    const correctCount = Number(baseline?.correct_count ?? 0);
    const wrongRate = answerCount ? Math.round(((answerCount - correctCount) / answerCount) * 100) : 0;
    const affectedLearners = Number(baseline?.affected_learners ?? 0);
    const guidance = recommendation(wrongRate, affectedLearners);
    const now = new Date().toISOString();
    const interventionId = crypto.randomUUID();

    await db.prepare(
      `INSERT INTO lecture_interventions
       (id, synthetic_batch_id, subject_code, domain, concept, question_id, wrong_choice, confusion_code,
        action_type, action_label, evidence_material, evidence_page, baseline_answer_count,
        baseline_correct_count, baseline_affected_learners, baseline_target_choice_count,
        baseline_total_learners, status, applied_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?)`,
    ).bind(
      interventionId,
      batch.batch_id,
      input.subjectCode,
      input.domain.trim(),
      input.concept.trim(),
      input.questionId ?? null,
      input.wrongChoice ?? null,
      input.confusionCode ?? null,
      guidance.actionType,
      guidance.action,
      input.evidenceMaterial?.trim() || null,
      Number.isInteger(input.evidencePage) ? input.evidencePage : null,
      answerCount,
      correctCount,
      affectedLearners,
      Number(baseline?.target_choice_count ?? 0),
      Number(totalLearners?.learner_count ?? 0),
      now,
      now,
    ).run();

    return Response.json({ saved: true, duplicate: false, interventionId, appliedAt: now }, { status: 201 });
  } catch {
    return Response.json({ error: "강의 보강 조치를 저장하지 못했습니다." }, { status: 400 });
  }
}
