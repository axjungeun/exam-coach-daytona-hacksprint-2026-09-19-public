import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bankPath = new URL("../app/data/public-practice-questions.json", import.meta.url);
const studyWorkerPath = new URL("../study-worker/index.ts", import.meta.url);
const studyAppPath = new URL("../study-worker/public/app.js", import.meta.url);
const vocabularyPath = new URL("../app/data/exam-vocabulary-standard.json", import.meta.url);

test("public learner service uses only the independently authored practice bank", async () => {
  const bank = JSON.parse(await readFile(bankPath, "utf8"));
  const worker = await readFile(studyWorkerPath, "utf8");
  assert.equal(bank.metadata.contentMode, "original_practice");
  assert.equal(bank.metadata.rightsStatus, "independently_authored");
  assert.equal(bank.questions.length, 54);
  assert.ok(bank.questions.every((question) => question.rightsStatus === "independently_authored"));
  assert.match(worker, /public-practice-questions\.json/);
  assert.doesNotMatch(worker, /exam-questions-40-49\.json/);
});

test("practice bank contains three complete sets for all subjects", async () => {
  const bank = JSON.parse(await readFile(bankPath, "utf8"));
  const groups = new Map();
  for (const question of bank.questions) {
    const key = `${question.setNo}:${question.subjectCode}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
    assert.deepEqual(Object.keys(question.choices), ["①", "②", "③", "④"]);
    assert.ok(question.acceptedAnswers.includes(question.answer));
  }
  assert.equal(groups.size, 9);
  assert.ok([...groups.values()].every((count) => count === 6));
});

test("learner UI identifies practice sets and independent content", async () => {
  const source = await readFile(studyAppPath, "utf8");
  assert.match(source, /실전세트/);
  assert.match(source, /자체 제작 문항/);
  assert.doesNotMatch(source, /40~49회/);
  assert.doesNotMatch(source, /공식 기출 회차 선택/);
});

test("learner UI explains save timing and scopes progress to the selected set", async () => {
  const source = await readFile(studyAppPath, "utf8");
  const worker = await readFile(studyWorkerPath, "utf8");
  assert.match(source, /채점하기<\/strong>를 누르면 이 풀이가 자동 저장됩니다/);
  assert.match(source, /문항 채점하고 저장/);
  assert.match(source, /현재 \$\{state\.setNo\}세트 · \$\{completedSubjectCount\(state\.setNo\)\}\/3과목 저장/);
  assert.match(source, /회차 풀이 중/);
  assert.match(source, /회차 저장 완료/);
  assert.match(worker, /COUNT\(\*\) AS saved_count/);
  assert.match(worker, /GROUP BY round, content_mode, subject_code/);
});

test("learner can open a private analysis view backed by derived statistics", async () => {
  const source = await readFile(studyAppPath, "utf8");
  const worker = await readFile(studyWorkerPath, "utf8");
  const analysisRoute = worker.slice(worker.indexOf("async function analysisRoute"), worker.indexOf("function limitedText"));
  assert.match(source, /내 학습 분석/);
  assert.match(source, /과목별 성취도/);
  assert.match(source, /집중할 개념/);
  assert.match(source, /다음 학습 행동/);
  assert.match(worker, /url\.pathname === "\/api\/analysis"/);
  assert.match(analysisRoute, /SUM\(CASE WHEN ans\.correct = 0 THEN 1 ELSE 0 END\)/);
  assert.doesNotMatch(analysisRoute, /selected_choice/);
});

test("all learner-facing concepts use the fixed first-exam vocabulary standard", async () => {
  const bank = JSON.parse(await readFile(bankPath, "utf8"));
  const vocabulary = JSON.parse(await readFile(vocabularyPath, "utf8"));
  const canonicalBySubject = new Map(
    Object.entries(vocabulary.subjects).map(([subjectCode, terms]) => [
      subjectCode,
      new Set(terms.map((term) => term.canonical)),
    ]),
  );
  assert.equal(bank.metadata.vocabularyStandard, vocabulary.metadata.id);
  assert.equal(bank.metadata.vocabularyLevel, "first_exam");
  assert.ok(bank.questions.every((question) => question.vocabularyLevel === "first_exam"));
  assert.ok(bank.questions.every((question) => canonicalBySubject.get(question.subjectCode)?.has(question.concept)));
});
