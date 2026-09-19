const subjects = [
  { code: "BIZ", name: "보험업법" },
  { code: "CONTRACT", name: "보험계약법" },
  { code: "THEORY", name: "손해사정이론" },
];
const symbols = ["①", "②", "③", "④"];
const state = {
  screen: "loading",
  view: "solve",
  authMode: "register",
  learner: null,
  issuedCode: null,
  setNo: 1,
  setCount: 3,
  total: 6,
  contentNotice: "공개 기출의 문장과 선택지를 옮기지 않고 새로 구성한 연습문항입니다.",
  subject: "THEORY",
  questions: [],
  questionNo: 1,
  answers: {},
  results: null,
  score: null,
  attemptNo: null,
  startedAt: null,
  submissionId: null,
  attempts: [],
  attemptSummaries: [],
  analysis: null,
  analysisLoading: false,
  loading: false,
  error: null,
  feedbackOpen: false,
  feedbackSending: false,
  feedbackError: null,
  feedbackSuccess: null,
  feedbackDraft: { category: "screen", message: "" },
  lastClientError: null,
};

const app = document.querySelector("#app");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function rememberClientError(value) {
  state.lastClientError = String(value ?? "알 수 없는 오류").slice(0, 500);
}

window.addEventListener("error", (event) => rememberClientError(event.message));
window.addEventListener("unhandledrejection", (event) => rememberClientError(event.reason?.message ?? event.reason));

async function api(path, options = {}) {
  try {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = payload.error ?? "요청을 처리하지 못했습니다.";
      if (path !== "/api/feedback") rememberClientError(`${options.method ?? "GET"} ${path} · ${response.status} · ${message}`);
      throw new Error(message);
    }
    return payload;
  } catch (error) {
    if (path !== "/api/feedback" && !state.lastClientError) rememberClientError(`${options.method ?? "GET"} ${path} · ${error.message}`);
    throw error;
  }
}

function subjectName(code) {
  return subjects.find((subject) => subject.code === code)?.name ?? code;
}

function savedSummary(setNo, subjectCode) {
  return state.attemptSummaries.find((item) => item.contentMode === "original_practice" && item.setNo === setNo && item.subjectCode === subjectCode) ?? null;
}

function savedCount(setNo, subjectCode) {
  return savedSummary(setNo, subjectCode)?.savedCount ?? 0;
}

function completedSubjectCount(setNo) {
  return subjects.filter((subject) => savedCount(setNo, subject.code) > 0).length;
}

function currentAttemptNo() {
  return state.results && state.attemptNo
    ? state.attemptNo
    : (savedSummary(state.setNo, state.subject)?.lastAttemptNo ?? 0) + 1;
}

function subjectSaveLabel(subjectCode) {
  const count = savedCount(state.setNo, subjectCode);
  if (subjectCode === state.subject && !state.results) return `${currentAttemptNo()}회차 풀이 중`;
  return count > 0 ? `${count}회 저장` : "저장 없음";
}

function renderLoading() {
  app.innerHTML = `<section class="center-state"><div class="brand"><span>EC</span><strong>Exam Coach</strong></div><i class="spinner"></i><p>학습 기록을 연결하고 있습니다.</p></section>`;
}

