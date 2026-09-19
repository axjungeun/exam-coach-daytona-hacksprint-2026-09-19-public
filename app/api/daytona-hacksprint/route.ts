import fallbackEvidenceData from "../../data/daytona-hacksprint-evidence.json";
import examData from "../../data/exam-questions-40-49.json";

type ExamQuestion = {
  id: string;
  round: number;
  subjectCode: string;
  questionNo: number;
  answer: string;
  choices?: Record<string, string>;
};

type DaytonaValidationResult = {
  questionCount: number;
  uniqueIds: number;
  subjectCount: number;
  roundRange: string;
  invalidChoiceCounts: number;
  missingAnswers: number;
  valid: boolean;
};

type DaytonaEvidence = {
  event: string;
  verifiedAtKst: string;
  provider: string;
  keyScope: string;
  sandboxId: string;
  command: string;
  sourcePath: string;
  result: DaytonaValidationResult;
  secretBoundary: string;
};

type RuntimeDiagnostic = {
  phase: string;
  name: string;
  message: string;
};

type DaytonaSandbox = {
  id: string;
  process: {
    codeRun: (code: string, args?: unknown, timeout?: number) => Promise<{ result: string }>;
  };
};

type DaytonaClient = {
  create: (options: {
    language: string;
    ephemeral: boolean;
    autoDeleteInterval: number;
    labels: Record<string, string>;
  }) => Promise<DaytonaSandbox>;
  delete: (target: DaytonaSandbox, timeout?: number, force?: boolean) => Promise<unknown>;
};

const fallbackEvidence = fallbackEvidenceData as DaytonaEvidence;
const questions = (examData as { questions: ExamQuestion[] }).questions;

type CloudflareSecretBinding = {
  get: () => Promise<string>;
};

function isCloudflareSecretBinding(value: unknown): value is CloudflareSecretBinding {
  return Boolean(value && typeof value === "object" && typeof (value as CloudflareSecretBinding).get === "function");
}

async function resolveDaytonaApiKey() {
  if (process.env.DAYTONA_API_KEY) {
    return process.env.DAYTONA_API_KEY;
  }

  try {
    const { env } = await import("cloudflare:workers");
    const secret = (env as Record<string, unknown>).DAYTONA_API_KEY;
    if (typeof secret === "string" && secret) {
      return secret;
    }
    if (isCloudflareSecretBinding(secret)) {
      return await secret.get();
    }
  } catch {
    return "";
  }

  return "";
}

function summarizeRuntimeError(error: unknown, phase: string): RuntimeDiagnostic {
  if (error instanceof Error) {
    return {
      phase,
      name: error.name,
      message: error.message.slice(0, 220),
    };
  }
  return {
    phase,
    name: "UnknownError",
    message: String(error).slice(0, 220),
  };
}

function nowKst() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()).replace("T", " ");
  return `${parts} KST`;
}

function localValidationResult(): DaytonaValidationResult {
  const ids = questions.map((question) => question.id);
  const subjects = new Set(questions.map((question) => question.subjectCode));
  const rounds = Array.from(new Set(questions.map((question) => question.round))).sort((a, b) => a - b);
  return {
    questionCount: questions.length,
    uniqueIds: new Set(ids).size,
    subjectCount: subjects.size,
    roundRange: `${rounds[0]}-${rounds[rounds.length - 1]}`,
    invalidChoiceCounts: questions.filter((question) => Object.keys(question.choices ?? {}).length !== 4).length,
    missingAnswers: questions.filter((question) => !question.answer).length,
    valid: questions.length === 1200 && new Set(ids).size === 1200 && subjects.size === 3 && rounds.length === 10,
  };
}

function fallbackPayload(
  reason: "missing-key" | "runtime-failed" | "validation-failed",
  checkedAtKst = nowKst(),
  runtimeDiagnostic?: RuntimeDiagnostic,
) {
  return {
    status: "fallback",
    reason,
    message: reason === "missing-key"
      ? "Daytona sandbox key is not configured in this runtime, so the app is showing an unverified local fixture. No sandbox execution is claimed."
      : "Daytona live execution did not complete, so the app is showing an unverified local fixture and keeping the synthetic analysis path available.",
    checkedAtKst,
    receipt: fallbackEvidence,
    localCheck: localValidationResult(),
    runtimeDiagnostic,
    fallbackUsed: true,
  };
}

