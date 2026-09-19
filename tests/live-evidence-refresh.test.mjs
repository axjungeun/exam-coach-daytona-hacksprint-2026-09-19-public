import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses Tavily for allowlisted discovery and extraction", async () => {
  const source = await readFile(
    new URL("../app/lib/providers/tavily-evidence.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /TAVILY_API_KEY/);
  assert.match(source, /\/search/);
  assert.match(source, /include_domains: query\.allowedDomains/);
  assert.match(source, /\/extract/);
  assert.match(source, /chunks_per_source: 3/);
});

test("uses Bright Data only with a known allowlisted fallback URL", async () => {
  const source = await readFile(
    new URL("../app/lib/providers/bright-data-evidence.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /query\.knownSourceUrls/);
  assert.match(source, /isAllowedEvidenceUrl/);
  assert.match(source, /no_known_source_url/);
  assert.match(source, /BRIGHT_DATA_API_KEY/);
});

test("keeps maintain, revise, and abstain states evidence-bound", async () => {
  const contract = await readFile(
    new URL("../app/lib/evidence-refresh.ts", import.meta.url),
    "utf8",
  );
  const fixture = JSON.parse(
    await readFile(
      new URL("../app/data/live-evidence-refresh.mock.json", import.meta.url),
      "utf8",
    ),
  );
  assert.match(contract, /"maintain" \| "revise" \| "abstain"/);
  assert.match(contract, /missing_evidence/);
  assert.match(contract, /unknown_evidence/);
  assert.deepEqual(
    new Set(fixture.assessments.map((assessment) => assessment.decision)),
    new Set(["maintain", "revise", "abstain"]),
  );
});
