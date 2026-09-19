export type EvidenceProviderName = "tavily" | "bright-data" | "mock-tavily";
export type EvidenceRunMode = "live" | "mock";
export type EvidenceProviderStatus = "complete" | "partial" | "empty" | "failed";
export type EvidenceDecision = "maintain" | "revise" | "abstain";

export type EvidenceRefreshQuery = {
  questionId: string;
  subject: string;
  concept: string;
  searchTerms: string[];
  allowedDomains: string[];
  knownSourceUrls?: string[];
};

export type EvidenceDocument = {
  id: string;
  url: string;
  title: string;
  text: string;
  sourceKind: "official" | "instructor-owned";
  retrievedAt: string;
  publishedAt?: string;
  score?: number;
};

export type EvidenceProviderResult = {
  provider: EvidenceProviderName;
  mode: EvidenceRunMode;
  status: EvidenceProviderStatus;
  requestId: string | null;
  documents: EvidenceDocument[];
  errorCode?: string;
};

export type EvidenceProviderAttempt = Omit<EvidenceProviderResult, "documents"> & {
  documentCount: number;
  latencyMs: number;
};

export type EvidenceRefreshRun = {
  status: "complete" | "failed";
  selectedProvider: EvidenceProviderName | null;
  fallbackUsed: boolean;
  documents: EvidenceDocument[];
  attempts: EvidenceProviderAttempt[];
};

export type EvidenceAssessment = {
  decision: EvidenceDecision;
  diagnosis: string;
  reason: string;
  evidenceIds: string[];
  learnerAction: string;
  instructorAction: string;
  confidence: number;
  model: string;
  mode: EvidenceRunMode;
};

export interface EvidenceProvider {
  readonly name: EvidenceProviderName;
  retrieve(query: EvidenceRefreshQuery): Promise<EvidenceProviderResult>;
}

export class EvidenceProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvidenceProviderError";
  }
}

const MAX_DOCUMENT_TEXT_LENGTH = 1_500;
const MAX_DOCUMENTS = 5;

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function isAllowedEvidenceUrl(url: string, allowedDomains: string[]) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return allowedDomains.some((value) => {
      const domain = normalizeDomain(value);
      return hostname === domain || hostname.endsWith(`.${domain}`);
    });
  } catch {
    return false;
  }
}

export function buildEvidenceSearchQuery(query: EvidenceRefreshQuery) {
  return [query.subject, query.concept, ...query.searchTerms]
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10)
    .join(" ");
}

export function normalizeEvidenceDocuments(
  documents: EvidenceDocument[],
  allowedDomains: string[],
) {
  const seen = new Set<string>();
  return documents
    .filter((document) => isAllowedEvidenceUrl(document.url, allowedDomains))
    .filter((document) => {
      if (seen.has(document.url)) return false;
      seen.add(document.url);
      return true;
    })
    .map((document) => ({
      ...document,
      title: document.title.trim().slice(0, 240),
      text: document.text.trim().slice(0, MAX_DOCUMENT_TEXT_LENGTH),
    }))
    .filter((document) => document.text.length > 0)
    .slice(0, MAX_DOCUMENTS);
}

function providerErrorCode(error: unknown) {
  return error instanceof EvidenceProviderError ? error.code : "provider_error";
}

export async function retrieveEvidenceWithFallback(
  query: EvidenceRefreshQuery,
  providers: EvidenceProvider[],
): Promise<EvidenceRefreshRun> {
  if (!query.questionId.trim() || !query.concept.trim() || query.allowedDomains.length === 0) {
    throw new EvidenceProviderError(
      "invalid_query",
      "Evidence refresh requires a question ID, concept, and allowed domains.",
    );
  }

  const attempts: EvidenceProviderAttempt[] = [];
  for (const [index, provider] of providers.entries()) {
    const startedAt = Date.now();
    try {
      const result = await provider.retrieve(query);
      const documents = normalizeEvidenceDocuments(result.documents, query.allowedDomains);
      attempts.push({
        provider: result.provider,
        mode: result.mode,
        status: documents.length > 0 ? result.status : "empty",
        requestId: result.requestId,
        errorCode: result.errorCode,
        documentCount: documents.length,
        latencyMs: Date.now() - startedAt,
      });
      if (documents.length > 0) {
        return {
          status: "complete",
          selectedProvider: result.provider,
          fallbackUsed: index > 0,
          documents,
          attempts,
        };
      }
    } catch (error) {
      attempts.push({
        provider: provider.name,
        mode: "live",
        status: "failed",
        requestId: null,
        errorCode: providerErrorCode(error),
        documentCount: 0,
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  return {
    status: "failed",
    selectedProvider: null,
    fallbackUsed: attempts.length > 1,
    documents: [],
    attempts,
  };
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new EvidenceProviderError("invalid_assessment", `${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function parseEvidenceAssessment(
  value: unknown,
  documents: EvidenceDocument[],
): EvidenceAssessment {
  if (!value || typeof value !== "object") {
    throw new EvidenceProviderError("invalid_assessment", "Assessment must be an object.");
  }
  const candidate = value as Record<string, unknown>;
  const decisions: EvidenceDecision[] = ["maintain", "revise", "abstain"];
  if (!decisions.includes(candidate.decision as EvidenceDecision)) {
    throw new EvidenceProviderError("invalid_assessment", "Assessment decision is invalid.");
  }
  const confidence = Number(candidate.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new EvidenceProviderError("invalid_assessment", "Assessment confidence must be between 0 and 1.");
  }
  const evidenceIds = Array.isArray(candidate.evidenceIds)
    ? candidate.evidenceIds.filter((item): item is string => typeof item === "string")
    : [];
  const availableIds = new Set(documents.map((document) => document.id));
  if (evidenceIds.some((id) => !availableIds.has(id))) {
    throw new EvidenceProviderError("unknown_evidence", "Assessment references unknown evidence.");
  }
  const decision = candidate.decision as EvidenceDecision;
  if (decision !== "abstain" && evidenceIds.length === 0) {
    throw new EvidenceProviderError(
      "missing_evidence",
      "Maintain and revise decisions require at least one evidence ID.",
    );
  }

  return {
    decision,
    diagnosis: requireString(candidate.diagnosis, "diagnosis"),
    reason: requireString(candidate.reason, "reason"),
    evidenceIds,
    learnerAction: requireString(candidate.learnerAction, "learnerAction"),
    instructorAction: requireString(candidate.instructorAction, "instructorAction"),
    confidence,
    model: requireString(candidate.model, "model"),
    mode: candidate.mode === "live" ? "live" : "mock",
  };
}
