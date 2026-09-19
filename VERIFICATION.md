# Public submission verification

Checked: 2026-09-19 15:05 KST. Scope: the dedicated public synthetic snapshot.

## Completed checks

- `npm test`: all four data checks, production build, and **64/64 tests passed**. Used the existing locked dependency installation via a temporary link; a fresh network installation was not tested.
- A later entry-panel wording-only change passed targeted source assertions and ESLint.
- Real browser: guest demo entry, Daytona/Nosana not-run state, and second-stage synthetic cases inspected. Desktop 1440px and mobile 390px screenshots reviewed.
- A development-only React hydration warning for empty `style` attributes appeared on second-stage navigation; the page rendered and remained usable. This was not a production browser test.
- Independent original-versus-export comparison found zero full original question prompts, long original choices, textbook excerpts, private source paths, or personal written-answer excerpts in exported data.
- 54 independently authored templates generate 1,200 synthetic records with consistent IDs, choices, answers, and provenance. Synthetic attempts and diagnostic scores are internally consistent. This does not prove learning impact or substitute for a legal review.
- Text sources scanned for credentials, private paths, and known local secret values: no matches. Local environment files, raw recordings, original Git history, and deployment account identifiers are excluded.
- Six-page PDF: text and all page renders checked; **376,697 bytes**, below 10 MB. Aggregate screenshots and public source attribution contain no original question text or personal answer excerpts.
- Public MP4: **54.633 seconds**, H.264/AAC, 1600×1000, **2,513,539 bytes**. Full decode and sampled frames passed. Opening question/material scene excluded; creator's recorded voice preserved.

## Execution evidence boundary

`evidence/sponsor-live-2026-09-19.json` and the video record the original local app's successful Daytona and Nosana calls at 14:20 KST. They do not claim this replacement public fixture was run against those services. The public app starts in `not-run` state and requires the reviewer's own keys for new calls.

The PDF uses historical aggregate screenshots and explains that historical records differ from the current answer. Public app data is synthetic. No production deployment, live OCR accuracy, authenticated tenancy, learner improvement, or event-form submission is claimed.

## Publication record

Tags: #execute #update #record #verify. Request: provide a public project repository, final video, slide deck below 10 MB, English documentation, and clear sponsor use. Public assets use a fresh Git history. Previous private originals and earlier Agent Forge releases are preserved.

`UPLOAD_MANIFEST.json` records the SHA-256 and size of each published file, excluding the manifest itself.