function renderAccess() {
  if (state.issuedCode) {
    app.innerHTML = `
      <main class="access-shell">
        <section class="access-intro">
          <div class="brand"><span>EC</span><strong>Exam Coach</strong></div>
          <p class="eyebrow">초대 학습자 테스트</p>
          <h1>풀이에만 집중할 수 있게 준비했습니다</h1>
          <div class="intro-points"><p><b>3세트</b><span>독립 제작 연습문항</span></p><p><b>3과목</b><span>핵심개념 진단</span></p><p><b>익명 기록</b><span>실명과 이메일 미수집</span></p></div>
        </section>
        <section class="access-panel issued">
          <span class="success-mark">✓</span><p class="eyebrow">익명 계정 생성 완료</p>
          <h2>학습자 코드를 보관해 주세요</h2>
          <div class="issued-code"><strong>${escapeHtml(state.issuedCode)}</strong><button id="copy-code" type="button" aria-label="학습자 코드 복사">복사</button></div>
          <p>다른 기기에서 기록을 이어볼 때 필요합니다. 원본 코드는 서버에 저장하지 않습니다.</p>
          <button class="primary" id="start-study" type="button">학습 시작</button>
        </section>
      </main>`;
    document.querySelector("#copy-code").addEventListener("click", async () => {
      await navigator.clipboard.writeText(state.issuedCode);
      document.querySelector("#copy-code").textContent = "완료";
    });
    document.querySelector("#start-study").addEventListener("click", startApp);
    return;
  }

  app.innerHTML = `
    <main class="access-shell">
      <section class="access-intro">
        <div class="brand"><span>EC</span><strong>Exam Coach</strong></div>
        <p class="eyebrow">초대 학습자 테스트</p>
        <h1>문제를 풀고 학습 기록을 남겨주세요</h1>
        <div class="intro-points"><p><b>3세트</b><span>독립 제작 연습문항</span></p><p><b>3과목</b><span>핵심개념 진단</span></p><p><b>익명 기록</b><span>실명과 이메일 미수집</span></p></div>
      </section>
      <section class="access-panel">
        <div class="tabs" role="tablist"><button class="${state.authMode === "register" ? "active" : ""}" data-auth-mode="register" type="button">처음 참여</button><button class="${state.authMode === "login" ? "active" : ""}" data-auth-mode="login" type="button">기록 이어보기</button></div>
        <form id="auth-form">
          <p class="eyebrow">${state.authMode === "register" ? "익명 학습자 등록" : "기존 기록 불러오기"}</p>
          <h2>${state.authMode === "register" ? "별명으로 시작하세요" : "학습자 코드를 입력하세요"}</h2>
          ${state.authMode === "register" ? `
            <label><span>별명</span><input name="nickname" minlength="2" maxlength="16" placeholder="2~16자" required /></label>
            <label class="consent"><input name="consent" type="checkbox" /><span>별명, 완료한 문항별 답안, 점수, 풀이 시각을 학습 분석 목적으로 저장하는 데 동의합니다.</span></label>
          ` : `<label><span>학습자 코드</span><input name="learnerCode" placeholder="EC-XXXX-XXXX-XXXX" required /></label>`}
          ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          <button class="primary" type="submit">${state.loading ? "처리 중" : state.authMode === "register" ? "익명 계정 만들기" : "기록 불러오기"}</button>
        </form>
        <small class="privacy-note">이 링크는 초대받은 학습자의 자체 연습문항 풀이 테스트 전용입니다.</small>
      </section>
    </main>`;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    state.error = null;
    renderAccess();
  }));
  document.querySelector("#auth-form").addEventListener("submit", submitAuth);
}

async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  if (state.authMode === "register" && form.get("consent") !== "on") {
    state.error = "학습 기록 저장 안내를 확인해 주세요.";
    renderAccess();
    return;
  }
  state.loading = true;
  state.error = null;
  renderAccess();
  try {
    const payload = await api("/api/auth", {
      method: "POST",
      body: JSON.stringify(state.authMode === "register"
        ? { action: "register", nickname: form.get("nickname") }
        : { action: "login", learnerCode: form.get("learnerCode") }),
    });
    state.learner = payload.learner;
    state.issuedCode = payload.learnerCode ?? null;
    if (!state.issuedCode) await startApp();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    if (state.screen !== "app") renderAccess();
  }
}

async function startApp() {
  state.screen = "app";
  state.issuedCode = null;
  state.error = null;
  await Promise.all([loadExam(), loadAttempts()]);
}

async function loadExam() {
  state.loading = true;
  state.error = null;
  state.questions = [];
  state.questionNo = 1;
  state.answers = {};
  state.results = null;
  state.score = null;
  state.attemptNo = null;
  state.startedAt = new Date().toISOString();
  state.submissionId = crypto.randomUUID();
  renderApp();
  try {
    const payload = await api(`/api/exams?set=${state.setNo}&subject=${state.subject}`);
    state.questions = payload.questions;
    state.total = payload.count;
    state.setCount = payload.setCount;
    state.contentNotice = payload.notice;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    renderApp();
  }
}

