import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_INPUT = path.resolve(".prompt-behavior/prompt-events.jsonl");
const DEFAULT_REPORT = path.resolve(".prompt-behavior/prompt-behavior-report.md");
const RESULT_VALUES = new Set(["unknown", "idea", "decision", "implemented", "verified", "blocked", "rework", "no_action"]);
const INTENT_TAGS = new Set(["#질문", "#조언", "#기능", "#실행", "#검토", "#요약"]);
const SESSION_GAP_MS = 30 * 60 * 1000;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  throw new Error(`불리언 값은 true 또는 false여야 합니다: ${value}`);
}

function parseList(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function parseArgs(entries) {
  const parsed = {};
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry.startsWith("--")) continue;
    const stripped = entry.slice(2);
    const equalsIndex = stripped.indexOf("=");
    if (equalsIndex >= 0) {
      parsed[stripped.slice(0, equalsIndex)] = stripped.slice(equalsIndex + 1);
      continue;
    }
    const next = entries[index + 1];
    if (next && !next.startsWith("--")) {
      parsed[stripped] = next;
      index += 1;
    } else {
      parsed[stripped] = true;
    }
  }
  return parsed;
}

export function redactSensitive(value) {
  return String(value ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b(?:\+?82[-\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[PHONE]")
    .replace(/\bEC-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}\b/gi, "[LEARNER_CODE]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[SECRET]")
    .replace(/\b(api[_ -]?key|token|password|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\/Users\/[^/\s]+/g, "~");
}

function normalizePrompt(value) {
  return redactSensitive(value)
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractIntents(prompt, explicitIntents = []) {
  const found = new Set(explicitIntents.map((intent) => intent.startsWith("#") ? intent : `#${intent}`));
  for (const tag of String(prompt).match(/#[\p{L}\p{N}_-]+/gu) ?? []) {
    if (INTENT_TAGS.has(tag)) found.add(tag);
  }
  return [...found];
}

function inferPhase(prompt, intents) {
  const text = String(prompt);
  if (/#기록|진행 기록|작업 기록/.test(text)) return "record";
  if (/특허|출원|변리사|명세서/.test(text)) return "patent";
  if (/발표|장표|대본|리허설/.test(text)) return "presentation";
  if (/배포|Cloudflare|Workers|링크 공유/.test(text)) return "deployment";
  if (/테스트|검증|확인|점검/.test(text) || intents.includes("#검토")) return "validation";
  if (/구현|수정|고치|제작/.test(text) || intents.includes("#실행")) return "implementation";
  if (/SSOT|ADR|프롬프트|컨텍스트|기록 규칙/.test(text)) return "governance";
  if (/아이디어|어떻게|할까|가능할까/.test(text) || intents.includes("#조언") || intents.includes("#질문")) return "discovery";
  return "other";
}

export function createPromptEvent(input) {
  const timestamp = new Date(input.timestamp ?? Date.now());
  if (Number.isNaN(timestamp.getTime())) throw new Error("유효한 timestamp가 필요합니다.");
  const prompt = redactSensitive(input.prompt).trim();
  if (!prompt) throw new Error("prompt는 비어 있을 수 없습니다.");
  const intents = extractIntents(prompt, input.intents ?? []);
  const result = String(input.result ?? "unknown");
  if (!RESULT_VALUES.has(result)) throw new Error(`지원하지 않는 result입니다: ${result}`);
  const normalized = normalizePrompt(prompt);

  return {
    schemaVersion: 1,
    id: String(input.id ?? randomUUID()),
    timestamp: timestamp.toISOString(),
    project: String(input.project ?? "Exam Coach"),
    taskId: input.taskId ? String(input.taskId) : null,
    ai: String(input.ai ?? "Codex"),
    intents,
    phase: String(input.phase ?? inferPhase(prompt, intents)),
    prompt,
    promptHash: digest(normalized || prompt),
    result,
    implemented: input.implemented ?? ["implemented", "verified"].includes(result),
    verified: input.verified ?? result === "verified",
    scopeChange: input.scopeChange ?? null,
    reworkOf: input.reworkOf ? String(input.reworkOf) : null,
    source: String(input.source ?? "manual"),
  };
}

export async function appendPromptEvent(filePath, event) {
  const resolved = path.resolve(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await appendFile(resolved, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  return resolved;
}

export async function readPromptEvents(filePath) {
  const source = await readFile(path.resolve(filePath), "utf8");
  return source.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${index + 1}번째 JSONL 행을 읽을 수 없습니다: ${error.message}`);
    }
  });
}

function tokens(value) {
  return new Set(normalizePrompt(value).split(" ").filter((token) => token.length >= 2));
}

function jaccard(left, right) {
  if (left.size < 6 || right.size < 6) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function percentage(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function analyzePromptEvents(allEvents, options = {}) {
  const now = new Date(options.now ?? Date.now());
  const days = Number(options.days ?? 7);
  if (Number.isNaN(now.getTime())) throw new Error("유효한 분석 기준 시각이 필요합니다.");
  if (!Number.isFinite(days) || days <= 0 || days > 365) throw new Error("분석 기간은 1~365일이어야 합니다.");
  const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const events = allEvents
    .filter((event) => {
      const timestamp = new Date(event.timestamp);
      return !Number.isNaN(timestamp.getTime()) && timestamp >= windowStart && timestamp <= now;
    })
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

  let sessionCount = 0;
  let rapidPhaseSwitchCount = 0;
  const repeatPairs = [];
  const repeatedEventIds = new Set();
  const eventTokens = events.map((event) => tokens(event.prompt));

  events.forEach((event, index) => {
    const previous = events[index - 1];
    const gap = previous ? new Date(event.timestamp) - new Date(previous.timestamp) : Infinity;
    if (!previous || gap > SESSION_GAP_MS) sessionCount += 1;
    if (previous && gap <= SESSION_GAP_MS && (previous.project !== event.project || previous.phase !== event.phase)) {
      rapidPhaseSwitchCount += 1;
    }
    for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
      if (events[priorIndex].project !== event.project) continue;
      const similarity = jaccard(eventTokens[priorIndex], eventTokens[index]);
      if (similarity >= 0.72) {
        repeatedEventIds.add(event.id);
        repeatPairs.push({ from: events[priorIndex].id, to: event.id, similarity: Math.round(similarity * 100) });
        break;
      }
    }
  });

  const taskGroups = new Map();
  for (const event of events.filter((item) => item.taskId)) {
    const group = taskGroups.get(event.taskId) ?? [];
    group.push(event);
    taskGroups.set(event.taskId, group);
  }
  const measurableTasks = [];
  const completedTasks = [];
  const verifiedTasks = [];
  const completionHours = [];
  for (const group of taskGroups.values()) {
    const startingIndex = group.findIndex((event) => !event.implemented && !event.verified && !["implemented", "verified"].includes(event.result));
    if (startingIndex < 0) continue;
    measurableTasks.push(group[0].taskId);
    const completed = group.slice(startingIndex + 1).find((event) => event.implemented || ["implemented", "verified"].includes(event.result));
    const verified = group.slice(startingIndex + 1).find((event) => event.verified || event.result === "verified");
    if (completed) {
      completedTasks.push(group[0].taskId);
      completionHours.push((new Date(completed.timestamp) - new Date(group[0].timestamp)) / 3_600_000);
    }
    if (verified) verifiedTasks.push(group[0].taskId);
  }

  const hourBuckets = { "00-05": 0, "06-11": 0, "12-17": 0, "18-23": 0 };
  for (const event of events) {
    const hour = new Date(event.timestamp).getHours();
    const bucket = hour < 6 ? "00-05" : hour < 12 ? "06-11" : hour < 18 ? "12-17" : "18-23";
    hourBuckets[bucket] += 1;
  }

  const scopeLabeled = events.filter((event) => typeof event.scopeChange === "boolean");
  const scopeChanges = scopeLabeled.filter((event) => event.scopeChange).length;
  const reworkCount = events.filter((event) => event.reworkOf || event.result === "rework").length;
  const resultKnownCount = events.filter((event) => event.result && event.result !== "unknown").length;
  const intentCounts = {};
  for (const event of events) {
    for (const intent of event.intents ?? []) intentCounts[intent] = (intentCounts[intent] ?? 0) + 1;
  }

  const metrics = {
    promptCount: events.length,
    sessionCount,
    contextRepeatRate: percentage(repeatedEventIds.size, events.length),
    explicitScopeChangeRate: percentage(scopeChanges, scopeLabeled.length),
    reworkRate: percentage(reworkCount, events.length),
    taskCoverage: percentage(events.filter((event) => event.taskId).length, events.length),
    resultCoverage: percentage(resultKnownCount, events.length),
    executionConversionRate: percentage(completedTasks.length, measurableTasks.length),
    verificationRate: percentage(verifiedTasks.length, completedTasks.length),
    averageCompletionHours: average(completionHours),
    rapidPhaseSwitchCount,
  };

  const recommendations = [];
  if (events.length < 10) recommendations.push("표본이 10건 미만입니다. 행동 결론보다 기록 습관을 먼저 안정화하세요.");
  if ((metrics.taskCoverage ?? 0) < 70) recommendations.push("taskId 기록률을 70% 이상으로 올려 질문에서 실행까지의 전환을 측정하세요.");
  if ((metrics.resultCoverage ?? 0) < 70) recommendations.push("결과 상태를 남겨 아이디어와 실제 완료를 구분하세요.");
  if ((metrics.contextRepeatRate ?? 0) >= 20) recommendations.push("반복 배경은 프롬프트에 다시 쓰지 말고 MAIN_CONTEXT와 관련 문서를 참조하세요.");
  if ((metrics.explicitScopeChangeRate ?? 0) >= 20) recommendations.push("활성 목표를 하나로 잠그고 새 아이디어는 보류 목록으로 이동하세요.");
  if ((metrics.reworkRate ?? 0) >= 20) recommendations.push("구현 전에 완료 기준과 비범위를 먼저 확정하세요.");
  if (!recommendations.length) recommendations.push("현재 기록에서는 뚜렷한 재작업 경고가 없습니다. 같은 기준으로 7일을 채우세요.");

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    window: { days, start: windowStart.toISOString(), end: now.toISOString() },
    privacyBoundary: "업무 행동만 분석하며 심리·성격·건강 상태를 추론하지 않음",
    metrics,
    coverage: {
      scopeLabeledCount: scopeLabeled.length,
      taskCount: taskGroups.size,
      measurableTaskCount: measurableTasks.length,
      resultKnownCount,
    },
    distributions: {
      hours: hourBuckets,
      intents: intentCounts,
      phases: countBy(events, (event) => event.phase ?? "other"),
      results: countBy(events, (event) => event.result ?? "unknown"),
    },
    repeatPairs,
    recommendations,
  };
}

function displayMetric(value, suffix = "%") {
  return value === null ? "측정 불가" : `${value}${suffix}`;
}

export function renderPromptBehaviorReport(analysis) {
  const { metrics, coverage, distributions } = analysis;
  const rows = [
    ["프롬프트", String(metrics.promptCount)],
    ["세션", String(metrics.sessionCount)],
    ["맥락 반복률", displayMetric(metrics.contextRepeatRate)],
    ["명시적 범위 전환률", displayMetric(metrics.explicitScopeChangeRate)],
    ["재작업률", displayMetric(metrics.reworkRate)],
    ["작업 ID 기록률", displayMetric(metrics.taskCoverage)],
    ["결과 기록률", displayMetric(metrics.resultCoverage)],
    ["실행 전환율", displayMetric(metrics.executionConversionRate)],
    ["검증 완료율", displayMetric(metrics.verificationRate)],
    ["평균 완료시간", displayMetric(metrics.averageCompletionHours, "시간")],
  ];
  const table = rows.map(([label, value]) => `| ${label} | ${value} |`).join("\n");
  const recommendations = analysis.recommendations.map((item) => `- ${item}`).join("\n");
  const hours = Object.entries(distributions.hours).map(([key, value]) => `- ${key}시: ${value}건`).join("\n");

  return `# 프롬프트 행동 패턴 리포트

- 분석 기간: ${analysis.window.start} ~ ${analysis.window.end}
- 생성 시각: ${analysis.generatedAt}
- 경계: ${analysis.privacyBoundary}

## 핵심 지표

| 지표 | 값 |
|---|---:|
${table}

## 측정 완성도

- 범위 전환 표기: ${coverage.scopeLabeledCount}건
- 작업 ID: ${coverage.taskCount}개
- 시작·후속 행동이 모두 있는 측정 가능 작업: ${coverage.measurableTaskCount}개
- 결과 상태 표기: ${coverage.resultKnownCount}건
- 30분 안의 단계 전환 후보: ${metrics.rapidPhaseSwitchCount}건

## 시간대

${hours}

## 다음 운영 제안

${recommendations}

> 이 리포트는 관찰된 작업 이벤트만 요약합니다. 피로, 집중력, 성격 또는 건강 상태를 진단하지 않습니다.
`;
}

async function readPromptFromArgs(args) {
  if (args.prompt) return String(args.prompt);
  if (args["prompt-file"]) return readFile(path.resolve(String(args["prompt-file"])), "utf8");
  throw new Error("--prompt 또는 --prompt-file이 필요합니다.");
}

async function runCli() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  if (command === "add") {
    const prompt = await readPromptFromArgs(args);
    const event = createPromptEvent({
      id: args.id,
      timestamp: args.timestamp,
      project: args.project,
      taskId: args.task,
      ai: args.ai,
      intents: parseList(args.intents),
      phase: args.phase,
      prompt,
      result: args.result,
      implemented: parseBoolean(args.implemented),
      verified: parseBoolean(args.verified),
      scopeChange: parseBoolean(args["scope-change"]),
      reworkOf: args["rework-of"],
      source: args.source,
    });
    const filePath = await appendPromptEvent(args.input ?? DEFAULT_INPUT, event);
    console.log(JSON.stringify({ saved: true, filePath, event }, null, 2));
    return;
  }
  if (command === "analyze") {
    const input = path.resolve(String(args.input ?? DEFAULT_INPUT));
    const output = path.resolve(String(args.output ?? DEFAULT_REPORT));
    const events = await readPromptEvents(input);
    const analysis = analyzePromptEvents(events, { days: args.days, now: args.now });
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, renderPromptBehaviorReport(analysis), { encoding: "utf8", mode: 0o600 });
    console.log(JSON.stringify({ input, output, ...analysis.metrics }, null, 2));
    return;
  }
  throw new Error("사용법: prompt_behavior_tracker.mjs add|analyze [--key=value]");
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
