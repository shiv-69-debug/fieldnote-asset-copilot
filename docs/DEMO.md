# Final demo

## Completed narrated recording — 4 minutes 48 seconds

[Download Fieldnote-demo.mp4](https://github.com/shiv-69-debug/fieldnote-asset-copilot/releases/download/final-submission-v2/Fieldnote-demo.mp4)

The recording uses **synthetic narration**, clearly disclosed in the audio and visuals. From 0:00–2:00 it explains the design, architecture, tools, development and measured final replay. From 2:00–4:48 it executes Q3 in a fresh browser session against the 600-well dataset in explicitly selected **Local analysis** mode, then shows the result, filtered data, source note, SOP and execution details. This demo does not claim to be a fresh model-backed run.

Verified: MP4 with H.264 video and AAC narration, 1600×1000 resolution, duration 288 seconds. Actual browser result: 26 reports, 17 met and 9 missed. Verification metadata: `results/demo-verification.json`.

To reproduce on Windows with Node.js 24+, Playwright Chromium, FFmpeg/ffprobe and Windows System.Speech installed: `node scripts/record-demo.js`. Intermediate audio and browser captures stay in ignored `.local/demo-build/`.

## Optional own-voice version — 4 minutes 50 seconds

Record your screen and your own voice. This is a recording script, not a completed video. Open http://127.0.0.1:3100 before recording. Use the final 600-well dataset, analysis date 15 January 2027. Have `results/final-transcript.html` open in a second tab as recorded evidence; distinguish it from the live run if you show it.

## 0:00–0:30 — Introduce the system

Show the application and dataset counts.

“This is Fieldnote, an asset intelligence copilot for operational questions about oil wells. The final dataset contains 600 wells, 125,198 inspections and 17,415 maintenance records. It combines those records with operator notes, manuals, operating procedures and approval documents. The analysis date is January 15, 2027.”

## 0:30–1:10 — Architecture

Show page one of `docs/final-submission.pdf`.

“The browser sends questions to a Node.js application. SQLite stores operational records, source documents and conversation state, with full-text search for retrieval. Gemma 4, through Google's Gemini API, proposes a structured query plan. The application checks scope, dates and supported operations. Domain-specific tools calculate the actual results and attach source references. This is a hybrid system: the model helps interpret the request, while code applies the operational rules and calculations.”

## 1:10–1:40 — How it was built

“I built the system around ingestion, planning, deterministic analysis, and evidence-linked rendering, using AI-assisted development with OpenCode. Updated dataset records supersede older versions while preserving provenance. The interface renders tables, charts and maps, with source documents and technical details available on demand. Missing measurements are reported as unavailable rather than inferred from unrelated fields.”

## 1:40–2:00 — Memory and verification

“Shared operational reports retain attribution and verification status; private display preferences stay with their author. The final evaluation replayed all 21 turns of the 11 questions through the browser. That recorded run had 18 model-backed read turns, three local memory writes and zero provider fallbacks.”

## 2:00–2:30 — Start one actual scenario: gas-response audit

Return to the application. Select Laura Simmons and start a new chat. Paste and send this exact Q3 prompt:

> Since 1 Nov 2026, every time an operator note reports gas at a well, did we get someone out to that well in time under our operating procedures? List every report and whether the response met the deadline.

“Laura is auditing whether gas reports received a timely response. This question requires joining timestamped operator notes with response records and applying the operating procedure that was effective at the time.”

## 2:30–3:15 — Show the actual result

Show the answer and its table. Read the live totals; the saved final run returned **26 reports: 17 met and nine missed**. Do not claim those totals if the live answer differs.

“The table includes the well, area, report time, response record and time, hours to response, applicable deadline, and whether it was met. The important detail is that the deadline changes: earlier reports use 24 hours, while January reports use 12 hours. Applying one deadline to the whole period would give misleading compliance results.”

## 3:15–4:00 — Follow the evidence end to end

Open Sources for an actual table row. Show its operator note, linked response record, and applicable SOP. Point to the dates and times displayed. Choose a January row if available so the 12-hour rule is visible.

“Here is the original report that starts the response clock. Here is the response evidence, and here is the procedure supporting the deadline. The result is traceable to records rather than an unsupported summary. A reviewer can inspect why this particular report met or missed the requirement.”

## 4:00–4:30 — Show execution details

Open Details → Technical plan, model usage & retry diagnostics. Describe only the mode and telemetry actually shown.

“These details expose the execution plan and model usage. The numerical conclusion comes from the linked data tools. If the provider fails and a supported local fallback is used, that is labeled. This makes the execution inspectable as well as the answer.”

## 4:30–4:50 — Close

Show page two of the report briefly.

“The report summarizes results for all 11 final questions. The saved transcript contains the complete outputs and visuals. This demonstration showed one live workflow from an operational question to a compliance table and its supporting evidence. Judgement-based rankings are labeled as heuristics, and absent measurements remain unknown.”

## Record and upload

1. Record with your screen recorder and microphone; stop by **4:50**, keeping the final video under five minutes. Export as `Fieldnote-demo.mp4`.
2. In Google Drive, create a submission folder and upload `docs/final-submission.pdf` and `Fieldnote-demo.mp4`.
3. Set sharing to **Anyone with the link → Viewer** if required by the submission form. Verify the links in a private browser window. The final report is now three pages.
4. The official questions also request full answers and visuals. Include `results/final-transcript.html` and its linked `results/final-browser/` screenshots as supporting evidence, preserving relative paths when packaging them. The three-page report summarizes those outputs.
5. Submit the report and video links in the organizer's form. Uploading to Drive alone does not submit the entry.
