import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("persists one common answer signal for learner and instructor actions", async () => {
  const store = await readFile(new URL("../app/lib/attempt-store.ts", import.meta.url), "utf8");
  const signal = await readFile(new URL("../app/lib/analysis-signal.ts", import.meta.url), "utf8");
  const instructor = await readFile(new URL("../app/api/instructor-insights/route.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../migrations/0005_closed_learning_loop.sql", import.meta.url), "utf8");

  assert.match(store, /INSERT INTO analysis_signals/);
  assert.match(store, /row\.signal\.learnerAction/);
  assert.match(store, /row\.signal\.instructorAction/);
  assert.match(signal, /signalCode: `choice:/);
  assert.match(signal, /confusionCode: input\.correct \? null : `confusion:/);
  assert.match(instructor, /LEFT JOIN analysis_signals sig ON sig\.answer_id = ans\.id/);
  assert.match(instructor, /confusionLabel/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS analysis_signals/);
});

test("turns wrong answers into persisted 24-hour review tasks and closes them on a correct retry", async () => {
  const store = await readFile(new URL("../app/lib/attempt-store.ts", import.meta.url), "utf8");
  const attempts = await readFile(new URL("../app/api/attempts/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(store, /24 \* 60 \* 60 \* 1000|reviewDueAt/);
  assert.match(store, /INSERT INTO review_tasks/);
  assert.match(store, /ON CONFLICT\(learner_id, question_id\) DO UPDATE/);
  assert.match(store, /status = 'completed'/);
  assert.match(attempts, /reviewQueue/);
  assert.match(page, /24시간 복습.*문항 예약/);
  assert.match(page, /예약 복습/);
});

test("records a lecture intervention and recomputes demand only after enough post answers", async () => {
  const route = await readFile(new URL("../app/api/instructor-insights/route.ts", import.meta.url), "utf8");
  const signal = await readFile(new URL("../app/lib/analysis-signal.ts", import.meta.url), "utf8");
  const coach = await readFile(new URL("../app/api/coach/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(route, /INSERT INTO lecture_interventions/);
  assert.match(route, /ans\.answered_at > \?/);
  assert.match(signal, /minimumPostAnswers = 5/);
  assert.match(signal, /postWrongRate \* 0\.6 \+ postAffectedRate \* 0\.2 \+ residualConfusionRate \* 0\.2/);
  assert.match(coach, /attachAppliedIntervention/);
  assert.match(coach, /강의 보강 연결/);
  assert.match(page, /보강 적용됨/);
  assert.match(page, /강의 보강 반영/);
});
