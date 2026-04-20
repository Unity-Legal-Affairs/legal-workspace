---
name: draft-template-response
description: Use when a queue item matches a known response template (DSR, litigation hold ack, vendor security response, NDA-approve, privacy inquiry, subpoena ack, insurance cert request) — render the template with the extracted variables, run the template's escalationRules against the queue item, and write a draft. Never send. If any escalation rule triggers, flag attorneyReviewRequired and set status to 'routed' with routedTo='counsel' instead of drafting.
---

# Draft Template Response

## When to use
A queue item has been classified (via `triage-inbound` and, for NDAs, `nda-traffic-light`) and its category maps cleanly to one of the templates in `templates.json`. Typical matches: DSR, litigation-hold ack, vendor-security response, NDA-approve (GREEN only), privacy-inquiry, subpoena-ack, insurance-cert request.

**Never call this skill to send anything. Drafts only.** If any template escalation rule fires, the item gets routed to Counsel instead of drafted.

## Steps
1. **Load the queue row** from `queue.json` and the full request from `intake/{id}/request.json`. Confirm the item is not `closed`.
2. **Load `templates.json`.** Pick the template whose `key` matches the queue item's category:
   - `dsr` → template key `"dsr"`
   - `litigation-hold` → `"litigation-hold"`
   - `vendor-security` or `security-questionnaire` (routine) → `"vendor-security"`
   - `nda` with `ndaTrafficLight = "GREEN"` → `"nda-approve"`
   - `privacy` → `"privacy-inquiry"`
   - `subpoena` → `"subpoena-ack"` (ack only — never substantive response)
   - insurance cert request → `"insurance-cert"`
   If no template matches cleanly, STOP — this item is not a template-response candidate. Route to Counsel instead.
3. **Extract placeholder values** from `intake/{id}/request.json` (counterparty, requester, subject, receivedAt, any questionnaire-specific fields). Substitute every `{{placeholder}}` in `template.body`.
4. **Run `template.escalationRules`** against the queue item + full request. Each rule is a plain-English condition (e.g. "If dataset mentioned contains children's data → escalate to counsel"). Evaluate each:
   - **If ANY rule fires**: STOP drafting. Set `queue.json` row's `attorneyReviewRequired = true`, `status = "routed"`, `routedTo = "counsel"`. Append the triggered rule text to `intake/{id}/request.json`'s `classificationNotes`. Call `route-to-counsel` to package context. Do NOT write a draft file.
   - **If no rule fires**: continue to step 5.
5. **Atomically write the draft** to `intake/{id}/draft-response.md` (`.tmp` + rename). Include a prominent header line at the top: `> Draft — pending human approval. Never send automatically.`
6. **Update the queue row.** Set `status = "drafted"`, refresh `updatedAt`. Atomic write.

## Outputs
- Writes `intake/{id}/draft-response.md` (template-rendered draft) — only when no escalation rule fired
- Updates `queue.json` (`status`, `updatedAt`; or `routedTo="counsel"` + `attorneyReviewRequired=true` on escalation)
- Updates `intake/{id}/request.json` (appends triggered rule text to `classificationNotes` on escalation)
