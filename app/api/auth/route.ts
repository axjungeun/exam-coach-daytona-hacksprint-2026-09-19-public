import {
  authenticateLearner,
  getLearnerDatabase,
  loginLearner,
  logoutLearner,
  normalizeLearnerCode,
  registerLearner,
  validateNickname,
} from "../../lib/learner-auth";

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

export async function GET(request: Request) {
  const db = getLearnerDatabase();
  if (!db) return Response.json({ authenticated: false, databaseReady: false });
  const learner = await authenticateLearner(request, db);
  if (!learner) return Response.json({ authenticated: false, databaseReady: true });
  return Response.json({ authenticated: true, databaseReady: true, learner: { ...learner, ...await learnerStats(db, learner.id) } });
}

export async function POST(request: Request) {
  const db = getLearnerDatabase();
  if (!db) return Response.json({ error: "학습 기록 데이터베이스가 준비되지 않았습니다." }, { status: 503 });
  try {
    const body = await request.json() as { action?: string; nickname?: string; learnerCode?: string };
    if (body.action === "register") {
      const nickname = validateNickname(body.nickname ?? "");
      if (!nickname) return Response.json({ error: "별명은 2~16자의 한글, 영문, 숫자로 입력해 주세요." }, { status: 400 });
      const result = await registerLearner(db, nickname, request);
      return Response.json(
        { authenticated: true, learner: { ...result.learner, attemptCount: 0, answerCount: 0, lastAttemptAt: null }, learnerCode: result.learnerCode },
        { headers: { "Set-Cookie": result.cookie } },
      );
    }
    if (body.action === "login") {
      const learnerCode = normalizeLearnerCode(body.learnerCode ?? "");
      if (!learnerCode) return Response.json({ error: "학습자 코드 형식을 확인해 주세요." }, { status: 400 });
      const result = await loginLearner(db, learnerCode, request);
      if (!result) return Response.json({ error: "일치하는 학습자 코드를 찾지 못했습니다." }, { status: 401 });
      return Response.json(
        { authenticated: true, learner: { ...result.learner, ...await learnerStats(db, result.learner.id) } },
        { headers: { "Set-Cookie": result.cookie } },
      );
    }
    return Response.json({ error: "로그인 요청을 확인해 주세요." }, { status: 400 });
  } catch {
    return Response.json({ error: "로그인 요청을 처리하지 못했습니다." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const db = getLearnerDatabase();
  if (!db) return Response.json({ signedOut: true });
  return Response.json({ signedOut: true }, { headers: { "Set-Cookie": await logoutLearner(db, request) } });
}
