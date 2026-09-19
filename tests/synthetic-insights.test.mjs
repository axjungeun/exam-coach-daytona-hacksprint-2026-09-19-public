import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = new URL("../", import.meta.url);

test("generates a deterministic and visibly synthetic 50-learner batch", async () => {
  const first = await mkdtemp(path.join(tmpdir(), "exam-coach-synthetic-a-"));
  const second = await mkdtemp(path.join(tmpdir(), "exam-coach-synthetic-b-"));
  try {
    const command = new URL("../scripts/generate_synthetic_learners.mjs", import.meta.url);
    const run = async (output) => execFileAsync(process.execPath, [command.pathname, `--output=${output}`], { cwd: projectRoot });
    const result = await run(first);
    await run(second);
    const manifest = JSON.parse(result.stdout);
    assert.equal(manifest.dataOrigin, "synthetic");
    assert.equal(manifest.labeling, "시연용 합성 데이터");
    assert.equal(manifest.loginEnabled, false);
    assert.equal(manifest.learnerCount, 50);
    assert.equal(manifest.attemptCount, 150);
    assert.equal(manifest.answerCount, 900);
    assert.deepEqual(Object.values(manifest.personaCounts), [10, 10, 10, 10, 10]);

    const firstSql = await readFile(path.join(first, "agent-forge-50-v1.sql"), "utf8");
    const secondSql = await readFile(path.join(second, "agent-forge-50-v1.sql"), "utf8");
    assert.equal(firstSql, secondSql);
    assert.match(firstSql, /data_origin, synthetic_batch_id, synthetic_persona/);
    assert.equal((firstSql.match(/INSERT INTO learners/g) ?? []).length, 50);
    assert.equal((firstSql.match(/INSERT INTO exam_attempts/g) ?? []).length, 150);
    assert.equal((firstSql.match(/INSERT INTO exam_answers/g) ?? []).length, 900);
  } finally {
    await Promise.all([rm(first, { recursive: true, force: true }), rm(second, { recursive: true, force: true })]);
  }
});

test("keeps instructor aggregation separate from real learner data", async () => {
  const route = await readFile(new URL("../app/api/instructor-insights/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(route, /l\.data_origin = 'synthetic'/);
  assert.match(route, /l\.data_origin = 'real'/);
  assert.match(route, /보강 전 기초식 = 오답률 80% \+ 영향 학습자 비율 20%/);
  assert.match(page, /시연용 합성 데이터/);
  assert.match(page, /실사용.*데이터는 합산하지 않았습니다/);
});

test("turns cohort signals into one instructor action before the candidate table", async () => {
  const route = await readFile(new URL("../app/api/instructor-insights/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /이번에 보강할 한 가지/);
  assert.match(page, /에이전트 강의 브리핑/);
  assert.match(page, /선택지 혼동 집중/);
  assert.match(page, /권장 수정/);
  assert.match(page, /효과 확인 계획/);
  assert.match(page, /이 보강안 적용/);
  assert.match(page, /재풀이 측정 대기/);
  assert.match(page, /허가된 강사 근거 연결 위치/);
  assert.match(page, /실제 강의 ID와 영상 구간은 플랫폼 연결 대기/);
  assert.match(page, /전체 보강 후보 보기/);
  assert.match(page, /showInstructorCandidates/);
  assert.match(route, /GROUP BY a\.subject_code, ans\.domain, ans\.concept, ans\.question_id, ans\.question_no, ans\.selected_choice/);
  assert.match(route, /dominantWrongChoice/);
  assert.match(route, /선택지별 혼동맵 연결 대기/);
  assert.match(route, /보강 전 기초식/);
  assert.match(route, /보강 후 5건 이상/);
  assert.match(route, /calculateInterventionEffect/);
  assert.match(route, /validation: "보강 전후 동일 키워드 정답률과 선택지 분포 비교"/);
  assert.match(css, /\.instructor-command/);
  assert.match(css, /\.instructor-decision-grid/);
  assert.match(css, /\.instructor-evidence-link/);
});

test("serves reviewer static assets only after reviewer authentication", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const authIndex = worker.indexOf("reviewerAuthorized(request, env)");
  const assetsIndex = worker.indexOf('url.pathname.startsWith("/_next/static/")');
  assert.ok(authIndex > 0 && assetsIndex > authIndex);
  assert.match(worker, /return env\.ASSETS\.fetch\(request\)/);
});
