import { buildLocalCoachRun, type CoachRequest } from "../../lib/coach";
import { getLearnerDatabase } from "../../lib/learner-auth";
import { refineWithQwen } from "../../lib/qwen";

const validChoices = new Set(["①", "②", "③", "④"]);

type AppliedInterventionRow = {
  id: string;
  action_label: string;
  applied_at: string;
  evidence_material: string | null;
  evidence_page: number | null;
};

async function attachAppliedIntervention(run: ReturnType<typeof buildLocalCoachRun>, input: CoachRequest) {
  const db = getLearnerDatabase();
  if (!db) return run;
  try {
    const row = await db.prepare(
      `SELECT id, action_label, applied_at, evidence_material, evidence_page
       FROM lecture_interventions
       WHERE status IN ('applied', 'measured')
         AND ((question_id IS NOT NULL AND question_id = ?) OR (domain = ? AND concept = ?))
       ORDER BY CASE WHEN question_id = ? THEN 0 ELSE 1 END, applied_at DESC
       LIMIT 1`,
    ).bind(input.question.id, input.question.domain, input.question.concept, input.question.id)
      .first<AppliedInterventionRow>();
    if (!row) return run;
    return {
      ...run,
      nextAction: run.correct
        ? `${row.action_label} 보강 후 같은 개념의 정답 유지 여부를 확인하세요.`
        : `${row.action_label}이 적용된 학습자료를 확인한 뒤 ${run.nextAction}`,
      intervention: {
        id: row.id,
        actionLabel: row.action_label,
        appliedAt: row.applied_at,
        evidenceMaterial: row.evidence_material,
        evidencePage: row.evidence_page === null ? null : Number(row.evidence_page),
      },
      trace: [
        ...run.trace,
        {
          step: "강의 보강 연결",
          provider: "공통 분석 신호",
          status: "complete" as const,
          detail: `${row.action_label} · 적용 ${row.applied_at}`,
        },
      ],
    };
  } catch {
    return run;
  }
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as CoachRequest;
    if (!input.question?.id || !validChoices.has(input.selectedChoice)) {
      return Response.json({ error: "문항과 제출 답안을 확인해 주세요." }, { status: 400 });
    }

    const localRun = buildLocalCoachRun(input);
    try {
      const qwenRun = await refineWithQwen(input, localRun);
      return Response.json({ run: await attachAppliedIntervention(qwenRun ?? localRun, input) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Qwen connection failed";
      const run = {
        ...localRun,
        trace: localRun.trace.map((item) =>
          item.step === "오답 진단"
            ? { ...item, detail: `Qwen Cloud 호출 실패로 로컬 진단 사용: ${message}` }
            : item,
        ),
      };
      return Response.json({ run: await attachAppliedIntervention(run, input) });
    }
  } catch {
    return Response.json({ error: "진단 요청 형식을 읽지 못했습니다." }, { status: 400 });
  }
}
