import type { CoachRequest, CoachRun } from "./coach";

type QwenRefinement = Pick<CoachRun, "diagnosis" | "whyWrong" | "misconception" | "nextAction">;

function stripCodeFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function refineWithQwen(
  input: CoachRequest,
  localRun: CoachRun,
): Promise<CoachRun | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const model = process.env.QWEN_MODEL ?? "qwen-plus";
  const evidence = localRun.evidence;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "당신은 한국 자격시험 오답 코치다. 제공된 공식 정답과 강사 자료 근거만 사용한다. 근거에 없는 법적 사실을 만들지 않는다. JSON만 출력한다.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "학생 답안의 혼동을 짧고 구체적으로 진단하고 다음 행동을 결정하라.",
            requiredJsonKeys: ["diagnosis", "whyWrong", "misconception", "nextAction"],
            question: input.question.questionText,
            choices: input.question.choices,
            selectedChoice: input.selectedChoice,
            correctChoice: input.question.answer,
            concept: input.question.concept,
            trapType: input.question.trapType,
            curatedChoiceAnalysis: localRun.choiceAnalysis,
            localDiagnosis: {
              diagnosis: localRun.diagnosis,
              whyWrong: localRun.whyWrong,
              misconception: localRun.misconception,
            },
            evidence: evidence
              ? {
                  material: evidence.material,
                  page: evidence.page,
                  snippet: evidence.snippet,
                }
              : null,
            deterministicNextAction: localRun.nextAction,
            constraint: "curatedChoiceAnalysis가 있으면 선택지별 판단축과 정답 원칙을 바꾸거나 일반화하지 말 것",
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Qwen request failed: ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Qwen returned an empty response");
  const refined = JSON.parse(stripCodeFence(content)) as QwenRefinement;
  if (!refined.diagnosis || !refined.whyWrong || !refined.misconception || !refined.nextAction) {
    throw new Error("Qwen response is missing required fields");
  }

  return {
    ...localRun,
    ...refined,
    provider: { name: "Qwen Cloud", mode: "live", model },
    trace: localRun.trace.map((item) =>
      item.step === "오답 진단"
        ? {
            ...item,
            provider: `Qwen Cloud · ${model}`,
            status: "complete",
            detail: "공식 정답과 검색된 강사 자료 범위 안에서 진단 생성",
          }
        : item,
    ),
  };
}
