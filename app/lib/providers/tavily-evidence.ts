import {
  buildEvidenceSearchQuery,
  EvidenceProviderError,
  isAllowedEvidenceUrl,
  type EvidenceDocument,
  type EvidenceProvider,
  type EvidenceProviderResult,
  type EvidenceRefreshQuery,
} from "../evidence-refresh";

type TavilySearchPayload = {
  request_id?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
};

type TavilyExtractPayload = {
  request_id?: string;
  results?: Array<{
    url?: string;
    raw_content?: string;
  }>;
};

type TavilyEvidenceProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export class TavilyEvidenceProvider implements EvidenceProvider {
  readonly name = "tavily" as const;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: TavilyEvidenceProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.tavily.com").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async retrieve(query: EvidenceRefreshQuery): Promise<EvidenceProviderResult> {
    if (!this.apiKey) {
      throw new EvidenceProviderError("missing_credentials", "TAVILY_API_KEY is not configured.");
    }

    const intent = buildEvidenceSearchQuery(query);
    const searchResponse = await this.fetcher(`${this.baseUrl}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: intent,
        search_depth: "basic",
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
        include_domains: query.allowedDomains,
        safe_search: true,
      }),
    });
    if (!searchResponse.ok) {
      throw new EvidenceProviderError(
        `tavily_search_${searchResponse.status}`,
        "Tavily Search request failed.",
      );
    }

    const searchPayload = (await searchResponse.json()) as TavilySearchPayload;
    const candidates = (searchPayload.results ?? []).filter(
      (item) => item.url && isAllowedEvidenceUrl(item.url, query.allowedDomains),
    );
    if (candidates.length === 0) {
      return {
        provider: this.name,
        mode: "live",
        status: "empty",
        requestId: searchPayload.request_id ?? null,
        documents: [],
      };
    }

    const extractResponse = await this.fetcher(`${this.baseUrl}/extract`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        urls: candidates.map((item) => item.url),
        query: intent,
        chunks_per_source: 3,
        extract_depth: "basic",
        format: "markdown",
        include_images: false,
      }),
    });

    let extracts = new Map<string, string>();
    let extractRequestId: string | undefined;
    if (extractResponse.ok) {
      const extractPayload = (await extractResponse.json()) as TavilyExtractPayload;
      extractRequestId = extractPayload.request_id;
      extracts = new Map(
        (extractPayload.results ?? [])
          .filter((item): item is { url: string; raw_content?: string } => typeof item.url === "string")
          .map((item) => [item.url, item.raw_content ?? ""]),
      );
    }

    const retrievedAt = new Date().toISOString();
    const documents: EvidenceDocument[] = candidates.map((item, index) => ({
      id: `tavily:${searchPayload.request_id ?? "request"}:${index + 1}`,
      url: item.url as string,
      title: item.title ?? new URL(item.url as string).hostname,
      text: extracts.get(item.url as string) || item.content || "",
      sourceKind: "official",
      retrievedAt,
      score: item.score,
    }));

    return {
      provider: this.name,
      mode: "live",
      status: extractResponse.ok ? "complete" : "partial",
      requestId: [searchPayload.request_id, extractRequestId].filter(Boolean).join(":") || null,
      documents,
      errorCode: extractResponse.ok ? undefined : `tavily_extract_${extractResponse.status}`,
    };
  }
}

export function createTavilyEvidenceProvider() {
  return new TavilyEvidenceProvider({ apiKey: process.env.TAVILY_API_KEY });
}
