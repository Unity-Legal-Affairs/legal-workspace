---
name: update-playbook
description: Use when the user accepted a non-standard clause position in a closed matter — proposes an update to `playbook.json` by writing a `playbook-drift.json` entry with the accepted position and a suggested `acceptableRange` expansion; never mutates `playbook.json` directly.
---

# Update Playbook

## When to use

A matter closed with a non-standard position accepted. The playbook currently says we shouldn't have accepted it, but we did — because deal reality, because negotiation, because the clause was less bad than it looked. We want to propose that the playbook learn from this outcome, but we never touch `playbook.json` directly — the user reviews the proposed drift and manually edits the playbook.

## Steps

1. **Identify the matter and clause.** The user names a matter where the accepted position diverged from playbook, OR we detect it automatically by reading `reviews.json` for rows with `status: "accepted"` or `"closed"` AND non-zero `deviationCount`.
2. **Load the review.** Read `reviews/{matter-id}/review.md` and locate the specific clause where the non-standard position was accepted. Capture the accepted text verbatim.
3. **Compare against `playbook.json`.** Pull the current `ClauseRule` for that `clauseType`. Identify exactly how the accepted position falls outside `acceptableRange` or triggers `escalationTrigger`.
4. **Draft the `proposedPlaybookUpdate`.** A concrete edit proposal:
   - "Expand `acceptableRange` to cover <specific variant>, because <matter-specific context>."
   - Or "Add a new fallback position: <text> — used in matter {matter-id}."
   - Or "Tighten `escalationTrigger` — the current trigger fired on a case we ultimately accepted; consider excluding <narrow condition>."
5. **Write a `playbook-drift.json` row.** `clauseType`, `matterId`, `acceptedPosition` (the verbatim text), `proposedPlaybookUpdate`, `status: "proposed"`. Atomic write.
6. **Report to chat.** Tell the user: "Proposed drift written. Review `playbook-drift.json`; if you agree, edit `playbook.json` directly and mark the drift entry `status: \"accepted-into-playbook\"`."

## Outputs

- Writes a row in `playbook-drift.json`

## Never

- Mutate `playbook.json` directly. That's user-only — the playbook is the source of truth and only the user promotes drift into it.
- Auto-promote drift without user review.
- Back-propose drift for a matter still in review. Only closed / accepted matters.
