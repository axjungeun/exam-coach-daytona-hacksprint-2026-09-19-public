import readinessData from "../../data/sponsor-readiness.json";

type SponsorState = {
  id: "bright-data" | "daytona" | "nosana" | "qwen-cloud";
  name: string;
  role: string;
  codePath: string;
  requiredSecrets: string[];
  adapterReady: boolean;
  configured: boolean;
  verified: boolean;
  state: "실행 검증 완료" | "키 연결됨 · 실행 대기" | "코드 준비 · 현장 키 대기" | "어댑터 점검 실패";
  proof: string;
};

type ReadinessIntegration = {
  id: SponsorState["id"];
  requiredSecrets: string[];
  adapterReady: boolean;
  status: "adapter-ready" | "awaiting-key" | "verified" | "failed";
  proof: string;
};

const readiness = readinessData as {
  generatedAt: string | null;
  mode: "dry-run" | "live";
  integrations: ReadinessIntegration[];
};

export async function GET() {
  const readinessById = new Map(readiness.integrations.map((item) => [item.id, item]));
  const definitions = [
    { id: "daytona", name: "Daytona", role: "합성 문항 구조의 샌드박스 검증", codePath: "app/api/daytona-hacksprint/route.ts", configured: Boolean(process.env.DAYTONA_API_KEY) },
    { id: "nosana", name: "Nosana", role: "합성 예시 기반 AI 복습 제안", codePath: "app/lib/hacksprint-sponsors.ts", configured: Boolean(process.env.NOSANA_API_KEY) },
  ] as const;

  const sponsors: SponsorState[] = definitions.map((definition) => {
    const check = readinessById.get(definition.id);
    const adapterReady = check?.adapterReady ?? false;
    const verified = check?.status === "verified";
    const state = verified
      ? "실행 검증 완료"
      : definition.configured
        ? "키 연결됨 · 실행 대기"
        : adapterReady
          ? "코드 준비 · 현장 키 대기"
          : "어댑터 점검 실패";
    return {
      ...definition,
      requiredSecrets: check?.requiredSecrets ?? [],
      adapterReady,
      verified,
      state,
      proof: check?.proof ?? "사전 점검 기록 없음",
    };
  });

  return Response.json({
    sponsors,
    adapterReadyCount: sponsors.filter((sponsor) => sponsor.adapterReady).length,
    configuredCount: sponsors.filter((sponsor) => sponsor.configured).length,
    verifiedCount: sponsors.filter((sponsor) => sponsor.verified).length,
    integrationCount: sponsors.length,
    lastCheckedAt: readiness.generatedAt,
    checkMode: readiness.mode,
  });
}
