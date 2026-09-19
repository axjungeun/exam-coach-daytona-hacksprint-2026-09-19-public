import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studyAppPath = new URL("../study-worker/public/app.js", import.meta.url);
const studyWorkerPath = new URL("../study-worker/index.ts", import.meta.url);
const reviewWorkerPath = new URL("../worker/index.ts", import.meta.url);
const migrationPath = new URL("../migrations/0002_feedback_reports.sql", import.meta.url);

test("learner app exposes an in-context feedback dialog", async () => {
  const source = await readFile(studyAppPath, "utf8");
  assert.match(source, /오류 제보/);
  assert.match(source, /현재 실전세트·과목·문항/);
  assert.match(source, /window\.addEventListener\("error"/);
  assert.match(source, /\/api\/feedback/);
});

test("feedback is authenticated, bounded, and rate limited", async () => {
  const source = await readFile(studyWorkerPath, "utf8");
  assert.match(source, /authenticateLearner\(request, env\.DB\)/);
  assert.match(source, /message\.length < 5/);
  assert.match(source, /limitedText\(body\.message, 1000\)/);
  assert.match(source, /created_at >= datetime\('now', '-1 day'\)/);
});

test("review inbox remains behind reviewer authentication", async () => {
  const source = await readFile(reviewWorkerPath, "utf8");
  const authPosition = source.indexOf("reviewerAuthorized(request, env)");
  const inboxPosition = source.indexOf('url.pathname === "/feedback"');
  assert.ok(authPosition >= 0 && inboxPosition > authPosition);
  assert.match(source, /오류·불편 접수함/);
});

test("builder pass is public, time-limited, and separate from reviewer routes", async () => {
  const source = await readFile(reviewWorkerPath, "utf8");
  const builderRoutePosition = source.indexOf('url.pathname === BUILDERS_PASS_PATH');
  const authPosition = source.indexOf("reviewerAuthorized(request, env)");
  const inboxPosition = source.indexOf('url.pathname === "/feedback"');

  assert.ok(builderRoutePosition >= 0 && builderRoutePosition < authPosition);
  assert.ok(inboxPosition > authPosition);
  assert.match(source, /BUILDERS_PASS_EXPIRES_LABEL = "2026-09-19 23:59 KST"/);
  assert.match(source, /Cache-Control": "no-store"/);
  assert.match(source, /Secret boundary: API keys, account data, coupon codes, and raw learner answers are not shown/);
});

test("review inbox shows real pilot totals without mixing synthetic learners", async () => {
  const source = await readFile(reviewWorkerPath, "utf8");
  assert.match(source, /WHERE l\.data_origin = 'real'/);
  assert.match(source, /실제 익명 학습자/);
  assert.match(source, /최소 점검 5명/);
  assert.match(source, /저장된 풀이/);
  assert.match(source, /문항 응답/);
});

test("feedback storage avoids direct contact fields", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS feedback_reports/);
  assert.doesNotMatch(migration, /email|phone|real_name/i);
  assert.match(migration, /FOREIGN KEY \(learner_id\)/);
});