function buildPythonValidator() {
  const compactRows = questions.map((question) => ({
    id: question.id,
    round: question.round,
    subjectCode: question.subjectCode,
    questionNo: question.questionNo,
    answer: question.answer,
    choiceCount: Object.keys(question.choices ?? {}).length,
  }));
  return `
import json
rows = json.loads(${JSON.stringify(JSON.stringify(compactRows))})
ids = [row["id"] for row in rows]
subjects = sorted(set(row["subjectCode"] for row in rows))
rounds = sorted(set(row["round"] for row in rows))
result = {
  "questionCount": len(rows),
  "uniqueIds": len(set(ids)),
  "subjectCount": len(subjects),
  "roundRange": f"{rounds[0]}-{rounds[-1]}",
  "invalidChoiceCounts": sum(1 for row in rows if row["choiceCount"] != 4),
  "missingAnswers": sum(1 for row in rows if not row["answer"]),
  "valid": len(rows) == 1200 and len(set(ids)) == 1200 and len(subjects) == 3 and len(rounds) == 10
}
print(json.dumps(result, ensure_ascii=False))
`;
}

export async function POST() {
  const checkedAtKst = nowKst();
  const daytonaApiKey = await resolveDaytonaApiKey();
  if (!daytonaApiKey) {
    return Response.json(fallbackPayload("missing-key", checkedAtKst));
  }

  let sandbox: DaytonaSandbox | null = null;
  let daytona: DaytonaClient | null = null;
  let phase = "initialize";

  try {
    phase = "import-daytona-sdk";
    const { Daytona } = await import("@daytona/sdk");
    phase = "create-daytona-client";
    daytona = new Daytona({ apiKey: daytonaApiKey, useDeprecatedPolling: true }) as unknown as DaytonaClient;
    phase = "create-sandbox";
    sandbox = await daytona.create({
      language: "python",
      ephemeral: true,
      autoDeleteInterval: 5,
      labels: { project: "exam-coach", task: "daytona-hacksprint-p1-lite" },
    });
    if (!sandbox) return Response.json(fallbackPayload("runtime-failed", checkedAtKst));

    phase = "run-validator";
    const execution = await sandbox.process.codeRun(buildPythonValidator(), undefined, 120);
    phase = "parse-validator-result";
    const result = JSON.parse(execution.result.trim()) as DaytonaValidationResult;
    const receipt: DaytonaEvidence = {
      event: "Daytona HackSprint Seoul 2026",
      verifiedAtKst: checkedAtKst,
      provider: "Daytona Sandbox",
      keyScope: "Sandbox-only API key",
      sandboxId: sandbox.id,
      command: "POST /api/daytona-hacksprint",
      sourcePath: "app/data/exam-questions-40-49.json",
      result,
      secretBoundary: fallbackEvidence.secretBoundary,
    };

    if (!result.valid) {
      return Response.json({
        status: "failed",
        reason: "validation-failed",
        message: "Daytona sandbox returned a validation result, but the dataset did not meet the expected contract.",
        checkedAtKst,
        receipt,
        fallbackReceipt: fallbackEvidence,
        fallbackUsed: true,
      });
    }

    return Response.json({
      status: "verified",
      reason: "live-daytona-run",
      message: "Daytona sandbox created a fresh validation receipt.",
      checkedAtKst,
      receipt,
      fallbackUsed: false,
    });
  } catch (error) {
    const diagnostic = summarizeRuntimeError(error, phase);
    console.error("Daytona HackSprint live execution failed", diagnostic);
    return Response.json(fallbackPayload("runtime-failed", checkedAtKst, diagnostic));
  } finally {
    if (daytona && sandbox) {
      await daytona.delete(sandbox, 60, true).catch(() => null);
    }
  }
}
