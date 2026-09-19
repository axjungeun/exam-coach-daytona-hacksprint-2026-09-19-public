# Exam Coach — Daytona HackSprint Seoul 2026-09-19

[한국어](./README.md) / English

**Turn practice records into the next review action and instructor feedback.**

Exam Coach is a B2B learning analytics prototype for education platforms and instructors. It connects incorrect answers, recurring concept confusion, review tasks, and instructor feedback. This public submission contains runnable code and clearly labeled synthetic examples.

## Sponsors in action

| Sponsor | Role in the product | Recorded result on September 19 |
|---|---|---|
| **Daytona** | Run structural checks in an ephemeral sandbox and return an execution receipt | **1,200 records, 1,200 unique IDs, zero missing answer fields**; real sandbox ID returned |
| **Nosana** | Generate a reviewable study suggestion from a fixed synthetic example | Real **qwen/qwen3.8-27b** response and request ID; no personal learner answers sent |

[Recorded live evidence](./evidence/sponsor-live-2026-09-19.json) · [Daytona code](./app/api/daytona-hacksprint/route.ts) · [Nosana code](./app/lib/hacksprint-sponsors.ts)

The receipts and video document successful external calls from the local working app at **14:20 KST**. Daytona checked the dataset used then, not this replacement public fixture. The public app starts as **not-run**; supply your own keys to produce fresh results. Structural validity does not prove semantic correctness or official grading. AI-generated suggestions require review.

## Presentation and demo

- [Project slide deck — Korean, 6 slides, 0.38 MB](./slides/Exam-Coach-Project-Slide-Deck-2026-09-19.pdf)
- [Public sponsor demo — approximately 55 seconds](./media/exam-coach-public-sponsor-demo-2026-09-19.mp4)

The PDF is below the 10 MB submission limit. The video shows actual browser interaction: historical analytics, a Daytona run and its fresh receipt, then Nosana generation. It is an excerpt of the 78-second recording, excluding the opening question/material scene. Existing English narration is preserved without voice synthesis, cloning, speed changes, or pitch changes. The Nosana scene uses English on-screen descriptions only. Historical analytics in the recording differ from the synthetic public app fixtures.

## Run locally

Requires Node.js 22.13 or later.

```sh
npm ci
cp .env.example .env.local
npm run dev -- --port 3026
```

Open `http://localhost:3026/?demo=daytona`. Objective practice is at `/exams/first`; written-answer review is at `/exams/second`. For live sponsor calls, set your own `DAYTONA_API_KEY` and `NOSANA_API_KEY` in `.env.local`.

```sh
npm test
```

## Try the learning loop

1. Complete all 40 objective answers, grade the round, and inspect concept review priorities.
2. Distinguish historical analytics from the current attempt; follow the next review task.
3. Select a written-answer subject, create a course/cohort/assignment, and record instructor feedback.
4. Use the Daytona and Nosana controls to run the sponsor workflows with your own keys.

For example, a wrong synthetic answer leads to its concept and a review task. A later attempt records the new result; instructors can compare answers and feedback within the same unit. This demonstrates workflow behavior, not proven learning gains.

## Public data and limits

- **54 independently authored question templates** are repeated into **1,200 synthetic records**; these are not 1,200 distinct authored questions.
- All 480 attempt records, scores, diagnostic examples, and written-answer cases are synthetic and labeled accordingly.
- Textbook and lecture indexes are empty. Original exam texts, personal answers, source excerpts, secrets, account deployment identifiers, and private Git history are excluded.
- Instructor records persist in browser storage. Production authentication, tenant isolation, and live handwriting OCR accuracy are unverified.
- Today's demonstrated sponsor scope is Daytona and Nosana. DNSimple is excluded; legacy adapter code does not establish additional live use today.

## Since Agent Forge

The existing learning loop and Daytona structural checks are joined by separate exam stages, four-subject written-answer review, and course/cohort/assignment feedback workflows. Today's materials add browser interaction, a fresh Daytona receipt, and visible Nosana-generated text. Earlier Agent Forge artifacts already contained live sponsor evidence; this is not presented as the first integration. Learning gains and instructor impact remain to be measured.

[Verification](./VERIFICATION.md) · [Source notice](./SOURCE_NOTICE.md) · [Submission form](https://tinyurl.com/0919submit)

Publishing this repository does not deploy a service or submit the event form.
