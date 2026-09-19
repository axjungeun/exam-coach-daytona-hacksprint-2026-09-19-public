import type {
  EvidenceDocument,
  EvidenceProvider,
  EvidenceProviderResult,
  EvidenceRefreshQuery,
} from "../evidence-refresh";

export class MockTavilyEvidenceProvider implements EvidenceProvider {
  readonly name = "mock-tavily" as const;

  constructor(private readonly documents: EvidenceDocument[]) {}

  async retrieve(query: EvidenceRefreshQuery): Promise<EvidenceProviderResult> {
    void query;
    return {
      provider: this.name,
      mode: "mock",
      status: this.documents.length > 0 ? "complete" : "empty",
      requestId: "mock-request",
      documents: this.documents,
    };
  }
}
