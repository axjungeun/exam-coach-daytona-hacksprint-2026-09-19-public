export type Rubric = { id: string; label: string; terms: string[] };
export const secondExamSubjects = [
  { code: "MEDICAL", name: "의학이론" },
  { code: "LIABILITY", name: "책임보험·근로자재해보상보험의 이론과 실무" },
  { code: "AUTO", name: "자동차보험의 이론과 실무", detail: "대인배상 및 자기신체손해" },
  { code: "THIRD", name: "제3보험의 이론과 실무" },
] as const;
export type SecondSubject = typeof secondExamSubjects[number]["code"];
export function isSecondSubject(value: unknown): value is SecondSubject {
  return secondExamSubjects.some(s => s.code === value);
}
export function unitsForSubject(units: TeachingUnit[], subject: SecondSubject | "UNASSIGNED") {
  return units.filter(u => subject === "UNASSIGNED" ? !u.subjectCode : u.subjectCode === subject);
}
export type TeachingUnit = {
  id: string; course: string; cohort: string; instructor: string;
  subjectCode?: SecondSubject;
  assignmentTitle?: string;
  prompt: string; rubric: Rubric[]; version: string; origin: "synthetic" | "user";
};
export type Submission = {
  id: string; unitId: string; learner: string; answer: string; originalText: string;
  source: string; createdAt: string; rubricVersion: string; rubric: Rubric[];
  review: "pending" | "reviewed"; feedback: string;
  prompt?: string;
};
export type Intervention = { id: string; unitId: string; note: string; createdAt: string };
export type TeachingStore = { version: 1; units: TeachingUnit[]; submissions: Submission[]; interventions: Intervention[] };

export const sampleUnit: TeachingUnit = {
  id: "demo-contract-writing", course: "상법·계약 서술형", cohort: "시연반", instructor: "데모 강사",
  prompt: "계약 분쟁의 사실관계, 적용 기준, 사안 적용과 결론을 구분하여 답안을 작성하시오. 이 문항은 구조 분석용 독립 제작 예시입니다.",
  rubric: [
    { id: "facts", label: "사실관계", terms: ["당사자", "계약", "사실"] },
    { id: "grounds", label: "판단 근거", terms: ["근거", "요건", "기준"] },
    { id: "application", label: "사안 적용", terms: ["이 사안", "적용", "해당"] },
    { id: "conclusion", label: "결론", terms: ["따라서", "결론", "그러므로"] },
  ], version: "structure-v1", origin: "synthetic",
};
export const sampleText = "당사자 사이에 계약이 체결되었다. 판단 근거와 요건을 먼저 확인해야 한다. 이 사안의 사실관계에 기준을 적용한다. 따라서 충족 여부에 따라 결론을 구분한다.";

export function analyzeWriting(answer: string, rubric: Rubric[]) {
  const sentences = answer.split(/(?<=[.!?。！？])\s*|\n+/u).map(s => s.trim()).filter(Boolean);
  const rows = rubric.map(item => {
    const evidence = sentences.filter(s => item.terms.some(term => s.includes(term)));
    const caution = evidence.some(s => /않|아니|없|못|무조건|항상|반드시|판독불가/.test(s));
    return { ...item, evidence, mentioned: evidence.length > 0, caution };
  });
  return {
    rows, sentences, mentionedCount: rows.filter(r => r.mentioned).length,
    missing: rows.filter(r => !r.mentioned).map(r => r.label),
    unresolved: answer.includes("[판독불가]"),
  };
}

export function latestForUnit(submissions: Submission[], unit: TeachingUnit) {
  const latest = new Map<string, Submission>();
  for (const s of submissions) {
    if (s.unitId !== unit.id || s.rubricVersion !== unit.version) continue;
    const prior = latest.get(s.learner);
    if (!prior || s.createdAt >= prior.createdAt) latest.set(s.learner, s);
  }
  return [...latest.values()];
}

export function compareWriting(current: Submission, submissions: Submission[]) {
  const previous = submissions.filter(s => s.id !== current.id && s.unitId === current.unitId
    && s.learner === current.learner && s.rubricVersion === current.rubricVersion
    && s.createdAt < current.createdAt).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!previous) return null;
  return { previous, before: analyzeWriting(previous.answer, previous.rubric).mentionedCount,
    after: analyzeWriting(current.answer, current.rubric).mentionedCount };
}

export function createTeachingStore(): TeachingStore {
  return { version: 1, units: [sampleUnit], interventions: [], submissions: [
    { id: "demo-a", unitId: sampleUnit.id, learner: "시연-01", answer: "당사자 사이에 계약이 체결되었다. 따라서 결론을 정리한다.", originalText: "당사자 사이에 계약이 체결되었다. 따라서 결론을 정리한다.", source: "합성 예시", createdAt: "2026-09-18T00:00:00Z", rubricVersion: sampleUnit.version, rubric: sampleUnit.rubric, review: "pending", feedback: "" },
    { id: "demo-b", unitId: sampleUnit.id, learner: "시연-02", answer: sampleText, originalText: sampleText, source: "합성 예시", createdAt: "2026-09-18T00:01:00Z", rubricVersion: sampleUnit.version, rubric: sampleUnit.rubric, review: "pending", feedback: "" },
  ] };
}

export function validTeachingStore(value: unknown): value is TeachingStore {
  if (!value || typeof value !== "object") return false;
  const s = value as TeachingStore;
  const validRubric = (r: unknown): r is Rubric[] => Array.isArray(r) && r.length > 0 && r.length <= 12 && r.every(x =>
    x && typeof x.id === "string" && typeof x.label === "string" && Array.isArray(x.terms) && x.terms.length > 0 && x.terms.every((t: unknown) => typeof t === "string" && t.length > 0));
  return s.version === 1 && Array.isArray(s.units) && s.units.length <= 50 && s.units.every(u =>
    u && [u.id,u.course,u.cohort,u.instructor,u.prompt,u.version].every(x => typeof x === "string")
    && (u.subjectCode === undefined || isSecondSubject(u.subjectCode))
    && (u.assignmentTitle === undefined || typeof u.assignmentTitle === "string")
    && ["synthetic","user"].includes(u.origin) && validRubric(u.rubric))
    && new Set(s.units.map(u => u.id)).size === s.units.length
    && Array.isArray(s.submissions) && s.submissions.length <= 500 && s.submissions.every(r =>
      r && [r.id,r.unitId,r.learner,r.answer,r.originalText,r.source,r.createdAt,r.rubricVersion,r.feedback].every(x => typeof x === "string")
      && (r.prompt === undefined || typeof r.prompt === "string")
      && Number.isFinite(Date.parse(r.createdAt)) && r.originalText.length <= 20000
      && r.answer.length <= 20000 && ["pending","reviewed"].includes(r.review) && validRubric(r.rubric) && s.units.some(u => u.id === r.unitId))
    && new Set(s.submissions.map(r => r.id)).size === s.submissions.length
    && Array.isArray(s.interventions) && s.interventions.every(i => i && [i.id,i.unitId,i.note,i.createdAt].every(x => typeof x === "string") && s.units.some(u => u.id === i.unitId));
}