async function loadAttempts() {
  try {
    const payload = await api("/api/attempts");
    state.attempts = payload.attempts ?? [];
    state.attemptSummaries = payload.summaries ?? [];
  } catch {
    state.attempts = [];
    state.attemptSummaries = [];
  } finally {
    if (state.screen === "app") renderApp();
  }
}

async function loadAnalysis() {
  state.analysisLoading = true;
  state.error = null;
  renderApp();
  try {
    state.analysis = await api("/api/analysis");
  } catch (error) {
    state.error = error.message;
  } finally {
    state.analysisLoading = false;
    renderApp();
  }
}

function renderContext(question) {
  const context = question.context ? `<section class="question-context"><span>${escapeHtml(question.context.label)}</span><p>${escapeHtml(question.context.text)}</p></section>` : "";
  const table = question.dataTable ? `<section class="question-table"><span>${escapeHtml(question.dataTable.label)}</span><div class="table-scroll"><table><thead><tr>${question.dataTable.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${question.dataTable.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>` : "";
  const statements = question.statements?.length ? `<div class="statements">${question.statements.map((item) => `<div><b>${escapeHtml(item.marker)}</b><p>${escapeHtml(item.text)}</p></div>`).join("")}</div>` : "";
  return context + table + statements;
}

function renderFeedback() {
  if (!state.feedbackOpen) return "";
  const context = `실전세트 ${state.setNo} · ${subjectName(state.subject)} · ${state.questionNo}번`;
  if (state.feedbackSuccess) {
    return `<div class="feedback-backdrop" data-close-feedback><section class="feedback-modal feedback-complete" role="dialog" aria-modal="true" aria-labelledby="feedback-title" data-feedback-panel>
      <button class="icon-close" data-close-feedback type="button" aria-label="닫기">×</button>
      <span class="success-mark">✓</span><p class="eyebrow">제보 접수 완료</p><h2 id="feedback-title">확인할 수 있도록 저장했습니다</h2>
      <p>접수번호 <b>${escapeHtml(state.feedbackSuccess)}</b></p><button class="primary" data-close-feedback type="button">학습 계속하기</button>
    </section></div>`;
  }
  return `<div class="feedback-backdrop" data-close-feedback><section class="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title" data-feedback-panel>
    <button class="icon-close" data-close-feedback type="button" aria-label="닫기">×</button>
    <p class="eyebrow">학습자 제보</p><h2 id="feedback-title">어떤 문제가 있었나요?</h2>
    <p class="feedback-context"><b>자동 첨부</b><span>${escapeHtml(context)}</span></p>
    <form id="feedback-form">
      <label><span>문제 종류</span><select name="category">
        <option value="screen" ${state.feedbackDraft.category === "screen" ? "selected" : ""}>화면 또는 작동 오류</option>
        <option value="content" ${state.feedbackDraft.category === "content" ? "selected" : ""}>문제·보기 내용 오류</option>
        <option value="grading" ${state.feedbackDraft.category === "grading" ? "selected" : ""}>정답·채점 확인 요청</option>
        <option value="other" ${state.feedbackDraft.category === "other" ? "selected" : ""}>기타 불편 사항</option>
      </select></label>
      <label><span>발생한 상황</span><textarea name="message" minlength="5" maxlength="1000" rows="6" placeholder="무엇을 하던 중 어떤 문제가 보였는지 적어 주세요." required>${escapeHtml(state.feedbackDraft.message)}</textarea></label>
      <p class="feedback-notice">현재 실전세트·과목·문항, 화면 크기와 최근 기술 오류가 자동 첨부됩니다. 실명과 연락처는 적지 마세요.</p>
      ${state.feedbackError ? `<p class="error" role="alert">${escapeHtml(state.feedbackError)}</p>` : ""}
      <div class="feedback-actions"><button data-close-feedback type="button">취소</button><button class="primary" type="submit" ${state.feedbackSending ? "disabled" : ""}>${state.feedbackSending ? "전송 중" : "제보 보내기"}</button></div>
    </form>
  </section></div>`;
}

