import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  analyzePromptEvents,
  createPromptEvent,
  redactSensitive,
  renderPromptBehaviorReport,
} from "../scripts/prompt_behavior_tracker.mjs";

const execFileAsync = promisify(execFile);

test("redacts contact details, secrets, learner codes, and local user names", () => {
  const redacted = redactSensitive("tester@example.test 010-0000-0000 token=abc123secret EC-ABCD-1234-EFGH /Users/tester/Documents/demo sk-abcdefghijklmnop");
  assert.doesNotMatch(redacted, /tester@example|010-0000|abc123secret|EC-ABCD|abcdefghijklmnop/);
  assert.match(redacted, /\[EMAIL\]/);
  assert.match(redacted, /\[PHONE\]/);
  assert.match(redacted, /token=\[REDACTED\]/);
  assert.match(redacted, /\[LEARNER_CODE\]/);
  assert.match(redacted, /~\/Documents\/demo/);
});

test("creates a structured event without inferring psychological state", () => {
  const event = createPromptEvent({
    id: "event-1",
    timestamp: "2026-08-20T01:00:00.000Z",
    project: "Exam Coach",
    taskId: "task-1",
    ai: "Codex",
    prompt: "#기능 #실행 프롬프트 기록 기능을 구현하고 검증해줘",
    result: "implemented",
    scopeChange: false,
  });
  assert.deepEqual(event.intents, ["#기능", "#실행"]);
  assert.equal(event.phase, "validation");
  assert.equal(event.implemented, true);
  assert.equal(event.verified, false);
  assert.equal("fatigue" in event, false);
  assert.equal("personality" in event, false);
});

test("calculates repeat, rework, conversion, verification, and completion metrics", () => {
  const base = {
    project: "Exam Coach",
    ai: "Codex",
    scopeChange: false,
  };
  const events = [
    createPromptEvent({ ...base, id: "e1", taskId: "t1", timestamp: "2026-08-19T00:00:00Z", prompt: "#질문 자격증 학습자의 오답을 개념과 강의 근거로 연결하는 핵심 흐름을 검토해줘", result: "decision" }),
    createPromptEvent({ ...base, id: "e2", taskId: "t1", timestamp: "2026-08-19T02:00:00Z", prompt: "#실행 자격증 학습자의 오답을 개념과 강의 근거로 연결하는 핵심 흐름을 구현해줘", result: "implemented" }),
    createPromptEvent({ ...base, id: "e3", taskId: "t1", timestamp: "2026-08-19T03:00:00Z", prompt: "#검토 구현된 핵심 흐름의 테스트와 근거 연결을 검증해줘", result: "verified" }),
    createPromptEvent({ ...base, id: "e4", taskId: "t2", timestamp: "2026-08-19T04:00:00Z", prompt: "#질문 자격증 학습자의 오답을 개념과 강의 근거로 연결하는 핵심 흐름을 다시 검토해줘", result: "rework", reworkOf: "e1" }),
  ];
  const analysis = analyzePromptEvents(events, { days: 7, now: "2026-08-20T00:00:00Z" });
  assert.equal(analysis.metrics.promptCount, 4);
  assert.equal(analysis.metrics.contextRepeatRate, 50);
  assert.equal(analysis.metrics.reworkRate, 25);
  assert.equal(analysis.metrics.executionConversionRate, 50);
  assert.equal(analysis.metrics.verificationRate, 100);
  assert.equal(analysis.metrics.averageCompletionHours, 2);
  assert.match(analysis.privacyBoundary, /심리.*추론하지 않음/);
});

test("writes a private JSONL event and a seven-day Markdown report through the CLI", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "prompt-behavior-"));
  const input = path.join(directory, "events.jsonl");
  const output = path.join(directory, "report.md");
  const command = new URL("../scripts/prompt_behavior_tracker.mjs", import.meta.url).pathname;
  try {
    await execFileAsync(process.execPath, [
      command,
      "add",
      `--input=${input}`,
      "--id=cli-1",
      "--timestamp=2026-08-20T01:00:00Z",
      "--task=cli-task",
      "--result=verified",
      "--scope-change=false",
      "--prompt=#기능 #실행 로컬 프롬프트 기록기를 검증한다",
    ]);
    await execFileAsync(process.execPath, [
      command,
      "analyze",
      `--input=${input}`,
      `--output=${output}`,
      "--days=7",
      "--now=2026-08-20T02:00:00Z",
    ]);
    const [jsonl, report] = await Promise.all([readFile(input, "utf8"), readFile(output, "utf8")]);
    assert.equal(JSON.parse(jsonl).id, "cli-1");
    assert.match(report, /프롬프트 행동 패턴 리포트/);
    assert.match(report, /실행 전환율/);
    assert.match(report, /피로, 집중력, 성격 또는 건강 상태를 진단하지 않습니다/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("renders missing task metadata as unmeasured instead of inventing precision", () => {
  const event = createPromptEvent({
    id: "unmeasured-1",
    timestamp: "2026-08-20T01:00:00Z",
    prompt: "#질문 지금 무엇을 해야 할까",
  });
  const analysis = analyzePromptEvents([event], { days: 7, now: "2026-08-20T02:00:00Z" });
  const report = renderPromptBehaviorReport(analysis);
  assert.equal(analysis.metrics.executionConversionRate, null);
  assert.equal(analysis.metrics.verificationRate, null);
  assert.match(report, /실행 전환율 \| 측정 불가/);
  assert.match(report, /검증 완료율 \| 측정 불가/);
});

test("does not call one standalone verified event an execution conversion", () => {
  const event = createPromptEvent({
    id: "verified-only",
    taskId: "task-without-start",
    timestamp: "2026-08-20T01:00:00Z",
    prompt: "#기능 #실행 #기록",
    result: "verified",
  });
  const analysis = analyzePromptEvents([event], { days: 7, now: "2026-08-20T02:00:00Z" });
  assert.equal(analysis.coverage.taskCount, 1);
  assert.equal(analysis.coverage.measurableTaskCount, 0);
  assert.equal(analysis.metrics.executionConversionRate, null);
  assert.equal(analysis.metrics.verificationRate, null);
});
