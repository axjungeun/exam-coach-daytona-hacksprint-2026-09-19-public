import practiceData from "../app/data/public-practice-questions.json";
import vocabularyData from "../app/data/exam-vocabulary-standard.json";
import { persistExamAttempt } from "../app/lib/attempt-store";
import {
  authenticateLearner,
  loginLearner,
  logoutLearner,
  normalizeLearnerCode,
  registerLearner,
  validateNickname,
} from "../app/lib/learner-auth";

type SubjectCode = "BIZ" | "CONTRACT" | "THEORY";

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
};

type ExamQuestion = {
  id: string;
  setNo: number;
  subject: string;
  subjectCode: SubjectCode;
  questionNo: number;
  prompt: string;
  context?: { label: string; text: string } | null;
  dataTable?: { label: string; columns: string[]; rows: string[][] } | null;
  statements: Array<{ marker: string; text: string }>;
  choices: Record<string, string>;
  answer: string;
  acceptedAnswers: string[];
  domain: string;
  concept: string;
  keywords: string[];
  vocabularyLevel: "first_exam";
  rightsStatus: "independently_authored";
};

type VocabularyTerm = {
  canonical: string;
  aliases: string[];
};

const questions = practiceData.questions as ExamQuestion[];
const practiceMetadata = practiceData.metadata;
const subjectCodes = new Set<SubjectCode>(["BIZ", "CONTRACT", "THEORY"]);
const feedbackCategories = new Set(["content", "grading", "screen", "other"]);
const vocabularySubjects = vocabularyData.subjects as Record<SubjectCode, VocabularyTerm[]>;

function canonicalConcept(subjectCode: SubjectCode, value: string) {
  const normalized = value.trim();
  const match = vocabularySubjects[subjectCode].find(
    (term) => term.canonical === normalized || term.aliases.includes(normalized),
  );
  return match?.canonical ?? normalized;
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return Response.json(data, { ...init, headers });
}

function publicQuestion(question: ExamQuestion) {
  return {
    id: question.id,
    setNo: question.setNo,
    subject: question.subject,
    subjectCode: question.subjectCode,
    questionNo: question.questionNo,
    prompt: question.prompt,
    context: question.context ?? null,
    dataTable: question.dataTable ?? null,
    statements: question.statements ?? [],
    choices: question.choices,
    rightsStatus: question.rightsStatus,
  };
}

async function learnerStats(db: D1Database, learnerId: string) {
  const row = await db.prepare(
    `SELECT COUNT(DISTINCT a.id) AS attempt_count, COUNT(ans.id) AS answer_count,
            MAX(a.submitted_at) AS last_attempt_at
     FROM exam_attempts a
     LEFT JOIN exam_answers ans ON ans.attempt_id = a.id
     WHERE a.learner_id = ?`,
  ).bind(learnerId).first<{ attempt_count: number; answer_count: number; last_attempt_at: string | null }>();
  return {
    attemptCount: Number(row?.attempt_count ?? 0),
    answerCount: Number(row?.answer_count ?? 0),
    lastAttemptAt: row?.last_attempt_at ?? null,
  };
}

async function authRoute(request: Request, env: Env) {
  if (request.method === "GET") {
    const learner = await authenticateLearner(request, env.DB);
    if (!learner) return json({ authenticated: false });
    return json({ authenticated: true, learner: { ...learner, ...await learnerStats(env.DB, learner.id) } });
  }

  if (request.method === "DELETE") {
    return json(
      { signedOut: true },
      { headers: { "Set-Cookie": await logoutLearner(env.DB, request) } },
    );
  }

  if (request.method !== "POST") return json({ error: "지원하지 않는 요청입니다." }, { status: 405 });
  try {
    const body = await request.json() as { action?: string; nickname?: string; learnerCode?: string };
    if (body.action === "register") {
      const nickname = validateNickname(body.nickname ?? "");
      if (!nickname) return json({ error: "별명은 2~16자의 한글, 영문, 숫자로 입력해 주세요." }, { status: 400 });
      const result = await registerLearner(env.DB, nickname, request);
      return json(
        {
          authenticated: true,
          learner: { ...result.learner, attemptCount: 0, answerCount: 0, lastAttemptAt: null },
          learnerCode: result.learnerCode,
        },
        { headers: { "Set-Cookie": result.cookie } },
      );
    }
    if (body.action === "login") {
      const learnerCode = normalizeLearnerCode(body.learnerCode ?? "");
      if (!learnerCode) return json({ error: "학습자 코드 형식을 확인해 주세요." }, { status: 400 });
      const result = await loginLearner(env.DB, learnerCode, request);
      if (!result) return json({ error: "일치하는 학습자 코드를 찾지 못했습니다." }, { status: 401 });
      return json(
        { authenticated: true, learner: { ...result.learner, ...await learnerStats(env.DB, result.learner.id) } },
        { headers: { "Set-Cookie": result.cookie } },
      );
    }
    return json({ error: "접속 요청을 확인해 주세요." }, { status: 400 });
  } catch {
    return json({ error: "접속 요청을 처리하지 못했습니다." }, { status: 400 });
  }
}

