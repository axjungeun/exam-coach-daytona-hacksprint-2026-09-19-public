/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import daytonaHackSprintEvidenceData from "../app/data/daytona-hacksprint-evidence.json";
import { setRuntimeDatabase } from "../app/lib/runtime-env";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  REVIEW_PASSWORD_HASH?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passwordHash(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function sameValue(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function reviewerAuthorized(request: Request, env: Env) {
  if (!env.REVIEW_PASSWORD_HASH) return true;
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Basic ")) return false;
  try {
    const [username, password] = atob(authorization.slice(6)).split(":", 2);
    return username === "review" && sameValue(await passwordHash(password ?? ""), env.REVIEW_PASSWORD_HASH);
  } catch {
    return false;
  }
}

function reviewLoginRequired() {
  return new Response(
    `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Exam Coach 심사자 인증</title><body style="font-family:Arial,sans-serif;margin:0;display:grid;min-height:100vh;place-items:center;background:#f4f7f8;color:#132738"><main style="max-width:420px;padding:36px;border:1px solid #d9e1e5;background:white"><strong style="display:block;margin-bottom:12px;color:#126e6b">Exam Coach Review</strong><h1 style="font-size:26px">심사자 전용 데모입니다</h1><p style="line-height:1.6;color:#637383">전달받은 사용자 이름과 비밀번호를 입력해 주세요.</p></main></body></html>`,
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "WWW-Authenticate": 'Basic realm="Exam Coach Review", charset="UTF-8"',
      },
    },
  );
}

function isViteDevelopmentAsset(pathname: string) {
  return pathname.startsWith("/@")
    || pathname.startsWith("/__vite")
    || pathname.startsWith("/app/")
    || pathname.startsWith("/node_modules/");
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

type FeedbackStatus = "new" | "reviewing" | "resolved";
type FeedbackRow = {
  id: string;
  nickname: string;
  category: string;
  message: string;
  round: number | null;
  content_mode: string;
  subject_code: string | null;
  question_no: number | null;
  client_error: string | null;
  user_agent: string | null;
  viewport: string | null;
  status: FeedbackStatus;
  created_at: string;
};

type PilotSummaryRow = {
  learner_count: number;
  attempt_count: number;
  answer_count: number;
};

const feedbackLabels: Record<string, string> = {
  content: "문제·보기 내용",
  grading: "정답·채점 확인",
  screen: "화면·작동 오류",
  other: "기타 불편",
};

const subjectLabels: Record<string, string> = {
  BIZ: "보험업법",
  CONTRACT: "보험계약법",
  THEORY: "손해사정이론",
};

const BUILDERS_PASS_PATH = "/builders/daytona-seoul-2026";
const BUILDERS_PASS_EXPIRES_AT_UTC = Date.parse("2026-09-19T14:59:59Z");
const BUILDERS_PASS_EXPIRES_LABEL = "2026-09-19 23:59 KST";

type DaytonaEvidence = {
  verifiedAtKst: string;
  provider: string;
  keyScope: string;
  sandboxId: string;
  result: {
    questionCount: number;
    uniqueIds: number;
    subjectCount: number;
    roundRange: string;
    missingAnswers: number;
    valid: boolean;
  };
  secretBoundary: string;
};

const daytonaEvidence = daytonaHackSprintEvidenceData as DaytonaEvidence;

function shortenedId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function builderPassExpired() {
  return Date.now() > BUILDERS_PASS_EXPIRES_AT_UTC;
}

function buildersPassHeaders(status = 200) {
  return {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  };
}

function buildersPassRedirect(request: Request) {
  const redirectUrl = new URL(BUILDERS_PASS_PATH, request.url);
  redirectUrl.searchParams.set("pass", "builders");
  return new Response(null, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
      Location: redirectUrl.toString(),
    },
  });
}

function buildersPassEnded() {
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Exam Coach 체험 종료</title><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#f4f7f8;color:#102333;font-family:Arial,'Apple SD Gothic Neo',sans-serif"><main style="max-width:560px;padding:36px;border:1px solid #d6e0de;background:#fff"><p style="margin:0 0 10px;color:#1f7a73;font-weight:800">Daytona HackSprint Seoul 2026</p><h1 style="margin:0 0 14px;font-size:30px">현장 빌더 체험판이 종료되었습니다</h1><p style="margin:0;color:#596e78;line-height:1.7">이 QR 체험판은 ${BUILDERS_PASS_EXPIRES_LABEL}까지만 열리도록 설정되어 있습니다. 심사위원용 데모와 코드 리뷰 자료는 별도 링크로 확인할 수 있습니다.</p></main></body></html>`, buildersPassHeaders(410));
}

