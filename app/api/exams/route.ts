import examData from "../../data/exam-questions-40-49.json";
import { persistExamAttempt } from "../../lib/attempt-store";
import { buildKeywordInsights } from "../../lib/keyword-taxonomy";
import { authenticateLearner, getLearnerDatabase } from "../../lib/learner-auth";

type SubjectCode = "BIZ" | "CONTRACT" | "THEORY";

type ExamQuestion = {
  id: string;
  round: number;
  subject: string;
  subjectCode: SubjectCode;
  questionNo: number;
  questionText: string;
  choices: Record<string, string>;
  answer: string;
  acceptedAnswers: string[];
  domain: string;
  concept: string;
  keywords: string[];
  trapType: string;
  numericType: string;
  questionForm: string;
  sourceFile: string;
  classificationSource: string;
};

const questions = examData.questions as ExamQuestion[];
const subjectCodes = new Set<SubjectCode>(["BIZ", "CONTRACT", "THEORY"]);

function toPublicQuestion(question: ExamQuestion) {
  const publicQuestion: Partial<ExamQuestion> = { ...question };
  delete publicQuestion.answer;
  delete publicQuestion.acceptedAnswers;
  return publicQuestion;
}

function countBy(items: ExamQuestion[], value: (question: ExamQuestion) => string) {
  return items.reduce<Record<string, number>>((counts, question) => {
    const key = value(question);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeRound(round: number, items: ExamQuestion[]) {
  const directCalculationCount = items.filter((question) =>
    ["직접계산형", "공식선택형", "금액사례형"].includes(question.numericType),
  ).length;
  return {
    round,
    total: items.length,
    caseCount: items.filter((question) => question.questionForm === "사례적용형").length,
    numericCount: items.filter((question) => question.numericType !== "없음").length,
    directCalculationCount,
    combinationCount: items.filter((question) => question.questionForm === "조합·개수형").length,
    negativeCount: items.filter((question) => question.questionForm === "부정형 선지판단").length,
    averageStemLength: Math.round(items.reduce((sum, question) => sum + question.questionText.length, 0) / Math.max(1, items.length)),
    answerDistribution: countBy(items, (question) => question.acceptedAnswers.join("·")),
    numericTypes: countBy(items.filter((question) => question.numericType !== "없음"), (question) => question.numericType),
    questionForms: countBy(items, (question) => question.questionForm),
    classificationSources: countBy(items, (question) => question.classificationSource),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "questions";
  const subjectParam = url.searchParams.get("subject") as SubjectCode | null;

  if (subjectParam && !subjectCodes.has(subjectParam)) {
    return Response.json({ error: "과목 코드를 확인해 주세요." }, { status: 400 });
  }

  if (mode === "analytics") {
    const scoped = subjectParam ? questions.filter((question) => question.subjectCode === subjectParam) : questions;
    const rounds = Array.from({ length: 10 }, (_, index) => index + 40);
    return Response.json({
      scope: subjectParam ?? "ALL",
      total: scoped.length,
      rounds: rounds.map((round) => summarizeRound(round, scoped.filter((question) => question.round === round))),
      keywordInsights: buildKeywordInsights(scoped),
      source: "SYNTHETIC DEMO: 합성 세트 40~49와 데모 기준 답안",
      method: "문항·내부 보기·선택지·기존 개념 태그를 과목별 내용 분류표로 분석. 40~47회 기준선과 48~49회 최근 구간을 비교",
    });
  }

  if (mode === "review") {
    const id = url.searchParams.get("id")?.trim();
    const selected = id ? questions.find((question) => question.id === id) : null;
    if (!selected) {
      return Response.json({ error: "저장된 복습 문항을 찾지 못했습니다." }, { status: 404 });
    }
    return Response.json({
      question: selected,
      source: "저장된 풀이 기록에 연결된 합성 데모 문항",
    });
  }

  const round = Number(url.searchParams.get("round"));
  if (!Number.isInteger(round) || round < 40 || round > 49 || !subjectParam) {
    return Response.json({ error: "40~49회와 과목을 선택해 주세요." }, { status: 400 });
  }

  const selected = questions
    .filter((question) => question.round === round && question.subjectCode === subjectParam)
    .sort((a, b) => a.questionNo - b.questionNo);

  return Response.json({
    round,
    subject: subjectParam,
    count: selected.length,
    questions: selected.map(toPublicQuestion),
    source: "SYNTHETIC DEMO: 합성 문항과 데모 기준 답안",
  });
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as {
      round?: number;
      subject?: SubjectCode;
      answers?: Record<string, string>;
      startedAt?: string;
      clientSubmissionId?: string;
    };
    if (!input.round || input.round < 40 || input.round > 49 || !input.subject || !subjectCodes.has(input.subject) || !input.answers) {
      return Response.json({ error: "채점할 회차, 과목, 답안을 확인해 주세요." }, { status: 400 });
    }
    const selected = questions
      .filter((question) => question.round === input.round && question.subjectCode === input.subject)
      .sort((a, b) => a.questionNo - b.questionNo);
    const complete = selected.length === 40 && selected.every((question) => ["①", "②", "③", "④"].includes(input.answers?.[question.id]));
    if (!complete) {
      return Response.json({ error: "40문항에 모두 답해야 채점할 수 있습니다." }, { status: 400 });
    }
    const results = Object.fromEntries(selected.map((question) => {
      const selectedChoice = input.answers?.[question.id] ?? "";
      return [question.id, {
        correct: question.acceptedAnswers.includes(selectedChoice),
        acceptedAnswers: question.acceptedAnswers,
      }];
    }));
    const score = Object.values(results).filter((result) => result.correct).length;
    const submittedAt = new Date().toISOString();
    const db = getLearnerDatabase();
    const learner = db ? await authenticateLearner(request, db) : null;
    let persistence: {
      saved: boolean;
      attemptId?: string;
      attemptNo?: number;
      reviewTasksScheduled?: number;
      reason?: string;
    } = { saved: false, reason: learner ? "database-error" : "guest" };

    if (db && learner) {
      try {
        const saved = await persistExamAttempt(db, {
          learnerId: learner.id,
          clientSubmissionId: input.clientSubmissionId?.trim() || crypto.randomUUID(),
          round: input.round,
          subjectCode: input.subject,
          score,
          total: 40,
          startedAt: input.startedAt ?? null,
          submittedAt,
          questions: selected,
          answers: input.answers,
          results,
        });
        persistence = {
          saved: true,
          attemptId: saved.attemptId,
          attemptNo: saved.attemptNo,
          reviewTasksScheduled: saved.reviewTasksScheduled ?? 0,
        };
      } catch {
        persistence = { saved: false, reason: "database-error" };
      }
    }

    return Response.json({
      round: input.round,
      subject: input.subject,
      score,
      total: 40,
      submittedAt,
      results,
      persistence,
      source: "SYNTHETIC DEMO: 데모 기준 답안",
    });
  } catch {
    return Response.json({ error: "채점 요청 형식을 읽지 못했습니다." }, { status: 400 });
  }
}
