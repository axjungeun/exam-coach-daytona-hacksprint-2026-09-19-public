import choiceDiagnosticsData from "../data/choice-diagnostics.json";
import evidenceData from "../data/lecture-evidence-index.json";

export type SignalQuestion = {
  id: string;
  subject: string;
  subjectCode?: string;
  domain: string;
  concept: string;
  keywords: string[];
  numericType?: string;
};

export type CuratedChoiceDiagnostic = {
  diagnosis: string;
  whyWrong: string;
  misconception: string;
  selectedInterpretation: string;
  focusTerms: string[];
  reasoningSteps: string[];
  calculationStage?: string;
};

export type ChoiceQuestionDiagnostic = {
  axis: string;
  correctPrinciple: string;
  choices: Record<string, CuratedChoiceDiagnostic>;
};

export type SignalEvidence = {
  material: string;
  lectureName: string;
  sourceFile: string;
  sourceType: string;
  page: number;
  score: number;
  confidence: string;
  matchedTerms: string[];
  snippet: string;
};

export type AnalysisSignal = {
  signalCode: string;
  questionId: string;
  subjectCode: string;
  domain: string;
  concept: string;
  selectedChoice: string;
  correct: boolean;
  confusionCode: string | null;
  confusionLabel: string | null;
  confusionSource: "curated-choice-map" | "question-metadata-fallback" | "correct-answer";
  evidence: SignalEvidence | null;
  learnerAction: string;
  instructorActionType: "explanation" | "drill" | "recall";
  instructorAction: string;
  reviewDueAt: string | null;
  choiceQuestion: ChoiceQuestionDiagnostic | null;
  curatedChoice: CuratedChoiceDiagnostic | null;
};

type ChoiceDiagnosticIndex = {
  questions: Record<string, ChoiceQuestionDiagnostic>;
};

type EvidenceIndex = {
  matches: Record<string, SignalEvidence[]>;
};

export type InterventionWindow = {
  answerCount: number;
  correctCount: number;
  affectedLearners: number;
  targetChoiceCount: number;
  totalLearners: number;
};

export type InterventionEffect = {
  baselineAccuracy: number;
  postAccuracy: number | null;
  accuracyChange: number | null;
  baselineTargetChoiceRate: number;
  postTargetChoiceRate: number | null;
  targetChoiceRateChange: number | null;
  residualConfusionRate: number | null;
  updatedDemandScore: number | null;
  measurementReady: boolean;
};

const actionLabels = {
  explanation: "정답·오답 조건 비교 설명 보강",
  drill: "같은 오류 단계의 유사선지 Drill 추가",
  recall: "다음 차시 시작 전 회상 퀴즈 연결",
} as const;

function subjectCodeFor(question: SignalQuestion) {
  if (question.subjectCode) return question.subjectCode;
  const inferred = question.id.split("-").find((part) => ["BIZ", "CONTRACT", "THEORY"].includes(part));
  return inferred ?? question.subject;
}

function actionTypeFor(question: SignalQuestion, curated: CuratedChoiceDiagnostic | null) {
  if (question.numericType && question.numericType !== "없음") return "drill" as const;
  if (curated && /(혼동|구분|적용|주체|범위)/.test(`${curated.diagnosis} ${curated.misconception}`)) {
    return "explanation" as const;
  }
  return "recall" as const;
}

function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export function resolveAnalysisSignal(input: {
  question: SignalQuestion;
  selectedChoice: string;
  correct: boolean;
  answeredAt: string;
}): AnalysisSignal {
  const choiceQuestion = (choiceDiagnosticsData as ChoiceDiagnosticIndex).questions[input.question.id] ?? null;
  const curatedChoice = input.correct ? null : choiceQuestion?.choices[input.selectedChoice] ?? null;
  const evidence = ((evidenceData as EvidenceIndex).matches[input.question.id] ?? [])[0] ?? null;
  const actionType = actionTypeFor(input.question, curatedChoice);
  const reviewDueAt = input.correct
    ? null
    : new Date(Date.parse(input.answeredAt) + 24 * 60 * 60 * 1000).toISOString();
  const fallbackLabel = `${input.question.concept} · ${input.selectedChoice} 선택지 검수 대기`;

  return {
    signalCode: `choice:${input.question.id}:${input.selectedChoice}`,
    questionId: input.question.id,
    subjectCode: subjectCodeFor(input.question),
    domain: input.question.domain,
    concept: input.question.concept,
    selectedChoice: input.selectedChoice,
    correct: input.correct,
    confusionCode: input.correct ? null : `confusion:${input.question.id}:${input.selectedChoice}`,
    confusionLabel: input.correct ? null : curatedChoice?.diagnosis ?? fallbackLabel,
    confusionSource: input.correct
      ? "correct-answer"
      : curatedChoice
        ? "curated-choice-map"
        : "question-metadata-fallback",
    evidence,
    learnerAction: input.correct
      ? "같은 개념의 변형 문항으로 정답 유지를 확인"
      : evidence
        ? `${evidence.material} p.${evidence.page}의 근거를 회상한 뒤 예약된 문항 재풀이`
        : `${input.question.concept} 근거 연결 후 예약된 문항 재풀이`,
    instructorActionType: actionType,
    instructorAction: actionLabels[actionType],
    reviewDueAt,
    choiceQuestion,
    curatedChoice,
  };
}

export function calculateInterventionEffect(
  baseline: InterventionWindow,
  post: InterventionWindow,
  minimumPostAnswers = 5,
): InterventionEffect {
  const baselineAccuracy = percent(baseline.correctCount, baseline.answerCount);
  const baselineTargetChoiceRate = percent(baseline.targetChoiceCount, baseline.answerCount);
  if (post.answerCount < minimumPostAnswers) {
    return {
      baselineAccuracy,
      postAccuracy: null,
      accuracyChange: null,
      baselineTargetChoiceRate,
      postTargetChoiceRate: null,
      targetChoiceRateChange: null,
      residualConfusionRate: null,
      updatedDemandScore: null,
      measurementReady: false,
    };
  }

  const postAccuracy = percent(post.correctCount, post.answerCount);
  const postTargetChoiceRate = percent(post.targetChoiceCount, post.answerCount);
  const postWrongRate = 100 - postAccuracy;
  const postAffectedRate = percent(post.affectedLearners, post.totalLearners);
  const residualConfusionRate = baselineTargetChoiceRate > 0
    ? Math.min(100, Math.round((postTargetChoiceRate / baselineTargetChoiceRate) * 1000) / 10)
    : postTargetChoiceRate > 0 ? 100 : 0;

  return {
    baselineAccuracy,
    postAccuracy,
    accuracyChange: Math.round((postAccuracy - baselineAccuracy) * 10) / 10,
    baselineTargetChoiceRate,
    postTargetChoiceRate,
    targetChoiceRateChange: Math.round((postTargetChoiceRate - baselineTargetChoiceRate) * 10) / 10,
    residualConfusionRate,
    updatedDemandScore: Math.min(100, Math.round(
      postWrongRate * 0.6 + postAffectedRate * 0.2 + residualConfusionRate * 0.2,
    )),
    measurementReady: true,
  };
}
