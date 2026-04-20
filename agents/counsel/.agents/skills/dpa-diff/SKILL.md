---
name: dpa-diff
description: Use when a new DPA or subprocessor update arrives for a counterparty that already has an executed DPA — diffs the new DPA against the prior executed DPA from `clauses/{prior-contract-id}/clauses.json`; surfaces SCC-module changes, sub-processor additions, security-measure deltas, and data-transfer changes.
---

# DPA Diff

## When to use

A counterparty has sent an updated DPA, or a new DPA needs to be executed against a counterparty we already have data-processing history with. We want to know what changed relative to the version we previously signed (or processed), not to re-review from scratch.

## Steps

1. **Identify the counterparty and the matter.** Get `matterId`, `counterparty`.
2. **Find the prior DPA.** Filter `clauses.json` by `clauseType: "data-processing"` (and `"subprocessor"`, `"scc-transfer"` where relevant) AND `counterparty` (case-insensitive). Pick the most recent by `updatedAt`. Capture its `contractId`.
3. **Load the prior DPA detail** from `clauses/{prior-contract-id}/clauses.json`. Pull the full text of `data-processing`, `subprocessor`, `scc-transfer` clauses.
4. **Fetch the new DPA** via Composio from the document store (discover with `composio search <store> download` — don't hardcode slugs).
5. **Compute a structured diff across four axes:**
   - **SCC modules** — which modules (1, 2, 3, 4) are invoked, which annexes were changed.
   - **Sub-processor list** — additions, removals, jurisdiction changes, data-category changes per subprocessor.
   - **Security measures** — TOM (Technical and Organizational Measures) changes. New controls, removed controls, changes to encryption / access / audit / breach notification.
   - **Data-transfer changes** — changes in data categories processed, transfer mechanisms (SCC vs adequacy decision vs BCR), data-subject rights workflow.
6. **Append to the review file.** Open `reviews/{matter-id}/review.md` (create if missing). Append a `## DPA Diff` section with the four axes as sub-sections. For each change, mark severity (`minor` / `major`) based on the playbook's data-processing rules.
7. **Update `clauses/{matter-id}/clauses.json`** (the new contract's per-contract clause file) with the new DPA text — so future diffs use the latest as the baseline. If the new DPA is not yet executed, DO NOT upsert it into the root `clauses.json` (that index is for executed precedent only); wait until execution.
8. **Flag attorney review if any of:** SCC module added or removed; new subprocessor in a new jurisdiction; removed a security control that was in the prior DPA; added international transfer out of EEA/UK. Set `attorneyReviewRequired: true` on the review index row and on `../operator/matters.json`.
9. **Report to chat** — one-line summary per axis and the attorney-review reason if flagged.

## Outputs

- Appends `## DPA Diff` to `reviews/{matter-id}/review.md`
- Updates `clauses/{matter-id}/clauses.json` (new DPA text, baseline for next diff)
- Conditionally updates `reviews.json` and `../operator/matters.json` on flag

## Never

- Diff against an unrelated counterparty's DPA.
- Promote a not-yet-executed DPA into the root `clauses.json` precedent index.
