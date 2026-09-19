import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { secondExamCases } from "../app/data/second-exam-cases.ts";
import { createTeachingStore, secondExamSubjects } from "../app/lib/essay-review.ts";

test("all four subjects use explicitly synthetic cases separate from submissions", () => {
  assert.equal(new Set(secondExamCases.map(c => c.id)).size, secondExamCases.length);
  for (const subject of secondExamSubjects) assert.ok(secondExamCases.some(c => c.subject === subject.code));
  for (const item of secondExamCases) {
    assert.match(item.id, /^synthetic-/);
    assert.ok(item.sources.length && item.observation && item.next.length);
    assert.equal(item.session, 1);
    assert.match(item.question, /DEMO/);
    assert.equal(/\/Users\/|https?:\/\/|@/.test(JSON.stringify(item)), false);
    if (item.kind === "mapping") assert.equal(item.answer, undefined);
    else assert.ok(item.answer);
  }
  const store = createTeachingStore();
  assert.ok(store.submissions.every(s => !secondExamCases.some(c => c.id === s.id)));
});

test("second-stage UI labels synthetic provenance and avoids personal-record claims", async () => {
  const source = await readFile(new URL("../app/components/second-exam-cases.tsx", import.meta.url), "utf8");
  assert.match(source, /DEMO · 합성 답안·분석/);
  assert.match(source, /실제 학습자 성과 집계에 포함하지 않습니다/);
  assert.doesNotMatch(source, /보유 MD|내답안|48회/);
});
