---
name: review-contract
description: Use when a contract (MSA, SaaS order form, vendor paper, customer MSA, NDA, SOW, DPA) needs playbook comparison — runs each clause against `playbook.json`, flags deviations by severity, and writes a clause-by-clause review with fallback positions and a redline proposal to `reviews/{matter-id}/review.md`.
---

# Review Contract

## When to use

A contract has landed from Intake (via `queue-in.json`) or the user directly asked for a review. We need to diff the contract against our playbook, flag every deviation, and draft a redline proposal. This is the primary review skill and the starting point for most matters.

## Steps

1. **Resolve the matter.** If the request came from Intake, read `../intake/queue.json` to find the matter, then pull the full record from `../intake/intake/{intakeId}/request.json`. If the matter doesn't exist yet in `../operator/matters.json`, ensure Operator has a row before proceeding (the user can run the Operator `create-matter` skill or we ask). Capture `matterId`, `contractType`, `counterparty`.
2. **Fetch the contract.** The document lives in whatever document store the user has connected (Box / Drive / iManage / SharePoint / etc.). Discover the correct fetch tool with `composio search <store> download` and pull the contract text. Do NOT hardcode tool slugs.
3. **Load the playbook.** Read `playbook.json`. Build a lookup by `clauseType`.
4. **Parse the contract into clauses.** Segment by standard headings (Term, Termination, Liability, Indemnification, IP, Confidentiality, Data Processing, Governing Law, etc.) and match each section to a `clauseType`. For clauses not in the playbook, note "unplayed" — this triggers attorney escalation.
5. **Diff each clause against its ClauseRule.**
   - If the clause matches `standardPosition` → `deviation: "none"`.
   - If inside `acceptableRange` but off standard → `deviation: "minor"`.
   - Outside `acceptableRange` OR triggers `escalationTrigger` → `deviation: "major"`.
   - Capture `deviationNotes` explaining the gap.
6. **Compute `riskScore`.** `majors × 20 + minors × 5`, capped at 100.
7. **Decide `attorneyReviewRequired`.** True if ANY of:
   - Any clause is "unplayed" (not in playbook).
   - 3 or more `major` deviations.
   - Clause type is non-compete, unlimited-liability, IP assignment (ours going out), or most-favored-nation.
   - Any clause's `escalationTrigger` was hit.
8. **Write `reviews/{matter-id}/review.md`.** Sections per clause: current text (trimmed), our standard position, acceptable range, deviation severity, rationale, proposed redline text, ordered fallback tiers from the playbook. End with a "Summary" block: deviation count, risk score, attorney-review reason (if flagged).
9. **Upsert `reviews.json`** with `status: "in-review"`, the deviation count, risk score, and `attorneyReviewRequired`. Atomic write.
10. **If `attorneyReviewRequired` is true, update `../operator/matters.json`** — set `riskScore` and `attorneyReviewRequired: true` on the matter row (leave all other fields alone), refresh `updatedAt`. Atomic write.
11. **Report to chat.** Summary of deviation counts, risk score, top 3 flagged clauses, and "attorney review required" reason if flagged.

## Outputs

- Writes `reviews.json` (index upsert)
- Writes `reviews/{matter-id}/review.md`
- Conditionally writes `../operator/matters.json` (risk + attorneyReviewRequired only)

## Never

- Send the redline to the counterparty. That's `draft-redline-pushback` and only the user sends.
- Invent a playbook position for an "unplayed" clause. Escalate to the user.
- Mark a non-routine matter as not requiring attorney review.
