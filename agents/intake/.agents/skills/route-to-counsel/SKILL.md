---
name: route-to-counsel
description: Use when a queue item needs substantive legal review (YELLOW/RED NDA, vendor MSA with non-standard clauses, DPA diff, compliance check, complex employment matter) — write a routing note to `../counsel/queue-in.json` containing the intake id, classified category, playbook hints extracted from routing-rules.json, and the counterparty context; mark the queue item routed.
---

# Route to Counsel

## When to use
The request requires substantive legal judgment that this agent must not attempt. Typical triggers:
- YELLOW or RED NDAs (from `nda-traffic-light`)
- Vendor MSAs with non-standard clauses
- DPA diffs / privacy review / cross-border transfer questions
- Compliance checks requiring legal interpretation
- Complex employment matters (termination, separation, harassment)
- Any queue item where a `draft-template-response` escalation rule fired
- Any queue item where category is `other` and the content reads substantive

Note: `route-to-counsel` and `open-matter` are not mutually exclusive. A complex vendor MSA typically gets BOTH — Operator tracks the matter, Counsel does the review. Call both when appropriate.

## Steps
1. **Load the queue row** and `intake/{id}/request.json`. Re-read if anything has changed since triage.
2. **Assemble playbook hints.** Open `routing-rules.json` and gather every rule matching the queue item's category and keywords. Collect each matched rule's `notes` field into a `playbookHints[]` array. Also pull any `playbookHints` already stored on `intake/{id}/request.json`.
3. **Assemble counterparty context.** If `../operator/vendors/{slug}/vendor.json` exists for the counterparty, lift key facts (risk tier, prior contracts, known issues) into a short summary string. Otherwise record "no prior history on file".
4. **Upsert `../counsel/queue-in.json`.** Read the current array (tolerate missing/empty). Append a new routing note: `{ id: <new UUID>, intakeId: queueId, category, counterparty, playbookHints: string[], counterpartyContext: string, priority, routedAt: now, createdAt, updatedAt }`. Atomic write (`.tmp` + rename).
5. **Update the intake queue row.** Set `status = "routed"`, `routedTo = "counsel"`, refresh `updatedAt`. Atomic write to `queue.json`.
6. **Stop.** Counsel's file watcher picks up `queue-in.json` and takes over. Do not write anywhere else in `../counsel/`.

## Outputs
- Upserts `../counsel/queue-in.json` (new routing note; cross-agent write)
- Updates `queue.json` (`status = "routed"`, `routedTo = "counsel"`, `updatedAt`)