function renderStudyHeader() {
  const analysisSummary = state.analysis?.summary;
  const status = state.view === "analysis" && analysisSummary
    ? `전체 ${analysisSummary.savedAttempts}회 저장 · ${analysisSummary.completedSubjectSets}/${analysisSummary.totalSubjectSets}과목 세트`
    : `현재 ${state.setNo}세트 · ${completedSubjectCount(state.setNo)}/3과목 저장`;
  return `<header class="study-header">
    <div class="brand"><span>EC</span><strong>Exam Coach</strong><small>학습자 테스트</small></div>
    <div class="learner-summary"><span><b>${escapeHtml(state.learner?.nickname)}</b><small>${status}</small></span><button id="sign-out" type="button">나가기</button></div>
  </header>`;
}

function renderViewTabs() {
  return `<nav class="view-tabs" aria-label="학습 메뉴">
    <button class="${state.view === "solve" ? "active" : ""}" data-view="solve" type="button">문제 풀이</button>
    <button class="${state.view === "analysis" ? "active" : ""}" data-view="analysis" type="button">내 학습 분석</button>
  </nav>`;
}

function subjectAnalysisRow(subject) {
  const item = state.analysis?.subjectStats?.find((entry) => entry.subjectCode === subject.code);
  const accuracy = item?.accuracy ?? 0;
  return `<div class="performance-row">
    <div><b>${subject.name}</b><span>${item ? `${item.savedAttempts}회 저장 · ${item.correctCount}/${item.answeredCount}문항 정답` : "저장된 풀이 없음"}</span></div>
    <strong>${item ? `${accuracy}%` : "-"}</strong>
    <i><b style="width:${accuracy}%"></b></i>
  </div>`;
}

function renderAnalysisView() {
  const analysis = state.analysis;
  const recentAttempts = state.attempts.filter((item) => item.contentMode === "original_practice").slice(0, 8);
  const focusConcepts = analysis?.focusConcepts ?? [];
  const primaryFocus = focusConcepts[0];
  app.innerHTML = `
    <main class="study-shell">
      ${renderStudyHeader()}
      ${renderViewTabs()}
      <section class="analysis-shell">
        <header class="analysis-title"><div><p class="eyebrow">저장된 풀이 기준</p><h1>내 학습 분석</h1></div>${analysis?.hasData ? `<span>최근 저장 즉시 반영</span>` : ""}</header>
        ${state.error ? `<p class="error global" role="alert">${escapeHtml(state.error)}</p>` : ""}
        ${state.analysisLoading ? `<section class="center-state compact"><i class="spinner"></i><p>저장된 풀이를 분석하고 있습니다.</p></section>` : !analysis?.hasData ? `
          <section class="analysis-empty"><b>아직 분석할 저장 기록이 없습니다.</b><p>한 과목의 6문항을 모두 풀고 <strong>채점하고 저장</strong>을 누르면 이곳에 과목별 정답률과 취약 개념이 표시됩니다.</p><button class="primary" data-view="solve" type="button">첫 문제 풀기</button></section>
        ` : `
          <section class="analysis-metrics" aria-label="학습 요약">
            <div><span>저장한 풀이</span><strong>${analysis.summary.savedAttempts}<small>회</small></strong></div>
            <div><span>전체 정답률</span><strong>${analysis.summary.accuracy}<small>%</small></strong></div>
            <div><span>정답 문항</span><strong>${analysis.summary.correctCount}<small>/${analysis.summary.answeredCount}</small></strong></div>
            <div><span>완료 과목 세트</span><strong>${analysis.summary.completedSubjectSets}<small>/${analysis.summary.totalSubjectSets}</small></strong></div>
          </section>
          <div class="analysis-columns">
            <section class="analysis-section">
              <header><p class="eyebrow">과목별 성취도</p><h2>정답률과 저장 기록</h2></header>
              <div class="performance-list">${subjects.map(subjectAnalysisRow).join("")}</div>
            </section>
            <section class="analysis-section">
              <header><p class="eyebrow">실전세트</p><h2>3과목 완료 현황</h2></header>
              <div class="set-progress-list">${Array.from({ length: state.setCount }, (_, index) => index + 1).map((setNo) => {
                const item = analysis.setStats.find((entry) => entry.setNo === setNo);
                const completed = item?.completedSubjects ?? 0;
                return `<button data-open-set="${setNo}" type="button"><span><b>${setNo}세트</b><small>${completed}/3과목 저장</small></span><strong>${completed === 3 ? "완료" : "이어풀기"}</strong></button>`;
              }).join("")}</div>
            </section>
          </div>
          <section class="analysis-section focus-section">
            <header><p class="eyebrow">오답 개념</p><h2>집중할 개념</h2></header>
            ${focusConcepts.length ? `<div class="focus-list">${focusConcepts.map((item, index) => `<div><span>${index + 1}</span><p><small>${subjectName(item.subjectCode)} · ${escapeHtml(item.domain)}</small><b>${escapeHtml(item.concept)}</b><em>기출 수준 표준어 · ${item.wrongCount}회 오답 · 정답률 ${item.accuracy}%</em></p></div>`).join("")}</div>` : `<p class="analysis-positive">현재 저장된 문항에는 반복 오답 개념이 없습니다.</p>`}
            ${primaryFocus ? `<div class="next-action"><span>다음 학습 행동</span><strong>${escapeHtml(primaryFocus.concept)}의 적용 요건과 유사 개념을 구분한 뒤 같은 키워드 문항을 다시 풉니다.</strong><button data-open-subject="${primaryFocus.subjectCode}" type="button">관련 과목 풀기</button></div>` : ""}
          </section>
          <section class="analysis-section recent-section">
            <header><p class="eyebrow">최근 기록</p><h2>저장한 풀이</h2></header>
            <div class="recent-attempts">${recentAttempts.map((item) => `<div><span>${item.setNo}세트 · ${subjectName(item.subjectCode)}</span><b>${item.score}/${item.total}</b><small>${item.attemptNo}회차</small></div>`).join("")}</div>
          </section>
        `}
      </section>
    </main>
    <button class="feedback-launcher" id="open-feedback" type="button"><b>!</b><span>오류 제보</span></button>
    ${renderFeedback()}`;
  bindAppEvents();
}

