---
name: open-matter
description: Use when a new matter needs tracking — either from the Intake agent's cross-agent write into `matters.json` or from a direct user ask like "open a matter for the Acme MSA review" — create or upsert a MatterIndex row with owner, practice area, optional budget, and an initialized `matters/{id}/matter.json` with a fresh timeline; tolerate existing entries so Intake-originated rows are merged, not clobbered.
---

# Open Matter

## When to use

A new matter needs to start being tracked by the Operator. Two common entry paths:

1. **Cross-write from Intake.** The Intake agent has written a new row into `../operator/matters.json` (fields: `id`, `createdAt`, `updatedAt`, `slug`, `title`, `practiceArea`, `ownerType`, `status: "open"`, `openedAt`, `intakeId`, `attorneyReviewRequired`, `tags`, `spendToDateCents: 0`). We just need to finish initialization: merge safely, and make sure `matters/{id}/matter.json` exists with a proper opened timeline.
2. **Direct user ask.** E.g. "open a matter for the Acme MSA review" or "track this employment matter, budget $15k, commercial practice area." No Intake row exists yet; we create the whole thing.

Always idempotent. Running this skill twice on the same matter must not produce duplicates, drift the timeline, or overwrite spend.

## Steps

1. **Resolve the matter id.**
   - If a specific id was provided (Intake cross-write or explicit user reference), use it.
   - Otherwise generate a UUID v4.
   - Derive `slug` as a kebab-cased short form of the title if not already set.
2. **Infer or accept the practice area.** Must be one of: `commercial | employment | privacy | corp | ip | litigation | financing | compliance | other`. If the user did not specify and context makes it unclear, ask once; do not guess wildly.
3. **Load the current `matters.json` index.** Atomically (read file, parse, defaulting to `[]` on missing).
4. **Upsert the row.**
   - If a row with the same `id` exists: merge non-destructively. Do not clobber fields owned by other writers — specifically `spendToDateCents` (owned by `parse-invoice`), `riskScore` and `reviewId` (owned by Counsel cross-write), `status` transitions already past `open`, and `closedAt`.
   - If a row does not exist: create it. Defaults: `status = "open"`, `spendToDateCents = 0`, `openedAt = now()`, `attorneyReviewRequired = false` unless otherwise stated, `tags = []`.
5. **Write `matters.json` atomically** (`matters.json.tmp` -> rename).
6. **Initialize `matters/{id}/matter.json` if missing.** Fields: `id`, `slug`, `title`, `summary`, `intakeRef` (set if `intakeId` is present — point at `../intake/queue/{intakeId}/request.json`), `counselReviewRef` (set if `reviewId` is present), empty `invoiceIds`, empty `contractIds`, empty `docs`, and a `timeline` seeded with a single `opened` event.
7. **If the file already exists,** append an `opened`/`note` timeline event only if this is a re-open (status was previously `closed`). Otherwise leave the timeline alone.
8. **Write `matters/{id}/matter.json` atomically.**
9. **Emit a chat message to the user:** confirm the matter id, practice area, and any budget, and prompt to assign outside counsel if ownerType is `outside-counsel` or `mixed` and `outsideCounselId` is unset.

## Outputs

- Upsert into `matters.json` (index).
- Create or leave-alone `matters/{id}/matter.json` (full detail).
- No writes to sibling agents.

## Tolerate and merge — the contract

Intake cross-writes land at any time. If you read `matters.json` in step 3, finish your upsert, and find that a concurrent Intake write has added or updated a row you did not touch, that is OK — you only rewrite your own row. Do not bulk-rewrite the array from stale in-memory state. Re-read and re-merge if your atomic rename detects a conflict.
