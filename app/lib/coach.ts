import {
  resolveAnalysisSignal,
  type CuratedChoiceDiagnostic,
  type SignalEvidence,
} from "./analysis-signal";

export type CoachQuestion = {
  id: string;
  subject: string;
  questionNo: number;
  questionText: string;
  choices: Record<string, string>;
  answer: string;
  domain: string;
  concept: string;
  keywords: string[];
  trapType: string;
  numericType: string;
  questionForm: string;
  sourceFile: string;
};

export type LearningHistoryItem = {
  questionId: string;
  concept: string;
  correct: boolean;
  answeredAt: string | null;
  source?: "legacy-xlsx" | "app";
};

export type CoachRequest = {
  question: CoachQuestion;
  selectedChoice: string;
  priorAttempts?: Array<number | string | null>;
  history?: LearningHistoryItem[];
};

export type EvidenceMatch = SignalEvidence;

export type PriorityComponent = {
  label: string;
  score: number;
  reason: string;
};

export type AgentTrace = {
  step: string;
  provider: string;
  status: "complete" | "fallback" | "waiting";
  detail: string;
};

export type ChoiceAnalysis = {
  axis: string;
  selectedInterpretation: string;
  correctPrinciple: string;
  focusTerms: string[];
  reasoningSteps: string[];
  calculationStage?: string;
  source: "선택지별 개념 지도" | "문항 공통 진단";
};

export type CoachRun = {
  runId: string;
  generatedAt: string;
  correct: boolean;
  selectedChoice: string;
  correctChoice: string;
  diagnosis: string;
  whyWrong: string;
  misconception: string;
  nextAction: string;
  choiceAnalysis: ChoiceAnalysis | null;
  priority: {
    score: number;
    level: "낮음" | "보통" | "높음" | "긴급";
    components: PriorityComponent[];
  };
  evidence: EvidenceMatch | null;
  recommendation: {
    stage: "Essential" | "Drill" | "the Final";
    title: string;
    reason: string;
  };
  analysisSignal: {
    signalCode: string;
    confusionCode: string | null;
    confusionSource: string;
    learnerAction: string;
    instructorAction: string;
    reviewDueAt: string | null;
  };
  intervention?: {
    id: string;
    actionLabel: string;
    appliedAt: string;
    evidenceMaterial: string | null;
    evidencePage: number | null;
  } | null;
  provider: {
    name: "Qwen Cloud" | "로컬 근거 엔진";
    mode: "live" | "demo-safe";
    model?: string;
  };
  trace: AgentTrace[];
};

const answerNumbers: Record<string, number> = { "①": 1, "②": 2, "③": 3, "④": 4 };

function priorityLevel(score: number): CoachRun["priority"]["level"] {
  if (score >= 85) return "긴급";
  if (score >= 65) return "높음";
  if (score >= 40) return "보통";
  return "낮음";
}

function calculatePriority(input: CoachRequest): CoachRun["priority"] {
  const isCorrect = input.selectedChoice === input.question.answer;
  const prior = (input.priorAttempts ?? []).filter((value): value is number | string => value !== null);
  const correctNumber = answerNumbers[input.question.answer];
  const priorResults = prior.map((value) => Number(value) === correctNumber);
  const hasMixedResults = priorResults.some(Boolean) && priorResults.some((value) => !value);
  const relatedWrongCount = (input.history ?? []).filter(
    (item) => item.concept === input.question.concept && !item.correct,
  ).length;
  const complexForm = /사례|조합|개수|계산/.test(input.question.questionForm);
  const hasNumericWork = input.question.numericType !== "없음";

  const components: PriorityComponent[] = [
    {
      label: "현재 정오",
      score: isCorrect ? 8 : 36,
      reason: isCorrect ? "이번 답안은 정답" : "이번 답안이 오답",
    },
    {
      label: "반복 혼동",
      score: Math.min(24, relatedWrongCount * 12),
      reason: relatedWrongCount ? `같은 개념 오답 ${relatedWrongCount}회` : "같은 개념의 누적 오답 없음",
    },
    {
      label: "회독 변동",
      score: hasMixedResults ? 18 : 0,
      reason: hasMixedResults ? "회독 사이 정오가 바뀜" : "회독 결과 변동 없음",
    },
    {
      label: "문항 복잡도",
      score: hasNumericWork ? 16 : complexForm ? 10 : 4,
      reason: hasNumericWork ? input.question.numericType : complexForm ? input.question.questionForm : "일반 선지판단형",
    },
    {
      label: "재검 시급성",
      score: isCorrect ? 3 : 10,
      reason: isCorrect ? "간격복습 후보" : "24시간 내 재풀이 필요",
    },
  ];
  const score = Math.min(100, components.reduce((sum, component) => sum + component.score, 0));
  return { score, level: priorityLevel(score), components };
}

function stageFor(input: CoachRequest): CoachRun["recommendation"]["stage"] {
  const isCorrect = input.selectedChoice === input.question.answer;
  const relatedWrongCount = (input.history ?? []).filter(
    (item) => item.concept === input.question.concept && !item.correct,
  ).length;
  if (!isCorrect || relatedWrongCount > 0) return "Essential";
  if ((input.priorAttempts ?? []).filter((value) => value !== null).length < 2) return "Drill";
  return "the Final";
}

