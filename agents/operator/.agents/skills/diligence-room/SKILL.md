---
name: diligence-room
description: Use when a diligence request list arrives (financing round, M&A, insurance renewal, strategic partnership) — open a matter named "Diligence — [party]", parse the request list, map each item to `contracts.json` / `matters.json` / `vendors.json`, flag present/missing/partial, and produce a populated checklist at `matters/{id}/diligence-room.md`.
---

# Diligence Room

## When to use

- A diligence request list arrives from opposing counsel (Series B lead investor, acquirer, D&O insurance underwriter, strategic partner).
- The user pastes a numbered request list in chat, or drops a PDF / doc into a shared folder.
- The user asks: "prep a diligence room for Acme's acquisition request list."

## Steps

1. **Identify the party and purpose.** E.g. "Acme — acquisition", "Sequoia — Series B", "Chubb — D&O renewal." Combine into the matter title: `"Diligence — {party} ({purpose})"`.
2. **Open the matter** via `open-matter`:
   - `practiceArea: "financing"` for financings, `"corp"` for M&A, `"compliance"` for insurance / regulatory.
   - `ownerType: "mixed"` typically (in-house leads, outside counsel reviews).
   - `tags: ["diligence", "{party-slug}", "{purpose}"]`.
3. **Parse the request list.** Usually numbered, hierarchically organized (1, 1.1, 1.2, 2, ...). Capture each item verbatim with its numbering so the opposing side can trace each answer.
4. **For each item, search our data stores:**
   - `contracts.json` and `contracts/{id}/contract.json` — for requests about executed agreements, MSAs, NDAs, IP assignments, employment agreements.
   - `matters.json` and `matters/{id}/matter.json` — for active or recent matters (litigation, disputes, open investigations).
   - `vendors.json` and `vendors/{slug}/vendor.json` — for supplier / subprocessor / data-handling questions.
   - `outside-counsel.json` — for firm-engagement questions.
5. **For each item, mark a status:**
   - `present` — we have the doc / record, and it is complete. Include the `contractId` / `matterId` / `vendors/{slug}` ref.
   - `missing` — we have no evidence of it. It may not exist (e.g. "pending litigation" — we genuinely have none).
   - `partial` — we have some of what was asked; note what is missing.
6. **Write `matters/{id}/diligence-room.md` atomically** with this structure:

   ```
   # Diligence Room — {party} ({purpose})

   _Matter: {matter.id}. Request list received: {date}._

   ## 1. {top-level heading from request list}

   ### 1.1 {sub-item from request list}
   **Status:** present | missing | partial
   **Refs:** {contractId} | {matterId} | vendors/{slug}
   **Notes:** {what we have, what is missing, who to ask}

   ...

   ## Gaps Summary

   - [missing] 1.4 — no assignment-of-inventions agreement found for {person}
   - [partial] 3.2 — have 8 of 12 customer MSAs; missing {list}
   - ...
   ```

7. **For each `missing` or `partial` item,** append a `note` timeline event to `matters/{id}/matter.json` tagged `diligence-gap` so the follow-up shows in the matter's timeline and the Activity board.
8. **Link the checklist into the matter** (append `doc-added` timeline event pointing at `matters/{id}/diligence-room.md`; add to `docs` with `kind: "memo"`).
9. **Summarize to the user** in chat: N items total, M present, K missing, L partial. List the top 5 missing items by importance.

## Outputs

- `matters/{id}/diligence-room.md` (the populated checklist).
- `matters/{id}/matter.json` (timeline + docs update, one note per gap).
- `matters.json` (upsert via `open-matter`).

## Never

- Never forward the checklist to the requesting party. That is the lawyer's job after review.
- Never fabricate a document or reference. "Missing" is the correct answer when we have none.