function renderApp() {
  if (state.screen !== "app") return;
  if (state.view === "analysis") {
    renderAnalysisView();
    return;
  }
  const question = state.questions.find((item) => item.questionNo === state.questionNo);
  const answered = Object.keys(state.answers).length;
  const submitted = Boolean(state.results);
  const attemptLabel = submitted ? `${state.attemptNo}회차 저장 완료` : `${currentAttemptNo()}회차 풀이 중`;
  app.innerHTML = `
    <main class="study-shell">
      ${renderStudyHeader()}
      ${renderViewTabs()}
      <section class="study-title"><div><p class="eyebrow">실전세트 ${state.setNo} · ${subjectName(state.subject)} · ${attemptLabel}</p><h1>${submitted ? "채점 결과를 확인하세요" : "핵심개념을 빠르게 점검하세요"}</h1></div><div class="score-box"><span>${submitted ? "점수" : "응답"}</span><strong>${submitted ? state.score : answered}<small>/${state.total}</small></strong></div></section>
      <section class="exam-controls">
        <label><span>연습세트</span><select id="set-select">${Array.from({ length: state.setCount }, (_, index) => index + 1).map((setNo) => `<option value="${setNo}" ${setNo === state.setNo ? "selected" : ""}>${setNo}세트</option>`).join("")}</select></label>
        <div class="subject-tabs">${subjects.map((subject) => `<button class="${subject.code === state.subject ? "active" : ""}" data-subject="${subject.code}" type="button"><span>${subject.name}</span><small>${subjectSaveLabel(subject.code)}</small></button>`).join("")}</div>
        <div class="progress"><span>진행률</span><strong>${answered}/${state.total}</strong><i><b style="width:${answered / Math.max(1, state.total) * 100}%"></b></i></div>
      </section>
      <p class="content-notice"><b>자체 제작 문항</b><span>${escapeHtml(state.contentNotice)}</span></p>
      ${state.error ? `<p class="error global" role="alert">${escapeHtml(state.error)}</p>` : ""}
      ${state.loading || !question ? `<section class="center-state compact"><i class="spinner"></i><p>연습문항을 불러오고 있습니다.</p></section>` : `
        <section class="exam-grid">
          <aside class="navigator">
            <div><p class="eyebrow">문항 이동</p><h2>${state.total}문항</h2></div>
            <div class="number-grid">${state.questions.map((item) => {
              const answer = state.answers[item.id];
              const result = state.results?.[item.id];
              const className = [item.questionNo === state.questionNo ? "current" : "", answer ? "answered" : "", result ? result.correct ? "correct" : "wrong" : ""].join(" ");
              return `<button class="${className}" data-question="${item.questionNo}" type="button">${item.questionNo}</button>`;
            }).join("")}</div>
            ${submitted ? `<div class="result-card saved"><span>저장 완료</span><strong>${state.score}<small>/${state.total}</small></strong><p>${state.attemptNo}회차 풀이가 서버에 저장됐습니다.</p><div class="result-actions"><button id="new-attempt" type="button">다시 풀기</button><button class="primary" data-view="analysis" type="button">내 학습 분석</button></div></div>` : `<div class="finish-card"><div class="save-guide ${answered === state.total ? "ready" : ""}"><b>${answered === state.total ? "저장 준비 완료" : "아직 저장 전"}</b><span>${state.total}문항을 모두 풀고 <strong>채점하기</strong>를 누르면 이 풀이가 자동 저장됩니다.</span></div><button id="finish-exam" class="primary" ${answered !== state.total ? "disabled" : ""} type="button">${state.loading ? "채점·저장 중" : `${state.total}문항 채점하고 저장`}</button><p>${answered === state.total ? "정답 공개와 저장이 동시에 진행됩니다." : `남은 ${state.total - answered}문항을 완료해 주세요.`}</p></div>`}
          </aside>
          <article class="question-panel">
            <p class="question-meta">Q${question.questionNo} · 실전세트 ${state.setNo} ${subjectName(state.subject)}</p>
            <h2>${escapeHtml(question.prompt)}</h2>
            ${renderContext(question)}
            <div class="choices">${symbols.map((symbol) => {
              const selected = state.answers[question.id] === symbol;
              const correct = state.results?.[question.id]?.acceptedAnswers.includes(symbol);
              const wrong = submitted && selected && !correct;
              return `<button class="${selected ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}" data-choice="${symbol}" ${submitted ? "disabled" : ""} type="button"><b>${symbol}</b><span>${escapeHtml(question.choices[symbol])}</span></button>`;
            }).join("")}</div>
            ${submitted ? `<section class="answer-band ${state.results[question.id].correct ? "correct" : "wrong"}"><span>${state.results[question.id].correct ? "정답" : "오답"}</span><strong>공식 정답 ${state.results[question.id].acceptedAnswers.join(" · ")}</strong></section>` : ""}
            <footer class="pager"><button id="previous" ${state.questionNo === 1 ? "disabled" : ""} type="button">이전</button><span>${state.questionNo} / ${state.total}</span><button id="next" ${state.questionNo === state.total ? "disabled" : ""} type="button">다음</button></footer>
          </article>
        </section>`}
    </main>
    <button class="feedback-launcher" id="open-feedback" type="button"><b>!</b><span>오류 제보</span></button>
    ${renderFeedback()}`;
  bindAppEvents();
}