async function examsRoute(request: Request, env: Env) {
  const learner = await authenticateLearner(request, env.DB);
  if (!learner) return json({ error: "익명 학습자 로그인이 필요합니다." }, { status: 401 });

  if (request.method === "GET") {
    const url = new URL(request.url);
    const setNo = Number(url.searchParams.get("set"));
    const subject = url.searchParams.get("subject") as SubjectCode | null;
    if (!Number.isInteger(setNo) || setNo < 1 || setNo > practiceMetadata.setCount || !subject || !subjectCodes.has(subject)) {
      return json({ error: "실전세트와 과목을 선택해 주세요." }, { status: 400 });
    }
    const selected = questions
      .filter((question) => question.setNo === setNo && question.subjectCode === subject)
      .sort((a, b) => a.questionNo - b.questionNo);
    return json({
      setNo,
      subject,
      count: selected.length,
      setCount: practiceMetadata.setCount,
      contentMode: practiceMetadata.contentMode,
      rightsStatus: practiceMetadata.rightsStatus,
      notice: practiceMetadata.notice,
      questions: selected.map(publicQuestion),
    });
  }

  if (request.method !== "POST") return json({ error: "지원하지 않는 요청입니다." }, { status: 405 });
  try {
    const input = await request.json() as {
      setNo?: number;
      subject?: SubjectCode;
      answers?: Record<string, string>;
      startedAt?: string;
      clientSubmissionId?: string;
    };
    if (!input.setNo || input.setNo < 1 || input.setNo > practiceMetadata.setCount || !input.subject || !subjectCodes.has(input.subject) || !input.answers) {
      return json({ error: "채점할 실전세트, 과목, 답안을 확인해 주세요." }, { status: 400 });
    }
    const selected = questions
      .filter((question) => question.setNo === input.setNo && question.subjectCode === input.subject)
      .sort((a, b) => a.questionNo - b.questionNo);
    const complete = selected.length > 0 && selected.every((question) => ["①", "②", "③", "④"].includes(input.answers?.[question.id]));
    if (!complete) return json({ error: `${selected.length}문항에 모두 답해야 채점할 수 있습니다.` }, { status: 400 });

    const results = Object.fromEntries(selected.map((question) => {
      const selectedChoice = input.answers?.[question.id] ?? "";
      return [question.id, {
        correct: question.acceptedAnswers.includes(selectedChoice),
        acceptedAnswers: question.acceptedAnswers,
      }];
    }));
    const score = Object.values(results).filter((result) => result.correct).length;
    const submittedAt = new Date().toISOString();
    const saved = await persistExamAttempt(env.DB, {
      learnerId: learner.id,
      clientSubmissionId: input.clientSubmissionId?.trim() || crypto.randomUUID(),
      round: input.setNo,
      contentMode: practiceMetadata.contentMode,
      subjectCode: input.subject,
      score,
      total: selected.length,
      startedAt: input.startedAt ?? null,
      submittedAt,
      questions: selected,
      answers: input.answers,
      results,
    });
    return json({
      setNo: input.setNo,
      subject: input.subject,
      score,
      total: selected.length,
      submittedAt,
      results,
      persistence: { saved: true, attemptId: saved.attemptId, attemptNo: saved.attemptNo },
    });
  } catch {
    return json({ error: "채점 요청을 처리하지 못했습니다." }, { status: 400 });
  }
}

