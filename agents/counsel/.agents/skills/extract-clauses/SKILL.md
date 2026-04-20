---
name: extract-clauses
description: Use when a contract is executed or under review — extracts key terms (term, auto-renewal, notice period, liability cap, indemnity scope, governing law, IP ownership, data processing, exclusivity, MFN) into structured records for the clause library and precedent search.
---

# Extract Clauses

## When to use

A contract has been executed, OR a draft is in review and the user wants structured clause extraction for the precedent library. Extraction builds `clauses.json` (the precedent index) and per-contract files, and feeds renewal-relevant terms back into Operator's contract index.

## Steps

1. **Resolve the contract.** Get `contractId` from `../operator/contracts.json` and `counterparty` from the same row. If the contract isn't in Operator's index yet, stop and ask — Operator owns contract creation.
2. **Fetch the document text.** Discover the right store tool with `composio search <store> download` and pull the contract text. Do NOT hardcode tool slugs.
3. **Segment and extract.** For each `clauseType` in our enum that applies to this contract (not all contracts have every clause), pull the clause text (trimmed, full sentences) and note whether the position is standard vs non-standard relative to `playbook.json`. Compute `deviation: "none" | "minor" | "major"` the same way as `review-contract`.
4. **Write `clauses/{contract-id}/clauses.json`** with the full `Record<ClauseType, ExtractedClause>` set. Atomic write.
5. **Upsert entries into `clauses.json`** — one row per (contractId, clauseType) pair. Existing rows for the same (contractId, clauseType) get replaced. Atomic write.
6. **Back-propagate renewal-relevant terms into Operator.** Update `../operator/contracts.json` row for this `contractId`, setting only the Operator-documented key-term fields: `term`, `autoRenew`, `noticePeriodDays`, `liabilityCap`, and `updatedAt`. Leave every other field on Operator's contract row alone. Atomic write. (This is the single documented cross-agent write that touches Operator's contract index.)
7. **Report to chat.** Counts per `clauseType`, deviation counts, and any "unplayed" clauses found.

## Outputs

- Writes `clauses/{contract-id}/clauses.json`
- Upserts rows in `clauses.json`
- Updates renewal-relevant fields in `../operator/contracts.json`

## Never

- Extract clauses for a contract that doesn't exist in Operator's index — ask the user to create the contract first.
- Overwrite Operator-owned contract fields outside the documented key-term set.
- Hardcode a document-store tool slug.
