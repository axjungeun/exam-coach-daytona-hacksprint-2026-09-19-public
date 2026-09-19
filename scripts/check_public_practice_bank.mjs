import { readFile } from "node:fs/promises";

const practicePath = new URL("../app/data/public-practice-questions.json", import.meta.url);
const officialPath = new URL("../app/data/exam-questions-40-49.json", import.meta.url);
const practice = JSON.parse(await readFile(practicePath, "utf8"));
const official = JSON.parse(await readFile(officialPath, "utf8"));

function tokens(value) {
  return String(value ?? "").toLowerCase().match(/[가-힣a-z0-9]+/g) ?? [];
}

function fullText(question) {
  return [
    question.prompt ?? question.presentation?.prompt ?? question.questionText,
    question.context?.text ?? question.presentation?.context?.text,
    ...Object.values(question.choices ?? {}),
  ].filter(Boolean).join(" ");
}

function longestSharedRun(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  const row = new Uint16Array(b.length + 1);
  let longest = 0;
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
      if (row[j] > longest) longest = row[j];
      diagonal = previous;
    }
  }
  return longest;
}

const requiredSymbols = ["①", "②", "③", "④"];
const groups = new Map();
const ids = new Set();
const failures = [];

for (const question of practice.questions) {
  const groupKey = `${question.setNo}:${question.subjectCode}`;
  groups.set(groupKey, (groups.get(groupKey) ?? 0) + 1);
  if (ids.has(question.id)) failures.push(`${question.id}: duplicate id`);
  ids.add(question.id);
  if (question.rightsStatus !== "independently_authored") failures.push(`${question.id}: rights status`);
  if (JSON.stringify(Object.keys(question.choices)) !== JSON.stringify(requiredSymbols)) failures.push(`${question.id}: choices`);
  if (!question.acceptedAnswers.includes(question.answer)) failures.push(`${question.id}: answer`);
}

for (const [key, count] of groups) {
  if (count !== practice.metadata.questionsPerSubjectSet) failures.push(`${key}: expected ${practice.metadata.questionsPerSubjectSet}, got ${count}`);
}

// The public checkout deliberately excludes the official bank. Its 1,200 rows
// are declared repetitions of the 54 authored templates, so text equality is
// required here and is not evidence of independent creation or legal clearance.
const isSyntheticExport = official.metadata?.contentMode === "synthetic_demo";
let closest = null;
let derivedFixtureCheck = null;
if (isSyntheticExport) {
  const templates = new Map(practice.questions.map(q => [q.id, q]));
  const derivedIds = new Set();
  const templateIds = new Set();
  const slots = new Map();
  for (const q of official.questions) {
    const source = templates.get(q.sourceTemplateId);
    if (derivedIds.has(q.id)) failures.push(`${q.id}: duplicate derived id`);
    derivedIds.add(q.id);
    if (!source) { failures.push(`${q.id}: unknown source template`); continue; }
    templateIds.add(q.sourceTemplateId);
    const slot = `${q.round}:${q.subjectCode}`;
    slots.set(slot, (slots.get(slot) ?? 0) + 1);
    if (q.contentMode !== "synthetic_demo") failures.push(`${q.id}: missing synthetic label`);
    if (q.questionText !== `[합성 데모] ${source.prompt}` || q.presentation?.prompt !== q.questionText) failures.push(`${q.id}: prompt diverges from template`);
    if (q.subjectCode !== source.subjectCode) failures.push(`${q.id}: template subject mismatch`);
    if (JSON.stringify(q.choices) !== JSON.stringify(source.choices)) failures.push(`${q.id}: choices diverge from template`);
    if (q.answer !== source.answer || JSON.stringify(q.acceptedAnswers) !== JSON.stringify(source.acceptedAnswers)) failures.push(`${q.id}: answers diverge from template`);
    if (q.sourceFile !== "app/data/public-practice-questions.json") failures.push(`${q.id}: source points outside public bank`);
    if (q.round < 40 || q.round > 49 || q.questionNo < 1 || q.questionNo > 40) failures.push(`${q.id}: invalid synthetic slot`);
  }
  if (official.questions.length !== 1200 || official.metadata.count !== official.questions.length) failures.push("derived count mismatch");
  if (slots.size !== 30 || [...slots.values()].some(n => n !== 40)) failures.push("derived slot matrix incomplete");
  if (templateIds.size !== practice.questions.length || official.metadata.distinctTemplateCount !== templateIds.size) failures.push("derived template coverage mismatch");
  for (const flag of ["containsPersonalRecords", "containsOfficialExamQuestions", "containsTextbookExcerpts"]) {
    if (official.metadata[flag] !== false) failures.push(`unsafe or missing export provenance: ${flag}`);
  }
  derivedFixtureCheck = { questionCount: official.questions.length, distinctTemplateCount: templateIds.size, slotCount: slots.size };
} else {
  closest = { practiceId: "", officialId: "", tokenRun: 0 };
  for (const authored of practice.questions) {
    for (const source of official.questions) {
      const tokenRun = longestSharedRun(fullText(authored), fullText(source));
      if (tokenRun > closest.tokenRun) closest = { practiceId: authored.id, officialId: source.id, tokenRun };
    }
  }
  if (closest.tokenRun >= 14) failures.push(`long shared expression: ${JSON.stringify(closest)}`);
}
if (practice.questions.length !== practice.metadata.questionCount) failures.push("metadata question count mismatch");
if (groups.size !== practice.metadata.setCount * practice.metadata.subjectCount) failures.push("set/subject matrix incomplete");

const report = {
  valid: failures.length === 0,
  questionCount: practice.questions.length,
  groupCount: groups.size,
  groupSizes: Object.fromEntries([...groups].sort()),
  scope: isSyntheticExport ? "public-template-and-derived-fixture-consistency" : "authored-versus-official-expression-check",
  closestExpressionCheck: closest,
  derivedFixtureCheck,
  note: isSyntheticExport ? "공개본에는 공식 원문이 없습니다. 54개 템플릿과 합성 1,200개 레코드의 구조·일치·출처 표시만 검사하며 저작권 또는 공식 원문 대비 독립성 검증을 주장하지 않습니다." : "연속 토큰 검사는 내부 품질 점검이며 법적 안전 기준을 의미하지 않습니다.",
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
