import assert from "node:assert/strict";
import test from "node:test";
import { analyzeWriting, compareWriting, createTeachingStore, latestForUnit, sampleText, sampleUnit, validTeachingStore } from "../app/lib/essay-review.ts";
import { GET, POST } from "../app/api/essay-ocr/route.ts";
import { secondExamSubjects, unitsForSubject } from "../app/lib/essay-review.ts";

test("second-stage subjects isolate units and preserve legacy unassigned records", () => {
  const medical = { ...sampleUnit, id: "medical", subjectCode: "MEDICAL" };
  const auto = { ...sampleUnit, id: "auto", subjectCode: "AUTO" };
  const units = [sampleUnit, medical, auto];
  assert.equal(secondExamSubjects.length, 4);
  assert.deepEqual(unitsForSubject(units, "MEDICAL"), [medical]);
  assert.deepEqual(unitsForSubject(units, "AUTO"), [auto]);
  assert.deepEqual(unitsForSubject(units, "THIRD"), []);
  assert.deepEqual(unitsForSubject(units, "UNASSIGNED"), [sampleUnit]);
  const store = createTeachingStore();
  assert.equal(validTeachingStore({ ...store, units }), true);
  assert.equal(validTeachingStore({ ...store, units: [{ ...sampleUnit, subjectCode: "INVALID" }] }), false);
});

test("writing review reports mentions and cautions, not grades", () => {
  assert.equal(analyzeWriting(sampleText, sampleUnit.rubric).mentionedCount, 4);
  assert.equal(analyzeWriting("", sampleUnit.rubric).mentionedCount, 0);
  const result = analyzeWriting("계약은 없다. [판독불가]", sampleUnit.rubric);
  assert.equal(result.rows[0].caution, true);
  assert.equal(result.unresolved, true);
  assert.equal(result.rows[0].evidence[0], "계약은 없다.");
});

test("aggregation and resubmission comparison isolate units and rubric versions", () => {
  const s = createTeachingStore();
  const first = s.submissions[0];
  const current = { ...first, id: "new", answer: sampleText, createdAt: "2026-09-19T00:00:00Z" };
  const others = [{ ...current, id: "other", unitId: "other" }, { ...current, id: "version", rubricVersion: "v2" }];
  const records = [...s.submissions, ...others, current];
  assert.equal(latestForUnit(records, sampleUnit).length, 2);
  assert.equal(compareWriting(current, records).before, 2);
  assert.equal(compareWriting(current, records).after, 4);
  assert.equal(compareWriting(others[0], records), null);
  assert.equal(compareWriting(others[1], records), null);
  assert.equal(validTeachingStore(s), true);
  assert.equal(validTeachingStore({ ...s, submissions: [{ ...first, unitId: "unknown" }] }), false);
  assert.equal(validTeachingStore({ ...s, submissions: [{ ...first, answer: "x".repeat(20001) }] }), false);
});

test("OCR validates consent, origin, configuration, upstream failure and truncation", async () => {
  const names = ["ENABLE_ESSAY_OCR", "DASHSCOPE_API_KEY", "REVIEW_PASSWORD_HASH"];
  const original = names.map(n => process.env[n]);
  const originalFetch = globalThis.fetch;
  const req = (body, origin = "http://localhost:3018") => new Request("http://localhost:3018/api/essay-ocr", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
  });
  const input = { consent: true, image: "data:image/png;base64,YQ==" };
  try {
    process.env.ENABLE_ESSAY_OCR = "false";
    assert.equal((await GET(new Request("http://localhost:3018/api/essay-ocr"))).status, 200);
    assert.equal((await POST(req(input))).status, 503);
    assert.equal((await POST(req({ ...input, consent: false }))).status, 400);
    assert.equal((await POST(req(input, "https://other.example"))).status, 403);
    process.env.ENABLE_ESSAY_OCR = "true";
    process.env.DASHSCOPE_API_KEY = "synthetic-test-key";
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.messages[0].content[0].image_url.url, input.image);
      return Response.json({ id: "synthetic-receipt", choices: [{ finish_reason: "stop", message: { content: "계약 [판독불가]" } }] });
    };
    const success = await (await POST(req(input))).json();
    assert.equal(success.requiresReview, true);
    assert.equal(success.text, "계약 [판독불가]");
    assert.equal(JSON.stringify(success).includes("synthetic-test-key"), false);
    globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: "length", message: { content: "partial" } }] });
    assert.equal((await POST(req(input))).status, 422);
    globalThis.fetch = async () => new Response("private upstream details", {status:401});
    const failed = await POST(req(input));
    assert.equal(failed.status, 502);
    assert.equal((await failed.text()).includes("private upstream details"), false);
    delete process.env.REVIEW_PASSWORD_HASH;
    const publicConfig = await (await GET(new Request("https://public.example/api/essay-ocr"))).json();
    assert.equal(publicConfig.available, false);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((n,i) => { if (original[i] === undefined) delete process.env[n]; else process.env[n] = original[i]; });
  }
});
