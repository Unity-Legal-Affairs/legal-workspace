---
name: security-questionnaire-intake
description: Use when a security or privacy questionnaire arrives (OneTrust, Whistic, custom doc in queue category `security-questionnaire`) — extract the question set, check each question against the last-answered questionnaire for the same counterparty (via `../operator/vendors/{slug}/vendor.json` if present), surface the delta, and open a matter routed to the right owner (counsel for novel questions, self for template answers).
---

# Security Questionnaire Intake

## When to use
A queue item has `category = "security-questionnaire"` (or is a privacy questionnaire of a similar shape), and the questionnaire has not yet been decomposed into its question set. Triggers include vendor security reviews, customer-driven security questionnaires, and privacy-program surveys.

## Steps
1. **Load** the queue row and `intake/{id}/request.json`. Fetch the full questionnaire payload via Composio (the attachment or the linked form) if not already present.
2. **Extract the question set.** Parse into an array of `QuestionnaireQuestion { id, section?, question, expectedFormat? }`. Assign stable ids (stable across re-runs for the same counterparty — hash of section+question text is a reasonable fallback).
3. **Diff against prior answers for this counterparty.**
   - Derive `vendorSlug` from the counterparty (kebab-case). If `../operator/vendors/{vendorSlug}/vendor.json` exists, read it; it records prior questionnaire responses.
   - Compute the delta: `newQuestions[]` (never seen before), `changedQuestions[]` (text materially changed), `unchangedQuestions[]` (answerable from prior responses).
   - If no prior vendor file exists, treat every question as `newQuestions`.
4. **Write the parsed questionnaire + delta** back into `intake/{id}/request.json` under the `questionnaire` field (atomic `.tmp` + rename): `questionnaire.questions[]` and `questionnaire.delta { newQuestions, changedQuestions, unchangedQuestions, priorVendorSlug? }`. Append a one-paragraph delta summary to `classificationNotes`.
5. **Decide the route based on the delta.**
   - If `newQuestions.length === 0` (every question is answerable from prior responses, no material changes): call `draft-template-response` with the `vendor-security` template — the prior answers can be re-used. Then call `open-matter` so Operator tracks the vendor renewal.
   - If `newQuestions.length > 0` OR any `changedQuestions` touch sensitive areas (subprocessors, data residency, retention, breach notification, AI training, children's data): call `open-matter` (practiceArea `"privacy"` for privacy-heavy questionnaires, `"commercial"` otherwise), THEN call `route-to-counsel` — novel questions need counsel before any draft goes out.
6. **Set `attorneyReviewRequired = true`** on the queue row whenever any `newQuestions` or `changedQuestions` exist. Atomic write.

## Outputs
- Updates `intake/{id}/request.json` (populates `questionnaire.questions` + `questionnaire.delta`, appends delta summary to `classificationNotes`)
- Updates `queue.json` (may set `attorneyReviewRequired = true`; routing updates happen in downstream skills)
- Triggers `draft-template-response` (routine case) OR `open-matter` + `route-to-counsel` (novel case)
