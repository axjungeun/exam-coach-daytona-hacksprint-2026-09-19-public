import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const [key, ...value] = entry.replace(/^--/, "").split("=");
  return [key, value.length ? value.join("=") : true];
}));
const batchId = String(args.batch ?? "agent-forge-50-v1");
const learnerCount = Number(args.learners ?? 50);
const outputDir = path.resolve(String(args.output ?? "output/synthetic"));
const checkOnly = Boolean(args.check);

if (!/^[a-z0-9-]{3,48}$/i.test(batchId)) throw new Error("배치 ID는 영문·숫자·하이픈만 사용할 수 있습니다.");
if (!Number.isInteger(learnerCount) || learnerCount < 1 || learnerCount > 500) throw new Error("학습자 수는 1~500이어야 합니다.");

const source = JSON.parse(await readFile(new URL("../app/data/public-practice-questions.json", import.meta.url), "utf8"));
const questions = source.questions;
const subjects = ["BIZ", "CONTRACT", "THEORY"];
const symbols = ["①", "②", "③", "④"];
const personaDefinitions = [
  { id: "biz_weak", label: "보험업법 취약형", rates: { BIZ: 0.36, CONTRACT: 0.68, THEORY: 0.66 } },
  { id: "contract_weak", label: "보험계약법 취약형", rates: { BIZ: 0.68, CONTRACT: 0.36, THEORY: 0.66 } },
  { id: "theory_weak", label: "손해사정이론 취약형", rates: { BIZ: 0.67, CONTRACT: 0.66, THEORY: 0.34 } },
  { id: "trap_sensitive", label: "함정선지 취약형", rates: { BIZ: 0.49, CONTRACT: 0.47, THEORY: 0.45 } },
  { id: "steady", label: "안정 학습형", rates: { BIZ: 0.81, CONTRACT: 0.79, THEORY: 0.77 } },
];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicId(value) {
  const hex = digest(value).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16], 16) % 4];
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function seededRandom(seed) {
  let state = parseInt(digest(seed).slice(0, 8), 16) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const learnerRows = [];
const attemptRows = [];
const answerRows = [];
const personaCounts = Object.fromEntries(personaDefinitions.map((persona) => [persona.id, 0]));
const baseTime = Date.parse("2026-08-15T01:00:00.000Z");

for (let index = 0; index < learnerCount; index += 1) {
  const learnerNo = index + 1;
  const learnerId = deterministicId(`${batchId}:learner:${learnerNo}`);
  const persona = personaDefinitions[index % personaDefinitions.length];
  const setNo = (index % 3) + 1;
  const createdAt = new Date(baseTime + index * 60_000).toISOString();
  let latestAt = createdAt;
  personaCounts[persona.id] += 1;

  for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex += 1) {
    const subjectCode = subjects[subjectIndex];
    const selected = questions.filter((question) => question.setNo === setNo && question.subjectCode === subjectCode);
    if (selected.length !== 6) throw new Error(`${setNo}세트 ${subjectCode} 문항 수가 6개가 아닙니다.`);
    const submittedAt = new Date(baseTime + index * 60_000 + (subjectIndex + 1) * 12 * 60_000).toISOString();
    const attemptId = deterministicId(`${batchId}:attempt:${learnerNo}:${subjectCode}`);
    const random = seededRandom(`${batchId}:${learnerNo}:${subjectCode}`);
    let score = 0;

    selected.forEach((question) => {
      let probability = persona.rates[subjectCode];
      if (persona.id === "trap_sensitive" && (question.statements.length > 0 || question.context || question.dataTable)) probability -= 0.12;
      if (persona.id.endsWith("weak") && question.keywords.length >= 3) probability -= 0.05;
      probability = Math.max(0.12, Math.min(0.92, probability));
      const correct = random() < probability;
      const wrongChoices = symbols.filter((symbol) => symbol !== question.answer);
      const selectedChoice = correct ? question.answer : wrongChoices[Math.floor(random() * wrongChoices.length)];
      if (correct) score += 1;
      answerRows.push({
        id: deterministicId(`${batchId}:answer:${learnerNo}:${question.id}`),
        attemptId,
        learnerId,
        question,
        selectedChoice,
        correct: correct ? 1 : 0,
        answeredAt: submittedAt,
      });
    });

    attemptRows.push({
      id: attemptId,
      learnerId,
      clientSubmissionId: `${batchId}-${String(learnerNo).padStart(3, "0")}-${subjectCode}`,
      round: setNo,
      subjectCode,
      score,
      total: selected.length,
      startedAt: new Date(Date.parse(submittedAt) - 10 * 60_000).toISOString(),
      submittedAt,
    });
    latestAt = submittedAt;
  }

  learnerRows.push({
    id: learnerId,
    nickname: `합성학습자 ${String(learnerNo).padStart(2, "0")}`,
    learnerCodeHash: digest(`${batchId}:non-login:${learnerNo}`),
    createdAt,
    lastSeenAt: latestAt,
    persona: persona.id,
  });
}

const lines = [
  "PRAGMA foreign_keys = ON;",
  `DELETE FROM learners WHERE data_origin = 'synthetic' AND synthetic_batch_id = ${sql(batchId)};`,
  ...learnerRows.map((row) => `INSERT INTO learners (id, nickname, learner_code_hash, created_at, last_seen_at, data_origin, synthetic_batch_id, synthetic_persona) VALUES (${[row.id, row.nickname, row.learnerCodeHash, row.createdAt, row.lastSeenAt, "synthetic", batchId, row.persona].map(sql).join(", ")});`),
  ...attemptRows.map((row) => `INSERT INTO exam_attempts (id, learner_id, client_submission_id, round, content_mode, subject_code, attempt_no, score, total, started_at, submitted_at) VALUES (${[row.id, row.learnerId, row.clientSubmissionId, row.round, "original_practice", row.subjectCode, 1, row.score, row.total, row.startedAt, row.submittedAt].map(sql).join(", ")});`),
  ...answerRows.map((row) => `INSERT INTO exam_answers (id, attempt_id, learner_id, question_id, question_no, domain, concept, primary_keyword, selected_choice, correct, answered_at) VALUES (${[row.id, row.attemptId, row.learnerId, row.question.id, row.question.questionNo, row.question.domain, row.question.concept, row.question.keywords[0] ?? null, row.selectedChoice, row.correct, row.answeredAt].map(sql).join(", ")});`),
];
const clearLines = [
  "PRAGMA foreign_keys = ON;",
  `DELETE FROM learners WHERE data_origin = 'synthetic' AND synthetic_batch_id = ${sql(batchId)};`,
];
const manifest = {
  batchId,
  dataOrigin: "synthetic",
  labeling: "시연용 합성 데이터",
  generatedAt: new Date().toISOString(),
  deterministic: true,
  loginEnabled: false,
  learnerCount: learnerRows.length,
  attemptCount: attemptRows.length,
  answerCount: answerRows.length,
  attemptsPerLearner: subjects.length,
  personaCounts,
  averageScore: Math.round((attemptRows.reduce((sum, row) => sum + row.score, 0) / attemptRows.length) * 100) / 100,
};

if (manifest.attemptCount !== learnerCount * 3 || manifest.answerCount !== learnerCount * 18) {
  throw new Error("합성 데이터 수량 검증에 실패했습니다.");
}

if (!checkOnly) {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, `${batchId}.sql`), `${lines.join("\n")}\n`),
    writeFile(path.join(outputDir, `${batchId}-clear.sql`), `${clearLines.join("\n")}\n`),
    writeFile(path.join(outputDir, `${batchId}-manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
}

console.log(JSON.stringify(manifest));
