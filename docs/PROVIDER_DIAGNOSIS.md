# Why the copilot sometimes shows HTTP 500

## Confirmed observation

The running app was configured to call **`gemma-4-26b-a4b-it` through Google's Gemini API**. A key being configured does not establish provider availability.

The original question was replayed against the real planner and directly against the provider. Google returned:

```text
HTTP 500
error.code: 500
error.status: INTERNAL
error.message: Internal error encountered.
```

The failure is intermittent. Three fresh calls through the app initially succeeded. In controlled direct probes, failures were subsequently reproduced. A minimal `Reply with exactly: OK` request, with no response schema, thinking configuration, dataset, or application code, also received the same HTTP 500.

This establishes that a Fieldnote data lookup, frontend change, or complicated response schema is **not required** to trigger the failure. It does not reveal Google's internal fault: only provider-side logs can establish that. No HTTP 429 quota error was observed in these probes.

## Controlled probes

`results/provider-diagnostic.json` changes one setting at a time, rotating order:

- Production request: 3 of 4 direct calls returned 500.
- Smaller response schema only: 1 of 4 returned 500.
- Omitted thinking configuration only: 1 of 4 returned 500.

`results/provider-minimal-diagnostic.json` separately compares the production request and a minimal provider ping. Each returned 500 once in four attempts. These small samples are diagnostic observations, not reliable estimates of long-term failure rates. No request configuration was changed in production based on these inconclusive differences.

Reproduce without changing shared knowledge or chat history:

```sh
node --env-file-if-exists=../.env --env-file-if-exists=.env scripts/diagnose-provider.js --compare
node --env-file-if-exists=../.env --env-file-if-exists=.env scripts/diagnose-provider.js --minimal
```

The script captures the production request using a capture-only fixture, then sends real probes. The fixture is never counted as a successful model call. Probes do not retry, so individual failures remain visible. Captured artifacts exclude authentication headers and redact the configured key. The process exits nonzero if a probe fails.

## What the application does

The production client tries a retryable request up to three times. When all attempts fail, supported domain questions can be answered by the local parser and evidence engine. The app's own HTTP response can be 200 while its answer clearly reports the **upstream** 500 and labels itself local fallback.

The displayed answer is not produced by a second local language model. It comes from ordinary code reading the dataset, applying corrections and rules, performing calculations, and assembling a response.

Changes from this investigation:

- Retain redacted provider error details and each retry's status/timing in answer telemetry.
- Show `Model configured` rather than claiming `AI model connected` merely because a key exists.
- Add `How this answer was produced` to distinguish model planning, SQL execution, document synthesis, and local fallback.
- Add regression tests for exhausted retries, key redaction, and successful recovery after a 500.

The hosted provider's intermittent failure has **not** been fixed by these changes. The local error handling and explanation have been improved.

## Where the answers actually come from

For the reference well, the code reads inspection `INS-0001-0203`: 25.6 °C wellhead minus 22.4 °C air is 3.2 °C. The T200 manual requires at least 15 °C above ambient, so it is not producing. The inspector/date/method come from inspection and user records; the planned shut-in comes from `CTX-0001-003`.

For recognized domain questions, Gemma proposes a plan, but the local parser currently takes precedence over the core operation and filter fields. The evidence engine calculates the results and formats the standard response. Therefore, sample-case success is a **hybrid application result**, not proof that Gemma independently reasoned out every answer.

For broader statistical queries, Gemma can generate SQL that a scoped SQLite worker executes. For document questions, it can help retrieve relevant text and synthesize a cited answer. SQLite/FTS5, source-linked rules, the deterministic tools, shared corrections, and private conversation memory are the other essential parts of the system. No model was trained on this dataset.