export function buildLocalCoachRun(input: CoachRequest): CoachRun {
  const correct = input.selectedChoice === input.question.answer;
  const selectedText = input.question.choices[input.selectedChoice] ?? input.selectedChoice;
  const correctText = input.question.choices[input.question.answer] ?? input.question.answer;
  const signal = resolveAnalysisSignal({
    question: input.question,
    selectedChoice: input.selectedChoice,
    correct,
    answeredAt: new Date().toISOString(),
  });
  const evidence = signal.evidence;
  const stage = stageFor(input);
  const priority = calculatePriority(input);
  const evidenceTitle = evidence?.material ?? `${input.question.subject} 강사 자료`;
  const evidenceLocation = evidence ? `p.${evidence.page}` : "쪽수 확인 대기";
  const choiceQuestion = signal.choiceQuestion;
  const curatedChoice: CuratedChoiceDiagnostic | null = signal.curatedChoice;
  const choiceAnalysis: ChoiceAnalysis | null = correct
    ? null
    : curatedChoice
      ? {
          axis: choiceQuestion!.axis,
          selectedInterpretation: curatedChoice.selectedInterpretation,
          correctPrinciple: choiceQuestion!.correctPrinciple,
          focusTerms: curatedChoice.focusTerms,
          reasoningSteps: curatedChoice.reasoningSteps,
          calculationStage: curatedChoice.calculationStage,
          source: "선택지별 개념 지도",
        }
      : {
          axis: input.question.concept,
          selectedInterpretation: selectedText,
          correctPrinciple: correctText,
          focusTerms: input.question.keywords.slice(0, 3),
          reasoningSteps: ["선택한 답의 적용 조건 확인", "데모 기준 정답의 적용 조건과 비교", "차이가 생긴 개념을 강사 근거에서 재확인"],
          source: "문항 공통 진단",
        };

  return {
    runId: `run-${Date.now()}-${input.question.id}`,
    generatedAt: new Date().toISOString(),
    correct,
    selectedChoice: input.selectedChoice,
    correctChoice: input.question.answer,
    diagnosis: correct ? `${input.question.concept}을 정확히 구분했습니다.` : curatedChoice?.diagnosis ?? input.question.trapType,
    whyWrong: correct
      ? `선택한 ${input.selectedChoice}번이 데모 기준 정답과 일치합니다.`
      : curatedChoice?.whyWrong ?? `선택한 답 “${selectedText}”와 정답 “${correctText}”의 적용 조건을 구분해야 합니다.`,
    misconception: correct
      ? "현재 답안에서는 뚜렷한 개념 혼동이 발견되지 않았습니다."
      : curatedChoice?.misconception ?? `${input.question.concept}에서 ${input.question.keywords.slice(0, 3).join("·")}의 관계를 혼동했습니다.`,
    nextAction: correct
      ? `${stage}의 같은 개념 변형 1문항으로 정답 유지를 확인하세요.`
      : `${evidenceTitle} ${evidenceLocation}의 근거를 한 문장으로 회상한 뒤 24시간 안에 같은 함정 문항을 다시 푸세요.`,
    choiceAnalysis,
    priority,
    evidence,
    recommendation: {
      stage,
      title: evidence ? `${evidence.material} · p.${evidence.page}` : `${input.question.domain} · ${input.question.concept}`,
      reason: correct
        ? "개념을 확인했으므로 변형 문제로 유지 여부를 점검합니다."
        : "오답선지가 노린 개념을 강사 자료에서 먼저 복구한 뒤 문제풀이로 넘어갑니다.",
    },
    analysisSignal: {
      signalCode: signal.signalCode,
      confusionCode: signal.confusionCode,
      confusionSource: signal.confusionSource,
      learnerAction: signal.learnerAction,
      instructorAction: signal.instructorAction,
      reviewDueAt: signal.reviewDueAt,
    },
    intervention: null,
    provider: { name: "로컬 근거 엔진", mode: "demo-safe" },
    trace: [
      {
        step: "정답 검증",
        provider: "합성 데모 기준 답안",
        status: "complete",
        detail: `${input.question.sourceFile}의 정답 ${input.question.answer}와 제출 답안 ${input.selectedChoice} 비교`,
      },
      {
        step: "학습 근거 검색",
        provider: "강사 자료 페이지 색인",
        status: evidence ? "complete" : "waiting",
        detail: evidence
          ? `${evidence.material} p.${evidence.page}, 일치어 ${evidence.matchedTerms.join(" · ")}`
          : "연결 가능한 강사 자료 페이지를 찾지 못함",
      },
      {
        step: "오답 진단",
        provider: curatedChoice ? "선택지별 개념 지도" : "로컬 근거 엔진",
        status: curatedChoice ? "complete" : "fallback",
        detail: curatedChoice
          ? `${input.selectedChoice} 선택을 ${choiceQuestion!.axis} 기준으로 데모 기준 정답과 비교`
          : "선택지별 검수 데이터가 없어 문항 공통 진단으로 완료",
      },
      {
        step: "다음 학습 결정",
        provider: "Exam Coach 정책",
        status: "complete",
        detail: `${stage} 단계와 복습 우선도 ${priority.score} 결정`,
      },
    ],
  };
}
