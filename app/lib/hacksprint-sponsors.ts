export type SponsorReceipt = {
  provider: string;
  status: "verified" | "awaiting-key" | "awaiting-setup" | "failed";
  scope: string;
  checkedAt: string;
  message: string;
  model?: string;
  output?: string;
  requestId?: string;
};

type Config = { nosanaKey?: string };
type Model = { id: string; available?: boolean; pricing?: { completion?: string } };

async function readJson(url: string, token: string, init: RequestInit = {}, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(45000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function runSponsor(provider: "nosana", config: Config, fetcher: typeof fetch = fetch): Promise<SponsorReceipt> {
  if (provider !== "nosana") throw new Error("Unsupported sponsor");
  const base = {
    provider: "Nosana",
    scope: "synthetic-study-example",
    checkedAt: new Date().toISOString(),
  };
  const token = config.nosanaKey;
  if (!token) return { ...base, status: "awaiting-key", message: "Nosana API 키 연결 대기" };
  try {
    const models = await readJson("https://inference.nosana.com/v1/models", token, {}, fetcher);
    const candidates = (models.data as Model[] | undefined)?.filter(m => m.available !== false && !/embed|rerank/i.test(m.id) && Number(m.pricing?.completion) > 0);
    const model = candidates?.sort((a,b) => Number(a.pricing?.completion) - Number(b.pricing?.completion))[0]?.id;
    if (!model) return { ...base, status: "awaiting-setup", message: "현재 이용 가능한 텍스트 생성 모델이 없습니다." };
    const result = await readJson("https://inference.nosana.com/v1/chat/completions", token, {
      method: "POST",
      body: JSON.stringify({ model, max_tokens: 2048, temperature: 0.2, stream: false, messages: [
        {role: "system", content: "You write a short Korean study suggestion using only the supplied synthetic facts. Do not diagnose, grade, invent learner history, cite sources or promise learning outcomes. Return 2 concise Korean sentences, no reasoning."},
        {role: "user", content: "합성 학습 예시: 분수 덧셈 3문항 중 2문항에서 분모를 그대로 더하는 오류를 보였다. 제공된 복습 기준: 분모를 같게 만든 다음 분자끼리 더한다. 이 기준을 다시 확인하는 연습 1개와 다음 행동을 제안해 주세요."},
      ] }),
    }, fetcher);
    if (result.choices?.[0]?.finish_reason !== "stop") throw new Error("Incomplete generation");
    const output = result.choices?.[0]?.message?.content;
    if (typeof output !== "string" || !output.trim() || output.length > 4000) throw new Error("Invalid response");
    return { ...base, status: "verified", model, output: output.trim(), requestId: typeof result.id === "string" ? result.id.slice(0,120) : undefined,
      message: "Nosana 실호출 완료 · 합성 예시에 대한 AI 생성 복습 제안이며 검토가 필요합니다." };
  } catch (error) {
    // Provider errors may contain credentials or account details. Only expose a numeric HTTP code.
    const code = error instanceof Error ? error.message.match(/^HTTP (\d{3})$/)?.[1] : undefined;
    return { ...base, status: "failed", message: `실제 호출 실패${code ? ` (HTTP ${code})` : " 또는 응답 시간 초과"}. 키 권한과 서비스 상태를 확인해 주세요.` };
  }
}
