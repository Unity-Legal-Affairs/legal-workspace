---
name: board-package
description: Use when a board meeting is scheduled or the user asks "prep board consents for Q3" — open (or reuse) a `practiceArea=corp` matter titled "Board prep YYYY-QX", assemble consents needed, the open-item list from matters.json, cap-table attestation needs, and pending corporate filings, then write the package as `matters/{id}/board-package.md` under that matter.
---

# Board Package

## When to use

- A board meeting is on the calendar (user told you, or you saw it via a calendar integration).
- The user asks: "prep the Q3 board package", "what consents do we need to get signed", "what's open for the board."
- Quarter boundary hit and no board-prep matter exists yet for the upcoming quarter.

## Steps

1. **Identify the quarter.** `YYYY-QX` form. If the user didn't specify, use the current or next quarter with a scheduled board date.
2. **Find or create the matter.** Look in `matters.json` for an existing matter with `title = "Board prep {YYYY-QX}"` and `practiceArea = "corp"`. If found, reuse its id. If not, call `open-matter` to create one:
   - `title: "Board prep YYYY-QX"`
   - `practiceArea: "corp"`
   - `ownerType: "in-house"`
   - `status: "open"`
   - `tags: ["board", "corp", "{YYYY-QX}"]`
3. **Pull consents to sign** — look at corp-practice matters closed or in-flight in the quarter; typical consent-worthy items:
   - Option grants (read from Composio: Carta or the cap-table tool; or from matters with `tags` containing `option-grant`).
   - Board resolutions adopted since the last meeting.
   - Officer appointments / committee changes.
   - Financing closings from the quarter.
4. **Open items for discussion** — scan `matters.json` for rows where `status` is `open | waiting | in-review | negotiating | closing` AND either `attorneyReviewRequired` is true OR `riskScore >= 70`. Cap at 10, sort by `riskScore` desc.
5. **Cap-table attestations** — via Composio (Carta), check whether any attestation has been requested or is expected (typically at fiscal year-end and at financing closings). Note cycle dates.
6. **Pending filings** — read `deadlines.json` for rows in the next ~90 days with type in `["franchise-tax", "sccs-update", "cap-table-certification", "board-consent-due"]`.
7. **Write `matters/{id}/board-package.md` atomically** with this structure:

   ```
   # Board Package — {YYYY-QX}

   _Meeting: {date if known}. Matter: {matter.id}._

   ## Consents To Sign
   - [grant / resolution summary] — source: {matterId or docRef}
   - ...

   ## Open Items For Discussion
   - [matter title] — risk {score} — {status} — {matterId}
   - ...

   ## Filings Due
   - {type} — {description} — due {dueAt} — {status}
   - ...

   ## Cap-Table Attestations
   - {what's expected} — {owner} — {due window}

   ## Notes & Gaps
   - {anything we couldn't resolve — e.g., "no Carta connection"}
   ```

8. **Link the package into the matter.** In `matters/{id}/matter.json`, append a `doc-added` timeline event pointing at `matters/{id}/board-package.md` and add the entry to `docs` with `kind: "memo"`.
9. **Notify the user** in chat with a one-line summary and the path to the package.

## Outputs

- `matters/{id}/board-package.md` (the package).
- `matters/{id}/matter.json` (timeline + docs update).
- `matters.json` (upsert via `open-matter` if we created the matter).

## Never

- Never send signature requests for consents. The General Counsel initiates that flow.
- Never invent option grants, resolutions, or filings. If a data source is missing, list the gap under "Notes & Gaps" instead of fabricating content.
