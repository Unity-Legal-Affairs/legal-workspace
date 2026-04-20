---
name: open-matter
description: Use when a queue item requires ongoing legal work (substantive review, multi-step negotiation, or litigation hold) — create a matter record in the Operator agent by upserting `../operator/matters.json` and writing `../operator/matters/{matterId}/matter.json`; link `matterId` back onto the intake queue row.
---

# Open Matter

## When to use
The request is not a one-shot draft-and-close — it needs ongoing tracking as a formal matter. Typical triggers:
- Substantive contract review (MSA, DPA, non-standard vendor paper, order-form negotiation)
- Multi-step negotiation (NDA redline loop, term sheet)
- Litigation hold (preservation, ongoing obligations)
- Subpoena / formal legal process
- Financing / fundraising document set
- Credible litigation threat or pre-litigation notice

Routine GREEN NDAs drafted off a template do NOT open a matter — they get a draft-response and close. This skill is for things that need a tracked, owned, deadline-bearing matter record in Operator.

## Steps
1. **Load the queue row** and `intake/{id}/request.json`. Confirm a matter is warranted (non-trivial, ongoing work). If not, stop and let `draft-template-response` or `route-to-counsel` handle it.
2. **Generate a new `matterId`** (UUID v4) and a human-readable `slug` = kebab-case of `{counterparty}-{category}` (e.g. `acme-corp-msa`). If no counterparty is set, use the queue id as a fallback.
3. **Infer `practiceArea`** from category:
   - `nda | msa | dpa | order-form | vendor-security` → `"commercial"`
   - `employment` → `"employment"`
   - `privacy | dsr` → `"privacy"`
   - `subpoena | litigation-hold` → `"litigation"`
   - `corp` → `"corporate"`
   - else → `"other"`
4. **Determine `ownerType`** (`"in-house"` or `"outside-counsel"`). Default to `"in-house"`. Escalate to `"outside-counsel"` for: active litigation, complex M&A/financing, regulated-industry privacy matters, or anything explicitly flagged by routing rules.
5. **Upsert `../operator/matters.json`.** Read the current array (tolerate missing/empty). Append a new matter row: `{ id: matterId, slug, title, practiceArea, ownerType, status: "open", openedAt: now, intakeId: queueId, createdAt, updatedAt }`. Atomic write (`.tmp` + rename) to `../operator/matters.json`.
6. **Write `../operator/matters/{matterId}/matter.json`** with full matter detail: id, slug, title, description, practiceArea, ownerType, status, openedAt, intakeId, counterparty, priority, deadlines extracted from the request, and a back-link `intakeRequestPath: "../../intake/intake/{queueId}/request.json"` so Operator can follow the trail. Atomic write.
7. **Update the intake queue row.** Set `status = "matter-opened"`, `matterId = <matterId>`, refresh `updatedAt`. Atomic write to `queue.json`.
8. **Stop.** Operator's file watcher picks up the new matter and takes over. Do not write anywhere else in `../operator/`.

## Outputs
- Upserts `../operator/matters.json` (new matter row; cross-agent write)
- Writes `../operator/matters/{matterId}/matter.json` (full detail; cross-agent write)
- Updates `queue.json` (`status = "matter-opened"`, `matterId`, `updatedAt`)
