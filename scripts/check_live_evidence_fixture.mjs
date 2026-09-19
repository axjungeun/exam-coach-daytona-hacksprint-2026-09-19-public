import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fixtureUrl = new URL("../app/data/live-evidence-refresh.mock.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));

assert.equal(fixture.meta.status, "mock-only");
assert.equal(fixture.meta.containsExternalFacts, false);
assert.equal(fixture.meta.containsProtectedQuestionText, false);
assert.ok(Array.isArray(fixture.query.allowedDomains) && fixture.query.allowedDomains.length > 0);
assert.ok(Array.isArray(fixture.documents) && fixture.documents.length > 0);

const allowedDomains = new Set(fixture.query.allowedDomains);
const evidenceIds = new Set(fixture.documents.map((document) => document.id));
for (const document of fixture.documents) {
  assert.ok(allowedDomains.has(new URL(document.url).hostname));
  assert.ok(document.text.length > 0 && document.text.length <= 1_500);
}

const decisions = new Set(fixture.assessments.map((assessment) => assessment.decision));
assert.deepEqual(decisions, new Set(["maintain", "revise", "abstain"]));
for (const assessment of fixture.assessments) {
  assert.ok(assessment.confidence >= 0 && assessment.confidence <= 1);
  assert.ok(assessment.evidenceIds.every((id) => evidenceIds.has(id)));
  if (assessment.decision !== "abstain") assert.ok(assessment.evidenceIds.length > 0);
}

console.log("Live evidence refresh fixture: contract OK (mock only, no external calls).");