function bindAppEvents() {
  document.querySelector("#sign-out")?.addEventListener("click", async () => {
    await api("/api/auth", { method: "DELETE" });
    Object.assign(state, { screen: "access", view: "solve", learner: null, issuedCode: null, analysis: null, error: null });
    renderAccess();
  });
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", async () => {
    const view = button.dataset.view;
    if (view === state.view && view !== "analysis") return;
    state.view = view;
    if (view === "analysis") await loadAnalysis();
    else renderApp();
  }));
  document.querySelectorAll("[data-open-set]").forEach((button) => button.addEventListener("click", async () => {
    state.setNo = Number(button.dataset.openSet);
    state.view = "solve";
    await loadExam();
  }));
  document.querySelectorAll("[data-open-subject]").forEach((button) => button.addEventListener("click", async () => {
    state.subject = button.dataset.openSubject;
    state.view = "solve";
    await loadExam();
  }));
  document.querySelector("#set-select")?.addEventListener("change", async (event) => {
    state.setNo = Number(event.target.value);
    await loadExam();
  });
  document.querySelectorAll("[data-subject]").forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.subject === state.subject) return;
    state.subject = button.dataset.subject;
    await loadExam();
  }));
  document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
    state.questionNo = Number(button.dataset.question);
    renderApp();
  }));
  document.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => {
    const question = state.questions.find((item) => item.questionNo === state.questionNo);
    if (!question || state.results) return;
    state.answers[question.id] = button.dataset.choice;
    if (state.questionNo < state.total) state.questionNo += 1;
    renderApp();
  }));
  document.querySelector("#previous")?.addEventListener("click", () => { state.questionNo = Math.max(1, state.questionNo - 1); renderApp(); });
  document.querySelector("#next")?.addEventListener("click", () => { state.questionNo = Math.min(state.total, state.questionNo + 1); renderApp(); });
  document.querySelector("#finish-exam")?.addEventListener("click", finishExam);
  document.querySelector("#new-attempt")?.addEventListener("click", loadExam);
  document.querySelector("#open-feedback")?.addEventListener("click", () => {
    state.feedbackOpen = true;
    state.feedbackError = null;
    state.feedbackSuccess = null;
    renderApp();
  });
  document.querySelectorAll("[data-close-feedback]").forEach((element) => element.addEventListener("click", (event) => {
    if (event.target.closest("[data-feedback-panel]") && !event.target.closest("[data-close-feedback]")) return;
    state.feedbackOpen = false;
    state.feedbackSending = false;
    renderApp();
  }));
  document.querySelector("[data-feedback-panel]")?.addEventListener("click", (event) => event.stopPropagation());
  document.querySelector("#feedback-form")?.addEventListener("submit", submitFeedback);
}

