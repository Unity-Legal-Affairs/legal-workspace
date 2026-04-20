---
name: nda-traffic-light
description: Use when a queue item's category is `nda` and no trafficLight has been set yet — apply the mutual/one-way + residuals + term + governing-law rubric to classify GREEN (standard approval), YELLOW (counsel review — one non-standard clause), or RED (full legal review — liability/IP/non-compete present).
---

# NDA Traffic Light

## When to use
`triage-inbound` has just set `category = "nda"` on a queue row and `ndaTrafficLight` is not yet populated, OR a previously-classified NDA needs re-evaluation because an updated redline arrived. This skill decides whether the NDA is eligible for a template approval (GREEN) or must be routed to Counsel (YELLOW / RED).

## Rubric (inline — this is the playbook)

**GREEN — standard approval eligible.** ALL of the following must hold:
- Mutual (both parties disclose)
- Standard residuals language (or no residuals clause)
- Term ≤ 3 years
- US governing law (our pre-approved jurisdictions)
- No non-compete, no IP-assignment, no indemnity, no unlimited liability, no publicity clause

**YELLOW — counsel review (one non-standard clause).** Exactly one of the GREEN criteria fails. Typical triggers:
- One-way NDA where we are the sole discloser
- Term 3–5 years
- Broad residuals (favoring either side)
- Non-US governing law from an acceptable adjacent jurisdiction (e.g. Canada, UK)

**RED — full legal review.** TWO OR MORE GREEN criteria fail, OR **any** of these blocked clauses is present (any single one forces RED regardless of other terms):
- Non-compete language
- IP-assignment language (any form)
- Unlimited liability or uncapped indemnity
- Publicity / press-release obligations
- Term > 5 years or "perpetual"
- Non-standard governing law (outside pre-approved list)

If the heuristic cannot confidently classify the NDA (ambiguous clauses, unparseable text), default to RED.

## Steps
1. **Load the request** from `intake/{id}/request.json`. If mutuality, term, residuals, or governing law are missing from the extracted metadata, re-parse the attachment via Composio and fill them.
2. **Evaluate the rubric in order: RED → YELLOW → GREEN.** First hit wins (RED dominates). Collect the short labels of any non-standard / blocked clauses into `flagClauses` (e.g. `["non-compete", "IP assignment"]`).
3. **Record the decision.** Update the `queue.json` row:
   - Set `ndaTrafficLight` to `"GREEN" | "YELLOW" | "RED"`.
   - If YELLOW or RED: set `attorneyReviewRequired = true`.
   - Refresh `updatedAt`.
4. **Upsert `ndas.json`** with an `NdaRow`: `queueId`, `counterparty`, `mutual`, `termMonths`, `residuals`, `governingLaw`, `trafficLight`, `flagClauses`. Atomic write (`.tmp` + rename).
5. **Append a rationale paragraph** to `intake/{id}/request.json`'s `classificationNotes` naming the specific clause(s) that triggered the color.
6. **Hand off.**
   - GREEN → leave status at `classified`; the user (or follow-up skill) can run `draft-template-response` with the `nda-approve` template.
   - YELLOW → run `route-to-counsel`.
   - RED → run `route-to-counsel` (and consider `open-matter` if the deal is substantive).

## Outputs
- Updates `queue.json` (`ndaTrafficLight`, `attorneyReviewRequired`, `updatedAt`)
- Upserts `ndas.json` (new or updated `NdaRow`)
- Updates `intake/{id}/request.json` (appends to `classificationNotes`)
