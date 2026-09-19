import { runSponsor } from "../../lib/hacksprint-sponsors";

async function setting(name: string) {
  if (process.env[name]) return process.env[name];
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as Record<string, unknown>)[name];
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "get" in value && typeof value.get === "function") return await value.get() as string;
  } catch { /* Not running inside a Worker. */ }
  return undefined;
}

let busy = false;
let lastRun = 0;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "허용되지 않은 요청" }, { status: 403 });
  let provider: unknown;
  try { provider = (await request.json()).provider; } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }
  if (provider !== "nosana") return Response.json({ error: "지원하지 않는 스폰서" }, { status: 400 });
  if (busy || Date.now() - lastRun < 10000) return Response.json({ error: "실행 중이거나 재실행 대기 중입니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  busy = true;
  lastRun = Date.now();
  try {
    const receipt = await runSponsor(provider, {
      nosanaKey: await setting("NOSANA_API_KEY"),
    });
    return Response.json(receipt, { headers: { "Cache-Control": "no-store" } });
  } finally { busy = false; }
}