function buildersExperience() {
  if (builderPassExpired()) return buildersPassEnded();
  const safeReceipt = {
    verifiedAtKst: daytonaEvidence.verifiedAtKst,
    provider: daytonaEvidence.provider,
    keyScope: daytonaEvidence.keyScope,
    sandboxId: shortenedId(daytonaEvidence.sandboxId),
    questionCount: daytonaEvidence.result.questionCount,
    uniqueIds: daytonaEvidence.result.uniqueIds,
    subjectCount: daytonaEvidence.result.subjectCount,
    roundRange: daytonaEvidence.result.roundRange,
    missingAnswers: daytonaEvidence.result.missingAnswers,
    valid: daytonaEvidence.result.valid,
    secretBoundary: daytonaEvidence.secretBoundary,
    expiresAt: BUILDERS_PASS_EXPIRES_LABEL,
  };
  return new Response(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>AI Exam Coach · Builder Pass</title>
  <style>
    :root{--ink:#102333;--muted:#60717a;--teal:#1f7a73;--teal-dark:#0d3340;--gold:#f1c75b;--paper:#f6f8f7;--line:#d6e0de;--soft:#eef8f3;--warn:#fff5d9}
    *{box-sizing:border-box}html{background:var(--paper)}body{margin:0;color:var(--ink);font-family:Arial,"Apple SD Gothic Neo",sans-serif}button{font:inherit;cursor:pointer}
    .shell{min-height:100vh;display:grid;grid-template-columns:290px 1fr}.rail{background:var(--teal-dark);color:#fff;padding:32px 24px;display:flex;flex-direction:column;gap:24px}.brand{display:flex;gap:12px;align-items:center}.brand span{width:44px;height:44px;border-radius:9px;background:var(--gold);color:#082331;display:grid;place-items:center;font-weight:900}.brand strong{display:block;font-size:20px}.brand small{color:#bdd0d5}.rail-card{border:1px solid #31505d;background:#133b49;padding:18px}.rail-card b,.rail-card span{display:block}.rail-card b{font-size:25px}.rail-card span{margin-top:6px;color:#cee0e4;font-size:13px;line-height:1.5}.main{padding:34px 40px 56px}.hero{border:1px solid var(--line);background:#fff;display:grid;grid-template-columns:minmax(0,1fr) 330px}.hero-copy{padding:32px}.eyebrow{margin:0 0 10px;color:var(--teal);font-size:13px;font-weight:900;letter-spacing:0;text-transform:uppercase}.hero h1{margin:0;font-size:42px;line-height:1.14;letter-spacing:0}.hero p{margin:14px 0 0;color:var(--muted);font-size:17px;line-height:1.7}.hero-meta{border-left:1px solid var(--line);background:#fbf7ee;padding:28px;display:grid;align-content:center;gap:12px}.hero-meta div{border:1px solid #e5d6b2;background:#fff;padding:14px}.hero-meta span,.hero-meta b{display:block}.hero-meta span{color:#776030;font-size:12px}.hero-meta b{margin-top:5px;font-size:22px}.grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(340px,.92fr);gap:16px;margin-top:16px}.panel{border:1px solid var(--line);background:#fff}.panel header{padding:20px 22px;border-bottom:1px solid var(--line)}.panel header h2{margin:0;font-size:23px}.panel header p{margin:8px 0 0;color:var(--muted);line-height:1.55}.question{padding:22px}.question h3{margin:0 0 18px;font-size:25px}.choices{display:grid;gap:10px}.choices button{min-height:58px;padding:0 16px;border:1px solid var(--line);background:#fff;text-align:left;color:var(--ink);font-weight:800}.choices button:hover,.choices button.active{border-color:var(--teal);background:#edf8f6}.result{margin-top:18px;padding:18px;border-left:4px solid var(--teal);background:#f2faf8;display:none}.result.show{display:block}.result strong{display:block;margin-bottom:8px;font-size:18px}.result dl{display:grid;grid-template-columns:130px 1fr;margin:0;gap:8px 14px}.result dt{color:var(--muted);font-size:12px}.result dd{margin:0;font-weight:800}.receipt{padding:22px}.receipt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--line)}.receipt-grid div{min-height:96px;padding:17px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.receipt-grid div:nth-child(2n){border-right:0}.receipt-grid div:nth-last-child(-n+2){border-bottom:0}.receipt span{display:block;color:var(--teal);font-size:12px;font-weight:900}.receipt b{display:block;margin-top:8px;font-size:20px}.stack{display:grid;gap:16px}.why{padding:22px}.why ul{margin:0;padding:0;list-style:none;display:grid;gap:12px}.why li{padding:14px 16px;border:1px solid var(--line);background:#fbfdfd}.why b{display:block;margin-bottom:5px}.why span{color:var(--muted);line-height:1.55}.footer-note{margin-top:16px;padding:16px 18px;border:1px solid #ead59b;background:var(--warn);color:#6f5417;line-height:1.6}.action-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.action-row a,.action-row button{min-height:42px;padding:0 14px;border:1px solid var(--teal);background:var(--teal);color:#fff;text-decoration:none;display:inline-flex;align-items:center;font-weight:900}.action-row button.secondary{background:#fff;color:var(--teal)}@media(max-width:900px){.shell{grid-template-columns:1fr}.rail{position:static}.hero,.grid{grid-template-columns:1fr}.hero-meta{border-left:0;border-top:1px solid var(--line)}.main{padding:20px}.receipt-grid{grid-template-columns:1fr}.receipt-grid div{border-right:0}.receipt-grid div:nth-last-child(2){border-bottom:1px solid var(--line)}}@media(max-width:560px){.hero h1{font-size:31px}.question h3{font-size:21px}.rail{padding:22px}.main{padding:14px}.hero-copy,.hero-meta,.question,.receipt,.why{padding:18px}}
  </style>
</head>
<body>
  <main class="shell">
    <aside class="rail">
      <div class="brand"><span>EC</span><div><strong>Exam Coach</strong><small>Builder Pass</small></div></div>
      <div class="rail-card"><b>1분 체험</b><span>답을 하나 고르면 오답 진단과 다음 학습 행동이 바로 열립니다.</span></div>
      <div class="rail-card"><b>자정 종료</b><span>이 공개 링크는 ${BUILDERS_PASS_EXPIRES_LABEL}까지만 열립니다.</span></div>
      <div class="rail-card"><b>저장 안 함</b><span>이 페이지의 선택은 브라우저 안에서만 처리되고 서버에 저장되지 않습니다.</span></div>
    </aside>
    <section class="main">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Daytona HackSprint Seoul 2026</p>
          <h1>틀린 답을 다음 학습 행동으로 바꾸는 AI Exam Coach</h1>
          <p>문제은행형 시험에서 학습자는 정답만 보는 게 아니라, 왜 흔들렸는지와 무엇을 다시 해야 하는지를 받아야 합니다. Daytona는 이 분석 작업을 격리된 실행 환경에서 검증 가능한 receipt로 남기는 런타임입니다.</p>
          <div class="action-row"><a href="#try">직접 풀어보기</a><button class="secondary" data-scroll-receipt type="button">Daytona 증거 보기</button></div>
        </div>
        <div class="hero-meta">
          <div><span>Validated records</span><b>${safeReceipt.questionCount.toLocaleString("en-US")}</b></div>
          <div><span>Missing answers</span><b>${safeReceipt.missingAnswers}</b></div>
          <div><span>Access window</span><b>${BUILDERS_PASS_EXPIRES_LABEL}</b></div>
        </div>
      </section>
      <section class="grid" id="try">
        <article class="panel">
          <header><p class="eyebrow">Try the learner loop</p><h2>짧은 샘플 문항</h2><p>현장 체험판은 제품 흐름을 보여주기 위한 축약 UI입니다. 실제 심사위원용 데모에는 전체 회차 분석과 실행 파이프라인이 들어 있습니다.</p></header>
          <div class="question">
            <h3>빙판길 또는 땅꺼짐처럼 원인이 특정된 사고와 관련된 위험은?</h3>
            <div class="choices" aria-label="샘플 선택지">
              <button data-choice="wrong" type="button">① 정신적 위태</button>
              <button data-choice="wrong" type="button">② 도덕적 위태</button>
              <button data-choice="correct" type="button">③ 물리적 위태</button>
              <button data-choice="wrong" type="button">④ 법률적 위태</button>
            </div>
            <div class="result" role="status" aria-live="polite">
              <strong>진단 대기</strong>
              <dl><dt>취약 개념</dt><dd data-concept>-</dd><dt>다음 행동</dt><dd data-action>-</dd><dt>근거 방식</dt><dd>공식 정답과 강사 자료 색인 범위 안에서만 설명</dd></dl>
            </div>
          </div>
        </article>
        <div class="stack">
          <article class="panel" id="receipt">
            <header><p class="eyebrow">Daytona execution receipt</p><h2>샌드박스 검증 증거</h2><p>공개 체험판은 비용이 생기는 live run을 열지 않고, 검증된 receipt만 보여줍니다.</p></header>
            <div class="receipt">
              <div class="receipt-grid">
                <div><span>Sandbox ID</span><b>${safeReceipt.sandboxId}</b></div>
                <div><span>Scope</span><b>${safeReceipt.subjectCount} subjects · ${safeReceipt.roundRange}</b></div>
                <div><span>Integrity</span><b>${safeReceipt.uniqueIds.toLocaleString("en-US")} IDs · ${safeReceipt.missingAnswers} missing</b></div>
                <div><span>Verified at</span><b>${safeReceipt.verifiedAtKst}</b></div>
              </div>
              <p class="footer-note">Secret boundary: API keys, account data, coupon codes, and raw learner answers are not shown on this public page.</p>
            </div>
          </article>
          <article class="panel">
            <header><p class="eyebrow">Why Daytona fits</p><h2>제품에 맞았던 지점</h2></header>
            <div class="why">
              <ul>
                <li><b>격리 실행</b><span>문항 데이터 검증 작업을 앱 서버와 분리된 sandbox에서 수행해 데모 신뢰도를 높였습니다.</span></li>
                <li><b>검증 가능한 결과</b><span>샌드박스 ID, 실행 시각, record count, 누락 0건을 receipt로 남겨 sponsor usage가 화면 주장에 그치지 않게 했습니다.</span></li>
                <li><b>실패해도 정직한 UX</b><span>외부 호출 실패 시 fallback을 완료처럼 포장하지 않고 마지막 검증 receipt와 로컬 분석 경로를 구분합니다.</span></li>
              </ul>
            </div>
          </article>
        </div>
      </section>
    </section>
  </main>
  <script>
    const result = document.querySelector(".result");
    const concept = document.querySelector("[data-concept]");
    const action = document.querySelector("[data-action]");
    document.querySelectorAll("[data-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-choice]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        result.classList.add("show");
        if (button.dataset.choice === "correct") {
          result.querySelector("strong").textContent = "정답입니다. 유지 복습으로 전환합니다.";
          concept.textContent = "물리적 위태를 위험 원인과 연결";
          action.textContent = "24시간 안에 유사 사례 2문항으로 유지 여부 확인";
        } else {
          result.querySelector("strong").textContent = "오답입니다. 개념 구분부터 다시 잡습니다.";
          concept.textContent = "정신적·도덕적·물리적·법률적 위태 구분";
          action.textContent = "빙판길·땅꺼짐 같은 외부 물리 원인 사례를 먼저 회상한 뒤 재풀이";
        }
      });
    });
    document.querySelector("[data-scroll-receipt]").addEventListener("click", () => {
      document.querySelector("#receipt").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  </script>
</body>
</html>`, buildersPassHeaders());
}

function feedbackStatusLabel(status: FeedbackStatus) {
  return status === "new" ? "신규" : status === "reviewing" ? "확인 중" : "처리 완료";
}

async function feedbackDashboard(env: Env) {
  const [query, pilotSummary] = await Promise.all([
    env.DB.prepare(
      `SELECT f.id, l.nickname, f.category, f.message, f.round, f.content_mode, f.subject_code, f.question_no,
              f.client_error, f.user_agent, f.viewport, f.status, f.created_at
       FROM feedback_reports f
       JOIN learners l ON l.id = f.learner_id
       ORDER BY CASE f.status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, f.created_at DESC
       LIMIT 200`,
    ).all<FeedbackRow>(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT l.id) AS learner_count,
              COUNT(DISTINCT a.id) AS attempt_count,
              COUNT(ans.id) AS answer_count
       FROM learners l
       LEFT JOIN exam_attempts a ON a.learner_id = l.id
       LEFT JOIN exam_answers ans ON ans.attempt_id = a.id
       WHERE l.data_origin = 'real'`,
    ).first<PilotSummaryRow>(),
  ]);
  const rows = query.results;
  const pilot = {
    learners: Number(pilotSummary?.learner_count ?? 0),
    attempts: Number(pilotSummary?.attempt_count ?? 0),
    answers: Number(pilotSummary?.answer_count ?? 0),
  };
  const counts = {
    new: rows.filter((row) => row.status === "new").length,
    reviewing: rows.filter((row) => row.status === "reviewing").length,
    resolved: rows.filter((row) => row.status === "resolved").length,
  };
  const cards = rows.map((row) => {
    const context = [
      row.round ? row.content_mode === "original_practice" ? `실전세트 ${row.round}` : `제${row.round}회` : null,
      row.subject_code ? subjectLabels[row.subject_code] ?? row.subject_code : null,
      row.question_no ? `Q${row.question_no}` : null,
    ].filter(Boolean).join(" · ") || "접속 화면";
    const receivedAt = new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const nextActions = row.status === "new"
      ? `<button name="status" value="reviewing">확인 시작</button><button name="status" value="resolved">바로 완료</button>`
      : row.status === "reviewing"
        ? `<button name="status" value="resolved">처리 완료</button><button name="status" value="new">신규로 되돌리기</button>`
        : `<button name="status" value="reviewing">다시 확인</button>`;
    return `<article class="report ${row.status}">
      <header><span class="status">${feedbackStatusLabel(row.status)}</span><span>${escapeHtml(feedbackLabels[row.category] ?? row.category)}</span><time>${escapeHtml(receivedAt)}</time></header>
      <h2>${escapeHtml(row.message)}</h2>
      <dl><div><dt>학습자</dt><dd>${escapeHtml(row.nickname)}</dd></div><div><dt>위치</dt><dd>${escapeHtml(context)}</dd></div><div><dt>화면</dt><dd>${escapeHtml(row.viewport ?? "-")}</dd></div></dl>
      ${row.client_error ? `<details><summary>자동 첨부된 기술 오류</summary><pre>${escapeHtml(row.client_error)}</pre></details>` : ""}
      ${row.user_agent ? `<details><summary>브라우저 정보</summary><pre>${escapeHtml(row.user_agent)}</pre></details>` : ""}
      <form action="/feedback/action" method="post"><input type="hidden" name="id" value="${escapeHtml(row.id)}">${nextActions}</form>
    </article>`;
  }).join("");

  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Exam Coach 테스트 제보</title><style>
    :root{font-family:Arial,"Apple SD Gothic Neo",sans-serif;color:#132738;background:#f4f7f8}*{box-sizing:border-box}body{margin:0}button{font:inherit;cursor:pointer}.top{background:#0e2b39;color:white}.top>div{max-width:1100px;display:flex;align-items:center;justify-content:space-between;margin:auto;padding:22px}.top strong{font-size:19px}.top a{color:#d3e4e6;text-decoration:none}.wrap{max-width:1100px;margin:auto;padding:38px 22px 70px}.title{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:24px}.title p{margin:0 0 8px;color:#126e6b;font-weight:800;font-size:13px}.title h1{margin:0;font-size:34px}.title a{padding:10px 14px;border:1px solid #bac7cd;background:white;color:#132738;text-decoration:none}.pilot{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:14px;border:1px solid #b9d5cc;background:#eef8f3}.pilot div,.summary div{padding:18px}.pilot div{border-right:1px solid #cce1d9}.pilot div:last-child,.summary div:last-child{border:0}.pilot span,.pilot b,.pilot small,.summary span,.summary b{display:block}.pilot span,.summary span{color:#637383;font-size:12px}.pilot b,.summary b{margin-top:6px;font-size:25px}.pilot small{margin-top:5px;color:#2c6e57;font-size:11px}.summary{display:grid;grid-template-columns:repeat(3,1fr);margin-bottom:24px;border:1px solid #d9e1e5;background:white}.summary div{border-right:1px solid #d9e1e5}.reports{display:grid;gap:12px}.report{padding:22px;border:1px solid #d9e1e5;border-left:5px solid #a5b2b8;background:white}.report.new{border-left-color:#b83b43}.report.reviewing{border-left-color:#b17a14}.report.resolved{border-left-color:#2c7a55}.report header{display:flex;align-items:center;gap:10px;color:#637383;font-size:12px}.report time{margin-left:auto}.status{padding:5px 8px;background:#edf2f3;color:#132738;font-weight:800}.report h2{margin:18px 0;font-size:20px;line-height:1.55}.report dl{display:grid;grid-template-columns:repeat(3,1fr);margin:0;border-top:1px solid #e1e6e8;border-bottom:1px solid #e1e6e8}.report dl div{padding:12px}.report dt{color:#637383;font-size:11px}.report dd{margin:5px 0 0;font-weight:700}.report details{margin-top:12px;color:#637383;font-size:12px}.report pre{overflow:auto;padding:10px;background:#f4f7f8;white-space:pre-wrap}.report form{display:flex;gap:8px;margin-top:18px}.report form button{min-height:38px;padding:0 13px;border:1px solid #126e6b;background:white;color:#126e6b;font-weight:800}.empty{padding:50px;border:1px solid #d9e1e5;background:white;color:#637383;text-align:center}@media(max-width:640px){.title{align-items:start;flex-direction:column}.pilot,.summary{grid-template-columns:1fr}.pilot div,.summary div{border-right:0;border-bottom:1px solid #d9e1e5}.report header{align-items:start;flex-wrap:wrap}.report time{width:100%;margin:0}.report dl{grid-template-columns:1fr}.report form{flex-direction:column}}
  </style></head><body><header class="top"><div><strong>Exam Coach · 테스트 제보</strong><a href="/">전체 데모로 돌아가기</a></div></header><main class="wrap"><section class="title"><div><p>초기 학습자 테스트</p><h1>오류·불편 접수함</h1></div><a href="/feedback">새로고침</a></section><section class="pilot" aria-label="실제 학습자 테스트 현황"><div><span>실제 익명 학습자</span><b>${pilot.learners}<small>/ 최소 점검 5명</small></b></div><div><span>저장된 풀이</span><b>${pilot.attempts}<small>회</small></b></div><div><span>문항 응답</span><b>${pilot.answers}<small>건</small></b></div></section><section class="summary"><div><span>신규 제보</span><b>${counts.new}</b></div><div><span>확인 중</span><b>${counts.reviewing}</b></div><div><span>처리 완료</span><b>${counts.resolved}</b></div></section><section class="reports">${cards || `<div class="empty">아직 접수된 제보가 없습니다.</div>`}</section></main></body></html>`, {
    headers: { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8" },
  });
}

async function feedbackAction(request: Request, env: Env) {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "") as FeedbackStatus;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !new Set<FeedbackStatus>(["new", "reviewing", "resolved"]).has(status)) {
    return new Response("잘못된 상태 변경 요청입니다.", { status: 400 });
  }
  await env.DB.prepare(
    "UPDATE feedback_reports SET status = ?, resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE NULL END WHERE id = ?",
  ).bind(status, status, new Date().toISOString(), id).run();
  return new Response(null, { status: 303, headers: { Location: "/feedback" } });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    setRuntimeDatabase(env.DB);
    const url = new URL(request.url);

    if (url.pathname === "/builders") return buildersPassRedirect(request);
    if (url.pathname === BUILDERS_PASS_PATH && request.method === "GET") return buildersExperience();

    if (!await reviewerAuthorized(request, env)) return reviewLoginRequired();

    if (url.pathname === "/feedback" && request.method === "GET") return feedbackDashboard(env);
    if (url.pathname === "/feedback/action" && request.method === "POST") return feedbackAction(request, env);

    // Vinext emits source CSS and virtual-module URLs while Vite is running.
    // Let the development asset binding handle them instead of treating them
    // as application routes. Production builds use hashed static assets.
    if (isViteDevelopmentAsset(url.pathname)) return env.ASSETS.fetch(request);

    if (url.pathname.startsWith("/_next/static/") || url.pathname === "/favicon.ico") {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
