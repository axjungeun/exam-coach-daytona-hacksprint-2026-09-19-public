import {
  EvidenceProviderError,
  isAllowedEvidenceUrl,
  type EvidenceDocument,
  type EvidenceProvider,
  type EvidenceProviderResult,
  type EvidenceRefreshQuery,
} from "../evidence-refresh";

type BrightDataEvidenceProviderOptions = {
  apiKey?: string;
  zone?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export class BrightDataEvidenceProvider implements EvidenceProvider {
  readonly name = "bright-data" as const;
  private readonly apiKey?: string;
  private readonly zone?: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: BrightDataEvidenceProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.zone = options.zone;
    this.baseUrl = options.baseUrl ?? "https://api.brightdata.com/request";
    this.fetcher = options.fetcher ?? fetch;
  }

  async retrieve(query: EvidenceRefreshQuery): Promise<EvidenceProviderResult> {
    if (!this.apiKey || !this.zone) {
      throw new EvidenceProviderError(
        "missing_credentials",
        "BRIGHT_DATA_API_KEY and BRIGHT_DATA_ZONE are not configured.",
      );
    }

    const targetUrl = (query.knownSourceUrls ?? []).find((url) =>
      isAllowedEvidenceUrl(url, query.allowedDomains),
    );
    if (!targetUrl) {
      return {
        provider: this.name,
        mode: "live",
        status: "empty",
        requestId: null,
        documents: [],
        errorCode: "no_known_source_url",
      };
    }

    const response = await this.fetcher(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        zone: this.zone,
        url: targetUrl,
        format: "raw",
        data_format: "markdown",
        country: "kr",
      }),
    });
    if (!response.ok) {
      throw new EvidenceProviderError(
        `bright_data_${response.status}`,
        "Bright Data request failed.",
      );
    }

    const text = await response.text();
    const document: EvidenceDocument = {
      id: `bright-data:${new URL(targetUrl).hostname}`,
      url: targetUrl,
      title: `Known source · ${new URL(targetUrl).hostname}`,
      text,
      sourceKind: "official",
      retrievedAt: new Date().toISOString(),
    };
    return {
      provider: this.name,
      mode: "live",
      status: "complete",
      requestId: response.headers.get("x-request-id"),
      documents: [document],
    };
  }
}

export function createBrightDataEvidenceProvider() {
  return new BrightDataEvidenceProvider({
    apiKey: process.env.BRIGHT_DATA_API_KEY,
    zone: process.env.BRIGHT_DATA_ZONE,
  });
}
