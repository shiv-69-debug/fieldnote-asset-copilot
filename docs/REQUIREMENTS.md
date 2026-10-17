# Challenge coverage and verification

Source of requirements: the user-supplied PDFs and the official repository's four Markdown documents, both manuals, and all three SOPs. The repository/PDF date discrepancy is documented in the README.

## Acceptance scenarios

| Cases | Coverage | Verification |
|---|---|---|
| Q1–Q2 | Latest inspection, type threshold, stale recorded status, people names, contextual cause or unknown reason | Exact well/inspection IDs, dates, deltas, cause evidence, card/table |
| Q3 | Thirteen-week thermal comparison and nonproducing markers | 13 readings, exact endpoints, two down dates, line chart |
| Q4 | Corrected real-spill history | Six dated spills, 15.1 barrels, rainwater excluded with evidence |
| Q5–Q6 | Inspection-derived downtime and ranking | 21-day year result; 49/42/42-day leaders; evidence and bars |
| Q7–Q8 | Geographic spill map and corrected area/month counts | Four exact coordinates; every heatmap cell and row total |
| Q9–Q10 | Cross-document compliance and report-only containment | Four reference breaches, $5,000 open fine, two late-containment events |
| Q11 | Own user's previous well set in a new chat | Three exact repair-cost sums |
| Q12–Q13 | Raw-reading and analysis corrections | Original values, target IDs, actor, changed production/reportability, conflict and deadlines |
| Q14 | Persisted type/equipment RCA policy | Added T350 well only; T200 exclusion; user-rule attribution |
| Q15 | Shared corrections across users | Corrected status and newly reportable spill visible to other users |
| Q16 | Shared planned work, private conversations | Shared shutdown; no cross-user history leakage |
| Q17–Q18 | Conflicting user claims and conflicting analysis notes | Both views retained, unconfirmed claims, underlying evidence wins absent formal correction |

Each case starts with pristine sample data unless it explicitly chains earlier turns. Both PDF/repository analysis dates are tested. The HTTP runner stores every user turn and answer, including intermediate correction confirmations, rather than only the final assertion.

## Broader requirements

- **Source evidence:** originals are directly inspectable; row-level provenance is retained, including the special noncanonical report filenames.
- **Generative visuals:** named visual wins; otherwise result shape determines the inline component. Accessible table alternatives accompany graphical results.
- **Memory lifetime:** shared knowledge and user-scoped history survive a server restart. Import roots persist too.
- **New data:** test adds an unseen well/area alongside all originals, checks deduplication/reload, and confirms private memory survives.
- **Date and numeric boundaries:** equality at production thresholds, 1/5/25-bbl classes, leap-year/month-end windows, negative correction rejection, explicit sub-year date ranges and open planned finishes.
- **Additional rule access:** report-check filtering exposes WS failures; document retrieval exposes the complete manuals and SR/RC/WS procedures. Incomplete evidence does not establish full operational compliance.
- **Robustness:** UTF-8 HTTP chunk boundaries, text-only rendering, cross-origin write rejection, SQL/private-history separation, fixed query limits and worker timeout.

## Submission status

The application, tests, export workflow, license, documentation and two-page **sample rehearsal** generator are supplied. Final questions/dataset are not available in the supplied materials. Their outcomes must replace the rehearsal results. The participant must record the required own-voice video and publish/submit the repository through OrganizerHQ.
