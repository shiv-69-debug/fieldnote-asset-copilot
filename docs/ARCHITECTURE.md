# Architecture

## Question → evidence → answer

1. **Ingestion (`src/store.js`).** Read JSON/JSONL by well, follow every `report_file`, load all well manuals/SOPs, and retain originals. Validate asset ownership, duplicate record IDs, report paths and inspection triggers. SQLite stores source snapshots, FTS5 document search, shared knowledge, private conversations and dataset fingerprints. In-memory well indexes make linked traversals cheap.
2. **Planning (`src/planner.js`).** Gemma returns a schema-constrained domain plan. Explicit literals are checked by a local parser so a model cannot silently broaden type scope, drop a “top 3” limit, lose a date range, or turn feedback into a read. Inspectable telemetry retains the proposed plan and adjustments. Unsupported language is not claimed to work offline.
3. **Computation (`src/engine.js`).** Domain tools implement status, temperature history, downtime, corrected spills, heatmaps, costs, RCA, compliance, planned work, repair lists and report-check retrieval. Thresholds and key deadlines are extracted from the manuals/SOPs at startup; unrecognized required rules stop ingestion instead of being guessed. The guide supplies the seven-days-per-nonproducing-inspection convention.
4. **General numerical analysis (`src/analytics*.js`).** Statistical questions can produce a read-only SQLite query over effective inspections, wells, repairs, events and report facts/checks. A separate worker has no private-memory tables, cannot load extensions or attach files, has an eight-second deadline, and caps results at 500 rows. User-relative asset scope is enforced before loading its tables. Results must carry known source IDs. A malformed query has one bounded repair attempt. Syntax and citation checks do not prove every generated query semantically correct.
5. **Document answers (`src/service.js`).** Retrieval keeps manuals/SOPs available alongside report excerpts. Exact protocol clauses can be quoted directly. Model synthesis receives bounded source text and must return valid source IDs. A source citation proves the source exists, not that every model interpretation is correct.
6. **Generative UI (`public/app.js`).** A validated answer envelope contains summary, rows, visual, per-row evidence, conflicts, open actions, date range and telemetry. Reusable components render inline. Charts have accessible tables; multi-well time series use a shared date axis. Maps use real metadata coordinates with OpenStreetMap tiles. Browser requests send the page origin as Referer and honor normal HTTP caching. Tile status and image decoding are checked before display, so a valid PNG error response cannot cover the map. If the basemap cannot load completely, a labeled geographic coordinate grid preserves the pins and evidence.

## Corrections and scope

Original source files are immutable. Shared feedback is append-only, with actor, time, original value, previous effective value, reason, inspection/field or well/type/equipment scope. Effective readings apply formal corrections before filters and calculations. A ordinary conflicting note is context, not an override. Competing explicit corrections retain all versions and surface disagreement; the latest correction is the effective value until clarified.

Type RCA policies match type **and** equipment. A well-specific policy additionally matches its well and takes precedence over the broader type policy. Policies are identified as user/team rules rather than rewritten manuals.

Report-authored compliance remains distinguishable from recomputed obligations. `report_checks.status` is historical; `basis_valid` and `effective_status` disclose superseded inputs. A repaired spill does not prove passing agency verification. Planned finish dates and past-tense summaries do not close interim repairs.

## Private memory

Conversation rows are keyed by user and chat. The model is never handed another user's history. Cross-chat references resolve distinct well sets in that user's history, matching an explicit set size where given. No prior matching conversation means clarification. A single-well time series cannot replace a three-well collection. This is deliberately a modest memory resolver; complex ambiguous references can still require clarification.

The user picker is the challenge's identity mechanism, not production authentication. All source well data and shared feedback are intentionally shared. A production deployment needs authenticated sessions and server-derived identity before being exposed beyond trusted local use.

General memory requests are handled before model planning. They return a bounded list of the selected user's recent discussion references and a clarification question. Conversation-source retrieval checks the same user scope; private references are never inserted into the shared source registry. The sidebar loads lightweight conversation metadata and fetches full messages only for the selected chat.

## Conversation presentation and output quality

Generated summaries are checked for missing text, excessive length, and repetitive symbol/word sequences as well as valid source IDs. One repair attempt is allowed for invalid synthesis; repeated failure produces a concise clarification or a direct, cited rule fallback. The same quality check prevents malformed historical model text from flooding the UI, while original history remains available in exports.

The main conversation contains a short answer, the requested visual, and a single action row. Sources, full data, and technical diagnostics are explicit panels rather than automatic document dumps. Large tables preview eight rows with paginated/filterable data access; large bar comparisons preview six rows with a complete-chart option. Reading an older message disables automatic following until the user chooses Latest. Sidebar changes resize maps, and off-screen maps defer tile requests until visible.

## Compliance and honesty

Historical violations, open fines, pending obligations, missing evidence, fulfilled requirements and conflicts are separate. Fines are summed from actual regulator events, never invented for inferred breaches. Unknown containment times remain unknown. Missing proof of supervisor notification is labeled a missing-evidence action rather than proof no notification occurred.

The sample rubric categorizes the unlogged in-progress shut-in as an open action even though the manual requires logging before work. The output records that distinction. Current-year annual tests are pending until year end when absent; general custom historical audits should explicitly define their window.

## Resilience and remaining boundaries

- No question IDs, expected answers or benchmark result files enter runtime reasoning. The fixed scenarios are acceptance tests, not lookup responses.
- Exact supplied scenarios have strong domain coverage. Broader SQL reasoning and document interpretation remain model-dependent and have only limited additional probes.
- Report extraction handles the supplied narrative/table patterns; new wording may require a parser extension. Missing extraction is not assumed compliant.
- Not every operating step can be verified from this dataset. Some WS/RC requirements have only report assertions or incomplete evidence. The system should not be described as a complete real-world regulatory audit.
- A repeated provider failure is surfaced. Supported local tools or verbatim SOP clauses can answer with an explicit fallback badge; unsupported questions retain a visible failure rather than an invented answer.
- Relative date conventions are configurable, calendar-based and visible. Overdue date-only obligations are assessed after their due date; the app does not pretend a date-only analysis gives an exact current hour.
- Identical records deduplicate across imports. Conflicting duplicates fail preflight. An imported metadata snapshot can be newer than the original while original inspections remain preserved.

## Models, usage and cost

Default: `gemma-4-26b-a4b-it` through Google's API. OpenAI-compatible endpoints are configurable. The provider's token usage and latency are exported for successful calls, including query repair and synthesis. Failed calls may not return usage, so exports are not account-wide billing totals. The supplied prerequisites describe Gemma as free-tier; actual invoice cost is not measured here.

Provider HTTP failures now retain redacted error details and the status/timing of every attempt. A configured key is not reported as a live connection. See [the HTTP 500 investigation](PROVIDER_DIAGNOSIS.md) for a minimal direct-provider reproduction and the distinction between model and local answers.

Next steps: wider paraphrase/property evaluations, stronger semantic SQL validation, authenticated deployment, incremental ingestion for larger fields, and richer temporal reference resolution.
