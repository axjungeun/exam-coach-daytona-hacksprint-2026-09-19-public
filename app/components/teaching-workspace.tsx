"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Download, Upload, ScanText, Check, FileText } from "lucide-react";
import { analyzeWriting, compareWriting, createTeachingStore, latestForUnit, sampleUnit, validTeachingStore, type TeachingStore, type Submission, type TeachingUnit } from "../lib/essay-review";
import { readAnswerDocument, type AnswerPage } from "../lib/answer-document";
import { secondExamSubjects, unitsForSubject, type SecondSubject } from "../lib/essay-review";
import { SecondExamCases } from "./second-exam-cases";

const STORAGE = "exam-coach-teaching-v1";

export function TeachingWorkspace({ onLegacy, initialTab = "overview" }: { onLegacy?: () => void; initialTab?: "overview" | "answers" | "settings" }) {
  const [store, setStore] = useState<TeachingStore>(createTeachingStore);
  const [subject, setSubject] = useState<SecondSubject | "UNASSIGNED">("MEDICAL");
  const [ready, setReady] = useState(false);
  const [unitId, setUnitId] = useState(sampleUnit.id);
  const [selectedId, setSelectedId] = useState("demo-a");
  const [tab, setTab] = useState<"overview" | "answers" | "settings">(initialTab);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [newUnit, setNewUnit] = useState(false);
  const [learner, setLearner] = useState("");
  const [answer, setAnswer] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [source, setSource] = useState("직접 입력");
  const [pages, setPages] = useState<AnswerPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [ocrAvailable, setOcrAvailable] = useState(false);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState("");
  const [intervention, setIntervention] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const subjectUnits = unitsForSubject(store.units, subject);
  const unit = subjectUnits.find(u => u.id === unitId) ?? subjectUnits[0];
  const submissions = store.submissions.filter(s => s.unitId === unit?.id);
  const latest = unit ? latestForUnit(store.submissions, unit) : [];
  const selected = submissions.find(s => s.id === selectedId);
  const result = selected ? analyzeWriting(selected.answer, selected.rubric) : null;
  const comparison = selected ? compareWriting(selected, store.submissions) : null;
  const actions = store.interventions.filter(i => i.unitId === unit?.id);
  const needs = unit?.rubric.map(r => ({ ...r, count: latest.filter(s => !analyzeWriting(s.answer, s.rubric).rows.find(row => row.id === r.id)?.mentioned).length })).sort((a,b) => b.count-a.count) ?? [];

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate browser storage after SSR and report external storage failures. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (!validTeachingStore(parsed) || !parsed.units.length) throw new Error();
        setStore(parsed); setUnitId(parsed.units[0].id); setSelectedId("");
      }
      setReady(true);
    } catch { setSaveError("저장 기록을 읽지 못했습니다. 기존 기록 보호를 위해 자동 저장을 중지했습니다."); }
    fetch("/api/essay-ocr").then(r => r.json()).then(p => setOcrAvailable(p.available === true)).catch(() => setOcrAvailable(false));
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE, JSON.stringify(store)); setSaveError(""); }
    catch { setSaveError("브라우저에 저장하지 못했습니다. 기록 내보내기로 백업하세요."); }
  }, [store, ready]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function clearDraft() {
    setLearner(""); setAnswer(""); setOriginalText(""); setSource("직접 입력");
    setPages([]); setPageIndex(0); setConsent(false); setConfirmed(false); setError(""); setMessage("");
  }
  function selectUnit(id: string) {
    setUnitId(id); setSelectedId(""); setFeedback(""); setIntervention(""); clearDraft();
  }
  function chooseSubmission(s: Submission) { setSelectedId(s.id); setFeedback(s.feedback); setTab("answers"); }

  async function loadFile(file?: File) {
    if (!file) return;
    setBusy("파일 읽는 중"); setError("");
    try {
      const doc = await readAnswerDocument(file);
      setPages(doc.pages); setPageIndex(0); setAnswer(doc.text ?? ""); setOriginalText(doc.text ?? "");
      setSource(doc.text !== null ? "텍스트 파일" : "OCR 대기"); setConfirmed(false); setConsent(false); setSelectedId("");
    } catch (e) { setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다."); }
    finally { setBusy(""); }
  }
  async function runOcr() {
    if (!pages.length || !consent || !ocrAvailable) return;
    setBusy("OCR 인식 중"); setError(""); setConfirmed(false);
    const texts: string[] = [];
    try {
      for (const page of pages) {
        setBusy(`${page.number}/${pages.length}페이지 OCR 인식 중`);
        const response = await fetch("/api/essay-ocr", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: page.image, consent: true }), signal: AbortSignal.timeout(70_000) });
        const payload = await response.json();
        if (!response.ok || typeof payload.text !== "string") throw new Error(payload.error ?? "OCR 인식 실패");
        texts.push(payload.text);
      }
      const text = texts.join("\n\n");
      if (text.length > 20000) throw new Error("인식 결과가 20,000자를 넘었습니다. 파일을 나누어 주세요.");
      setOriginalText(text); setAnswer(text); setSource("Qwen OCR · 원문 확인 필요");
      setMessage("추출 텍스트를 원본과 대조한 뒤 확인해 주세요.");
    } catch (e) { setError(e instanceof Error ? e.message : "OCR 인식 실패"); }
    finally { setBusy(""); }
  }
  function submitAnswer() {
    if (!unit || busy) return;
    if (!learner.trim() || !answer.trim()) { setError("학습자 식별자와 답안을 입력하세요."); return; }
    if (pages.length && !confirmed) { setError("원본과 텍스트를 대조한 뒤 확인란을 선택하세요."); return; }
    if (answer.length > 20000 || store.submissions.length >= 500) { setError("답안은 20,000자, 저장 기록은 500건까지 지원합니다."); return; }
    const record: Submission = { id: crypto.randomUUID(), unitId: unit.id, learner: learner.trim(), answer: answer.trim(),
      originalText: originalText || answer.trim(), source: pages.length ? (source === "OCR 대기" ? "원본 대조 · 수기 입력" : source.replace("원문 확인 필요", "원문 확인 완료")) : source,
      createdAt: new Date().toISOString(), prompt: unit.prompt, rubricVersion: unit.version, rubric: unit.rubric, review: "pending", feedback: "" };
    setStore(s => ({ ...s, submissions: [...s.submissions, record] }));
    setSelectedId(record.id); setFeedback(""); setError(""); setMessage("답안 분석 완료 · 강사 검토 대기");
  }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "exam-coach-teaching.json"; a.click(); URL.revokeObjectURL(url);
  }
  async function importData(file?: File) {
    if (!file) return;
    try {
      if (file.size > 15_000_000) throw new Error();
      const data: unknown = JSON.parse(await file.text());
      if (!validTeachingStore(data) || !data.units.length) throw new Error();
      // Import as new units to preserve both histories and keep provenance intact.
      const ids = new Map(data.units.map(u => [u.id, crypto.randomUUID()]));
      if (store.units.length + data.units.length > 50 || store.submissions.length + data.submissions.length > 500) throw new Error();
      setStore(s => ({ ...s,
        units: [...s.units, ...data.units.map(u => ({ ...u, id: ids.get(u.id)!, cohort: `${u.cohort} (가져옴)` }))],
        submissions: [...s.submissions, ...data.submissions.map(r => ({ ...r, id: crypto.randomUUID(), unitId: ids.get(r.unitId)! }))],
        interventions: [...s.interventions, ...data.interventions.filter(i => ids.has(i.unitId)).map(i => ({ ...i, id: crypto.randomUUID(), unitId: ids.get(i.unitId)! }))],
      }));
      setReady(true); setError(""); setMessage("기존 기록을 유지하고 별도 반으로 가져왔습니다.");
    } catch { setError("지원하지 않는 백업 형식이거나 저장 한도를 초과했습니다."); }
  }

  return <section className="teaching-workspace" aria-label="강사 작업실">
    <fieldset className="second-subject-picker">
      <legend>신체손해사정사 2차 · 과목</legend>
      <div>{secondExamSubjects.map(s => <label key={s.code}>
        <input type="radio" name="second-subject" value={s.code} checked={subject === s.code} disabled={Boolean(busy)} onChange={() => { setSubject(s.code); selectUnit(""); setNewUnit(false); }} />
        <span><strong>{s.name}</strong>{"detail" in s && <small>{s.detail}</small>}</span>
      </label>)}</div>
    </fieldset>
    {subject !== "UNASSIGNED" && <SecondExamCases subject={subject} />}
    {store.units.some(u => !u.subjectCode) && <button className="unassigned-subject" aria-pressed={subject === "UNASSIGNED"} disabled={Boolean(busy)} type="button" onClick={() => { setSubject("UNASSIGNED"); selectUnit(""); setNewUnit(false); }}>과목 미지정 기록 · 합성 예시</button>}
    <div className="teaching-toolbar">
      <label>내 강좌 · 반 · 과제<select disabled={Boolean(busy) || !unit} value={unit?.id ?? ""} onChange={e => selectUnit(e.target.value)}>{!unit && <option value="">등록된 과제 없음</option>}{subjectUnits.map(u => <option key={u.id} value={u.id}>{u.course} / {u.cohort}{u.assignmentTitle ? ` / ${u.assignmentTitle}` : ""}{u.origin === "synthetic" ? " · 합성" : ""}</option>)}</select></label>
      <button onClick={() => setNewUnit(v => !v)} disabled={Boolean(busy)} type="button"><Plus />강좌·반 추가</button>
      <button title="답안과 강사 기록을 JSON으로 내보내기" aria-label="기록 내보내기" onClick={exportData} type="button"><Download /></button>
      <button title="백업을 별도 반으로 가져오기" aria-label="기록 가져오기" disabled={Boolean(busy)} onClick={() => importRef.current?.click()} type="button"><Upload /></button>
      <input ref={importRef} hidden type="file" accept=".json" onChange={e => { void importData(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
    {newUnit && <form className="teaching-unit-form" onSubmit={e => {
      e.preventDefault(); const form = new FormData(e.currentTarget);
      if (store.units.length >= 50) { setError("관리 단위는 최대 50개입니다."); return; }
      const u: TeachingUnit = { ...sampleUnit, id: crypto.randomUUID(), course: String(form.get("course")).trim(), cohort: String(form.get("cohort")).trim(), instructor: String(form.get("instructor")).trim(), assignmentTitle: String(form.get("assignmentTitle")).trim(), prompt: String(form.get("prompt")).trim(), subjectCode: subject === "UNASSIGNED" ? undefined : subject, version: crypto.randomUUID(), origin: "user" };
      if (!u.course || !u.cohort || !u.instructor) return;
      setStore(s => ({ ...s, units: [...s.units, u] })); selectUnit(u.id); setNewUnit(false); setTab("settings");
    }}>
      <label>강좌명<input name="course" required maxLength={60} /></label><label>반·기수<input name="cohort" required maxLength={40} /></label><label>담당 강사<input name="instructor" required maxLength={40} /></label>
      <label>문제 번호·제목<input name="assignmentTitle" required maxLength={100} /></label>
      <label>문제 원문<textarea name="prompt" required maxLength={4000} /></label><button type="submit">만들기</button>
    </form>}
    {unit ? <>
    <p className="teaching-origin">{unit.instructor} · {unit.origin === "synthetic" ? "합성 시연반 · 실제 학습 성과 아님" : "직접 등록한 반 · 입력 자료의 진위 미검증"} · 이 브라우저에 저장</p>
    {saveError && <p role="alert" className="analysis-error">{saveError}</p>}
    {error && <p role="alert" className="analysis-error">{error}</p>}
    <p role="status" className="teaching-status">{busy || message}</p>
    <div className="teaching-tabs" role="tablist" aria-label="강사 관리 단계">{([
      ["overview", "반 현황·보강"], ["answers", "답안 읽기·분석"], ["settings", "과제·검토 기준"],
    ] as const).map(([id,label]) => <button role="tab" type="button" aria-selected={tab === id} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>

    {tab === "overview" && <div className="teaching-overview">
      <dl className="teaching-metrics"><div><dt>제출 학습자</dt><dd>{latest.length}명</dd></div><div><dt>답안 이력</dt><dd>{submissions.length}건</dd></div><div><dt>최신 답안 검토 대기</dt><dd>{latest.filter(s => s.review === "pending").length}건</dd></div><div><dt>보강 기록</dt><dd>{actions.length}건</dd></div></dl>
      <h2>먼저 확인할 논점</h2><p>현재 기준 {unit.version} · 학습자별 최신 답안 · 키워드 미감지 인원</p>
      {latest.length === 0 ? <p className="teaching-empty">이 반에 등록된 답안이 없습니다. 답안을 읽어 첫 검토를 시작하세요.</p> : needs.map(n => <div className="teaching-need" key={n.id}><strong>{n.label}</strong><span>{n.count}/{latest.length}명 미감지</span><button type="button" onClick={() => { setIntervention(`${n.label}: 근거 문장을 함께 검토하고 같은 과제의 재답안을 받는다.`); }}>보강안 작성</button></div>)}
      <button className="primary-button" type="button" onClick={() => setTab("answers")}><FileText />답안 등록·검토</button>
      <h2>보강 이력</h2>
      <form className="teaching-action" onSubmit={e => { e.preventDefault(); if (!intervention.trim()) return; setStore(s => ({ ...s, interventions: [...s.interventions, { id: crypto.randomUUID(), unitId: unit.id, note: intervention.trim(), createdAt: new Date().toISOString() }] })); setIntervention(""); setMessage("이 반의 보강 기록을 저장했습니다."); }}>
        <label>실행한 보강·다음 확인<textarea value={intervention} onChange={e => setIntervention(e.target.value)} required maxLength={2000} /></label><button type="submit">보강 기록 저장</button>
      </form>
      {actions.length ? actions.slice().reverse().map(a => <article className="teaching-action-record" key={a.id}><time>{new Date(a.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time><p>{a.note}</p></article>) : <p>아직 보강 기록이 없습니다.</p>}
      {onLegacy && <details><summary>기존 객관식 합성 집계</summary><p>현재 반의 데이터와 별개인 50명 합성 시연 자료입니다.</p><button type="button" onClick={onLegacy}>객관식 강의 인사이트 열기</button></details>}
    </div>}

    {tab === "settings" && <form key={unit.id + unit.version} className="teaching-settings" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget); const prompt = String(f.get("prompt")).trim();
      const rows = String(f.get("rubric")).trim().split("\n").filter(Boolean).map((line,i) => { const [label,...rest] = line.split("|"); return { id: `criterion-${i}`, label: label.trim(), terms: rest.join("|").split(",").map(t => t.trim()).filter(Boolean) }; });
      if (!prompt || rows.length < 1 || rows.length > 12 || rows.some(r => !r.label || !r.terms.length)) { setError("각 줄에 논점 | 감지어, 감지어 형식으로 1~12개 기준을 입력하세요."); return; }
      setStore(s => ({ ...s, units: s.units.map(u => u.id === unit.id ? { ...u, prompt, rubric: rows, version: crypto.randomUUID() } : u) })); setError(""); setMessage("새 기준 버전을 저장했습니다. 기존 답안은 당시 기준으로 보존합니다.");
    }}>
      <h2>이 반의 주관식 과제</h2><label>문제·과제<textarea name="prompt" defaultValue={unit.prompt} required maxLength={4000} /></label>
      <label>강사 검토 기준<textarea name="rubric" defaultValue={unit.rubric.map(r => `${r.label} | ${r.terms.join(", ")}`).join("\n")} required maxLength={4000} /></label>
      <p>논점 | 감지어, 감지어 · 한 줄에 한 논점. 키워드 감지는 정답 판정이 아닙니다.</p><button type="submit">새 기준 버전 저장</button>
    </form>}

    {tab === "answers" && <>
      <p className="teaching-prompt"><strong>과제</strong>{unit.prompt}</p>
      <div className="teaching-answer-grid">
        <section className="teaching-input">
          <h2>주관식 답안 읽기</h2>
          <label>학습자 식별자<input value={learner} onChange={e => setLearner(e.target.value)} maxLength={40} placeholder="예: A-01 (실명 대신 별칭)" disabled={Boolean(busy)} /></label>
          <label>답안 파일<input type="file" accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp" disabled={Boolean(busy)} onChange={e => { void loadFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <p>사진·스캔 PDF 최대 5쪽 / 10MB · TXT·MD 지원</p>
          {pages.length > 0 && <>
            <div className="teaching-page-controls"><label>원본 페이지<select value={pageIndex} onChange={e => setPageIndex(Number(e.target.value))}>{pages.map((p,i) => <option key={p.number} value={i}>{p.number} / {pages.length}</option>)}</select></label></div>
            {/* Uploaded originals stay in browser memory and are not persisted in backups. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="teaching-original" src={pages[pageIndex]?.image} alt={`답안 원본 ${pageIndex + 1}페이지`} />
            <label className="teaching-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={Boolean(busy)} />개인정보를 제거했고, 답안 이미지를 Qwen OCR로 전송하는 데 동의합니다.</label>
            <button type="button" disabled={!consent || !ocrAvailable || Boolean(busy)} onClick={() => void runOcr()}><ScanText />{busy || "사진·스캔 읽기"}</button>
            {!ocrAvailable && <p role="status">OCR 서버 연결이 필요합니다. 원본을 보며 텍스트를 입력할 수 있습니다.</p>}
          </>}
          <label>답안 텍스트<textarea value={answer} onChange={e => { setAnswer(e.target.value); setConfirmed(false); }} maxLength={20000} disabled={Boolean(busy)} placeholder="답안을 붙여넣거나 OCR로 읽어 주세요." /></label>
          {pages.length > 0 && <label className="teaching-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />원본과 추출 텍스트를 대조·수정했습니다.</label>}
          <button className="primary-button" type="button" disabled={Boolean(busy) || !answer.trim() || !learner.trim() || (pages.length > 0 && !confirmed)} onClick={submitAnswer}><FileText />답안 분석·등록</button>
        </section>
        <section className="teaching-results">
          <h2>논점별 근거와 강사 검토</h2><p>규칙 기반 사전 검토 · 키워드 언급 여부만 탐지 · 법적 타당성·점수는 강사 판단</p>
          <label>등록 답안<select value={selected?.id ?? ""} onChange={e => { const s = submissions.find(s => s.id === e.target.value); if(s) chooseSubmission(s); }}><option value="">답안을 선택하세요</option>{submissions.slice().reverse().map(s => <option key={s.id} value={s.id}>{s.learner} · {new Date(s.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · {s.review === "reviewed" ? "검토 완료" : "검토 대기"}</option>)}</select></label>
          {selected && result ? <>
            <p>{selected.source} · 논점 언급 {result.mentionedCount}/{result.rows.length} · {selected.rubricVersion === unit.version ? "현재 기준" : "이전 기준"}</p>
            {selected.rubricVersion !== unit.version && <p>제출 당시 과제: {selected.prompt ?? "이전 기록에 과제 원문이 저장되지 않았습니다."}</p>}
            {result.unresolved && <p role="alert">판독불가 구간이 있습니다. 해당 논점은 원문 재확인이 필요합니다.</p>}
            {result.rows.map(row => <article className="teaching-rubric" key={row.id}><header><strong>{row.label}</strong><span>{row.mentioned ? "관련 표현 감지" : "표현 미감지"}</span></header>{row.evidence.length ? row.evidence.map((s,i) => <blockquote key={i}>{s}</blockquote>) : <p>관련 표현을 찾지 못했습니다. 다른 표현으로 서술했는지 원문을 확인하세요.</p>}{row.caution && <p className="teaching-caution">부정·단정·판독불가 표현 포함: 강사 확인 필요</p>}</article>)}
            <details><summary>답안 원문·OCR 추출본</summary><h3>분석한 답안</h3><pre>{selected.answer}</pre><h3>최초 입력·추출본</h3><pre>{selected.originalText}</pre></details>
            <div className="teaching-comparison"><h3>같은 학습자의 재제출 비교</h3>{comparison ? <p>논점 언급 {comparison.before} → {comparison.after} / {selected.rubric.length} · 같은 반·같은 기준. 학습 효과나 정답률을 의미하지 않습니다.</p> : <p>동일 학습자·반·기준의 이전 답안이 없어 비교 대기 중입니다.</p>}</div>
            <label>강사 피드백<textarea value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={2000} /></label>
            <button type="button" onClick={() => { setStore(s => ({ ...s, submissions: s.submissions.map(r => r.id === selected.id ? { ...r, review: "reviewed", feedback } : r) })); setMessage("강사 검토와 피드백을 저장했습니다."); }}><Check />검토 완료·피드백 저장</button>
            <button type="button" onClick={() => { setLearner(selected.learner); setAnswer(""); setOriginalText(""); setPages([]); setConfirmed(false); setSource("재제출 직접 입력"); setMessage("같은 학습자의 새 답안을 입력하세요. 이전 답안은 유지됩니다."); }}>이 학습자 재답안 등록</button>
          </> : <p className="teaching-empty">등록된 답안을 선택하거나 새 답안을 분석하세요.</p>}
        </section>
      </div>
    </>}
    </> : <p className="teaching-empty">별도로 등록한 검토 과제가 없습니다.</p>}
    {!unit && error && <p role="alert">{error}</p>}
    {!unit && saveError && <p role="alert">{saveError}</p>}
  </section>;
}