async function attemptsRoute(request: Request, env: Env) {
  const learner = await authenticateLearner(request, env.DB);
  if (!learner) return json({ error: "익명 학습자 로그인이 필요합니다." }, { status: 401 });
  const [rows, summaryRows] = await Promise.all([
    env.DB.prepare(
      `SELECT round, content_mode, subject_code, attempt_no, score, total, submitted_at
       FROM exam_attempts WHERE learner_id = ? ORDER BY submitted_at DESC LIMIT 20`,
    ).bind(learner.id).all<{
      round: number;
      content_mode: string;
      subject_code: SubjectCode;
      attempt_no: number;
      score: number;
      total: number;
      submitted_at: string;
    }>(),
    env.DB.prepare(
      `SELECT round, content_mode, subject_code, COUNT(*) AS saved_count,
              MAX(attempt_no) AS last_attempt_no, MAX(submitted_at) AS last_submitted_at
       FROM exam_attempts WHERE learner_id = ?
       GROUP BY round, content_mode, subject_code`,
    ).bind(learner.id).all<{
      round: number;
      content_mode: string;
      subject_code: SubjectCode;
      saved_count: number;
      last_attempt_no: number;
      last_submitted_at: string;
    }>(),
  ]);
  return json({
    attempts: rows.results.map((row) => ({
      setNo: row.content_mode === "original_practice" ? row.round : null,
      round: row.content_mode === "official" ? row.round : null,
      contentMode: row.content_mode,
      subjectCode: row.subject_code,
      attemptNo: row.attempt_no,
      score: row.score,
      total: row.total,
      submittedAt: row.submitted_at,
    })),
    summaries: summaryRows.results.map((row) => ({
      setNo: row.content_mode === "original_practice" ? row.round : null,
      round: row.content_mode === "official" ? row.round : null,
      contentMode: row.content_mode,
      subjectCode: row.subject_code,
      savedCount: row.saved_count,
      lastAttemptNo: row.last_attempt_no,
      lastSubmittedAt: row.last_submitted_at,
    })),
  });
}

async function analysisRoute(request: Request, env: Env) {
  const learner = await authenticateLearner(request, env.DB);
  if (!learner) return json({ error: "익명 학습자 로그인이 필요합니다." }, { status: 401 });

  const [subjectRows, setRows, conceptRows] = await Promise.all([
    env.DB.prepare(
      `SELECT a.subject_code, COUNT(DISTINCT a.id) AS saved_attempts,
              COUNT(ans.id) AS answered_count, COALESCE(SUM(ans.correct), 0) AS correct_count,
              MAX(a.submitted_at) AS last_submitted_at
       FROM exam_attempts a
       LEFT JOIN exam_answers ans ON ans.attempt_id = a.id
       WHERE a.learner_id = ? AND a.content_mode = 'original_practice'
       GROUP BY a.subject_code`,
    ).bind(learner.id).all<{
      subject_code: SubjectCode;
      saved_attempts: number;
      answered_count: number;
      correct_count: number;
      last_submitted_at: string;
    }>(),
    env.DB.prepare(
      `SELECT round AS set_no, COUNT(DISTINCT subject_code) AS completed_subjects,
              COUNT(*) AS saved_attempts, MAX(submitted_at) AS last_submitted_at
       FROM exam_attempts
       WHERE learner_id = ? AND content_mode = 'original_practice'
       GROUP BY round ORDER BY round`,
    ).bind(learner.id).all<{
      set_no: number;
      completed_subjects: number;
      saved_attempts: number;
      last_submitted_at: string;
    }>(),
    env.DB.prepare(
      `SELECT a.subject_code, ans.domain, ans.concept, ans.primary_keyword,
              COUNT(*) AS answered_count, COALESCE(SUM(ans.correct), 0) AS correct_count,
              SUM(CASE WHEN ans.correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
              MAX(ans.answered_at) AS last_answered_at
       FROM exam_answers ans
       JOIN exam_attempts a ON a.id = ans.attempt_id
       WHERE ans.learner_id = ? AND a.content_mode = 'original_practice'
       GROUP BY a.subject_code, ans.domain, ans.concept, ans.primary_keyword
       ORDER BY wrong_count DESC, answered_count DESC, ans.concept ASC`,
    ).bind(learner.id).all<{
      subject_code: SubjectCode;
      domain: string;
      concept: string;
      primary_keyword: string | null;
      answered_count: number;
      correct_count: number;
      wrong_count: number;
      last_answered_at: string;
    }>(),
  ]);

  const subjectStats = subjectRows.results.map((row) => ({
    subjectCode: row.subject_code,
    savedAttempts: Number(row.saved_attempts),
    answeredCount: Number(row.answered_count),
    correctCount: Number(row.correct_count),
    accuracy: Number(row.answered_count) > 0 ? Math.round(Number(row.correct_count) / Number(row.answered_count) * 100) : null,
    lastSubmittedAt: row.last_submitted_at,
  }));
  const answeredCount = subjectStats.reduce((sum, item) => sum + item.answeredCount, 0);
  const correctCount = subjectStats.reduce((sum, item) => sum + item.correctCount, 0);
  const savedAttempts = subjectStats.reduce((sum, item) => sum + item.savedAttempts, 0);

  return json({
    hasData: savedAttempts > 0,
    summary: {
      savedAttempts,
      answeredCount,
      correctCount,
      accuracy: answeredCount > 0 ? Math.round(correctCount / answeredCount * 100) : null,
      completedSubjectSets: setRows.results.reduce((sum, row) => sum + Number(row.completed_subjects), 0),
      totalSubjectSets: practiceMetadata.setCount * 3,
    },
    subjectStats,
    setStats: setRows.results.map((row) => ({
      setNo: Number(row.set_no),
      completedSubjects: Number(row.completed_subjects),
      savedAttempts: Number(row.saved_attempts),
      lastSubmittedAt: row.last_submitted_at,
    })),
    vocabularyStandard: vocabularyData.metadata.id,
    vocabularyLevel: vocabularyData.metadata.level,
    focusConcepts: conceptRows.results.filter((row) => Number(row.wrong_count) > 0).slice(0, 6).map((row) => {
      const concept = canonicalConcept(row.subject_code, row.concept);
      return {
        subjectCode: row.subject_code,
        domain: row.domain,
        concept,
        keyword: concept,
        answeredCount: Number(row.answered_count),
        correctCount: Number(row.correct_count),
        wrongCount: Number(row.wrong_count),
        accuracy: Math.round(Number(row.correct_count) / Number(row.answered_count) * 100),
        lastAnsweredAt: row.last_answered_at,
      };
    }),
  });
}

function limitedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function feedbackRoute(request: Request, env: Env) {
  const learner = await authenticateLearner(request, env.DB);
  if (!learner) return json({ error: "익명 학습자 로그인이 필요합니다." }, { status: 401 });
  if (request.method !== "POST") return json({ error: "지원하지 않는 요청입니다." }, { status: 405 });

  try {
    const body = await request.json() as {
      category?: string;
      message?: string;
      setNo?: number;
      subject?: SubjectCode;
      questionNo?: number;
      pagePath?: string;
      clientError?: string;
      viewport?: string;
    };
    const category = feedbackCategories.has(body.category ?? "") ? body.category as string : "other";
    const message = limitedText(body.message, 1000);
    if (message.length < 5) return json({ error: "어떤 문제가 있었는지 5자 이상 적어 주세요." }, { status: 400 });

    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM feedback_reports WHERE learner_id = ? AND created_at >= datetime('now', '-1 day')",
    ).bind(learner.id).first<{ total: number }>();
    if (Number(recent?.total ?? 0) >= 10) {
      return json({ error: "오늘 접수 가능한 제보 수를 넘었습니다. 기존 제보를 먼저 확인하겠습니다." }, { status: 429 });
    }

    const setNo = Number.isInteger(body.setNo) && Number(body.setNo) >= 1 && Number(body.setNo) <= practiceMetadata.setCount ? Number(body.setNo) : null;
    const subject = body.subject && subjectCodes.has(body.subject) ? body.subject : null;
    const questionNo = Number.isInteger(body.questionNo) && Number(body.questionNo) >= 1 && Number(body.questionNo) <= 40 ? Number(body.questionNo) : null;
    const pagePath = limitedText(body.pagePath, 200);
    const clientError = limitedText(body.clientError, 500);
    const viewport = limitedText(body.viewport, 40);
    const userAgent = limitedText(request.headers.get("User-Agent"), 500);
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO feedback_reports
       (id, learner_id, category, message, round, content_mode, subject_code, question_no, page_path, client_error, user_agent, viewport, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'original_practice', ?, ?, ?, ?, ?, ?, 'new', ?)`,
    ).bind(
      id,
      learner.id,
      category,
      message,
      setNo,
      subject,
      questionNo,
      pagePath || null,
      clientError || null,
      userAgent || null,
      viewport || null,
      createdAt,
    ).run();

    return json({ saved: true, reportCode: `ECF-${id.slice(0, 8).toUpperCase()}`, createdAt }, { status: 201 });
  } catch {
    return json({ error: "제보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 400 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth") return authRoute(request, env);
    if (url.pathname === "/api/exams") return examsRoute(request, env);
    if (url.pathname === "/api/attempts" && request.method === "GET") return attemptsRoute(request, env);
    if (url.pathname === "/api/analysis" && request.method === "GET") return analysisRoute(request, env);
    if (url.pathname === "/api/feedback") return feedbackRoute(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "학습자용 서비스에서 제공하지 않는 기능입니다." }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