async function submitFeedback(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.feedbackDraft = {
    category: String(form.get("category") ?? "other"),
    message: String(form.get("message") ?? "").trim(),
  };
  state.feedbackSending = true;
  state.feedbackError = null;
  renderApp();
  try {
    const payload = await api("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        ...state.feedbackDraft,
        setNo: state.setNo,
        subject: state.subject,
        questionNo: state.questionNo,
        pagePath: location.pathname,
        clientError: state.lastClientError,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      }),
    });
    state.feedbackSuccess = payload.reportCode;
    state.feedbackDraft = { category: "screen", message: "" };
    state.lastClientError = null;
  } catch (error) {
    state.feedbackError = error.message;
  } finally {
    state.feedbackSending = false;
    renderApp();
  }
}

async function finishExam() {
  if (Object.keys(state.answers).length !== state.total || state.results) return;
  state.loading = true;
  renderApp();
  try {
    const payload = await api("/api/exams", {
      method: "POST",
      body: JSON.stringify({
        setNo: state.setNo,
        subject: state.subject,
        answers: state.answers,
        startedAt: state.startedAt,
        clientSubmissionId: state.submissionId,
      }),
    });
    state.results = payload.results;
    state.score = payload.score;
    state.attemptNo = payload.persistence.attemptNo;
    state.analysis = null;
    state.learner.attemptCount += 1;
    state.learner.answerCount += state.total;
    const firstWrong = state.questions.find((question) => !state.results[question.id].correct);
    state.questionNo = firstWrong?.questionNo ?? 1;
    await loadAttempts();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    renderApp();
  }
}

async function boot() {
  renderLoading();
  try {
    const payload = await api("/api/auth");
    if (payload.authenticated && payload.learner) {
      state.learner = payload.learner;
      await startApp();
    } else {
      state.screen = "access";
      renderAccess();
    }
  } catch {
    state.screen = "access";
    state.error = "학습자 서비스를 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    renderAccess();
  }
}

boot();
