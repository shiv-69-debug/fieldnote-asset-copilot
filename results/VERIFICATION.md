# Verified results — 17 October 2026

## Supplied scenarios

- **18/18 passed through HTTP `/api/chat` in local mode.**
- **18/18 passed through HTTP `/api/chat` with live-model mode enabled.** The recorded 31-turn run contains **27 successful model-backed turns and 4 explicitly labeled local fallbacks**. This is a hybrid system result, not 31 successful model calls or proof of unguarded model accuracy.
- **52/52 automated tests passed**, including all 18 scenarios on both analysis dates, scope and memory regressions, source-derived boundaries, unknown correction targets, import/restart behavior, SQL isolation and UTF-8 HTTP handling.
- **6/6 Chromium browser tests passed**, including every prescribed visual, original-source inspection, cross-user correction propagation/private history, mobile/text safety, aligned multi-well chart dates, and visible fallback behavior.
- **3/3 additional smoke probes passed:** an independently checked numerical average, WS-03 report filtering, and a source-grounded H2S procedure answer. Two used live models; the SOP answer used a disclosed exact-source fallback after a provider error.

### Evidence

- [`local-evaluation.json`](local-evaluation.json): every scenario's full request/response transcript.
- [`live-evaluation.json`](live-evaluation.json): model proposals, literal-constraint adjustments, usage, failures/fallbacks, sources and answers. Latest recorded run: `2026-10-17T08:33:30.238Z`.
- [`generalization.json`](generalization.json): the three additional probes. They are a limited smoke test, not a general benchmark.
- [`../docs/assets/`](../docs/assets/): actual local-mode screenshots.
- [`../docs/submission-draft.pdf`](../docs/submission-draft.pdf): two-page rehearsal write-up; final results still need replacing.

Source dataset repository revision: `b8de8c9bd68f40334e5d06922126169e4f3bf3ca`. Each answer additionally carries a SHA-256 fingerprint of the loaded source snapshot.

## Important interpretation

The expected numbers, dates, IDs, visuals and feedback effects are asserted, not merely matched by a phrase in the answer. Expected answers exist only in tests; production code never reads them. Standard domain phrases are guarded deterministically, and unsupported statistical/document reasoning remains model-dependent. Provider HTTP 500/429 failures occurred during development; fallback is visible and counted separately.

The organizer's final dataset/questions were not supplied. Their benchmark results and a category prize are **not established by these sample tests**. The participant still needs the final-data run, their own-voice video, public repository publication and OrganizerHQ submission.

## Q7 map regression verification

The map request previously suppressed the Referer required by OpenStreetMap, and `<img>` could display a valid PNG returned with HTTP 403. Both cases now have browser regression coverage. **8/8 browser tests passed** after the fix. A live Q7 check received HTTP 200 for all ten visible-viewport tiles, sent the real page origin, and rendered all four pins. Rejected tiles produce a labeled coordinate view instead of displaying the error images. See `map-diagnostic.json` and `map-diagnostic.png` for the live probe; `node scripts/diagnose-map.js` repeats it.

## Recording-based memory and layout regression verification

The recording showed “Remembering past conversations” being sent to document search. Its saved model reply contained 2,287 characters, including repetitive quotes, followed by full manual excerpts in the chat. The original stored reply is preserved; the shared quality checker identifies it as malformed.

After the fix, **59/59 unit/API/scenario tests** and **12/12 browser tests** passed. **18/18 supplied scenarios** also passed again through the local HTTP evaluation. New checks cover private-memory routing, source privacy, invalid synthesis recovery, hidden historical text walls, result filtering, sidebar collapse, and Latest navigation. The desktop layout test confirms that the message viewport occupies more than 70% of a 900px-high window while answer text remains at least 15px.

This update did not repeat the earlier full live-model benchmark. A generic memory heading now uses a deterministic private-history lookup; it does not require a successful model-provider request.
