---
name: deadline-watch
description: Use when a corporate or compliance deadline approaches — DE franchise tax, 409A refresh, policy attestation, SCC update, cap-table certification, board-consent window — refresh `deadlines.json` with alertState t-30 / t-7 / t-1 / overdue for each, auto-create well-known annual deadlines (e.g. DE franchise tax March 1) on year-start, and surface them to the Matters dashboard.
---

# Deadline Watch

## When to use

- Scheduled cadence (daily recommended; at minimum weekly).
- Year-start (January 1 or first business day of the year) to seed well-known annual deadlines.
- On direct user ask: "what compliance deadlines are coming up?", "refresh the deadline calendar."
- Whenever a new known-deadline-bearing event lands (a 409A just expired; a new SCC guidance is published; a policy was last attested > 11 months ago).

## Steps

1. **Read `deadlines.json`** atomically. Default to `[]` if missing.
2. **Seed well-known annual deadlines if absent for the current year.** Upsert these when missing:
   - **DE franchise tax** — due March 1, annually. `type: "franchise-tax"`, description: `"Delaware franchise tax & annual report"`.
   - **409A refresh** — due 12 months after the last completed 409A (read from matter tags `["409a"]` or ask the user if unknown). `type: "409a-refresh"`.
   - **Annual policy attestations** — one per policy tracked (security, privacy, AUP). Usually anniversary of last attestation. `type: "policy-attestation"`.
   - **SCC updates** — if we have EU data transfers, check annually that SCC templates are current. `type: "sccs-update"`.
   - **Cap-table certifications** — fiscal year-end and at each financing close. `type: "cap-table-certification"`.
   - **Board-consent windows** — each scheduled board meeting has a consent-due window (usually 7 days prior). `type: "board-consent-due"`.
   Skip seeding any category the user hasn't turned on.
3. **For every row (pending or newly seeded), compute `alertState`** from days-until-dueAt:
   - Overdue (≤ 0 days): `alertState = "overdue"`.
   - ≤ 1 day: `alertState = "t-1"`.
   - ≤ 7 days: `alertState = "t-7"`.
   - ≤ 30 days: `alertState = "t-30"`.
   - > 30 days: `alertState = "none"`.
4. **Atomically upsert `deadlines.json`** — one row per `(type, dueAt)` pair (or per `contractId` for `type: "renewal"`, which is managed by the `renewal-alert` skill; this skill does not own those, but tolerates them).
5. **For each transition** (e.g. a deadline that moved into `t-7` since last run), emit a chat notification with the headline: type, description, owner, due date, new alert state.
6. **Mark `done` deadlines done.** If the user (or another skill) has confirmed completion, carry `status: "done"` forward; do not revive it into a pending row.
7. **Annual rollover.** On first run of a new year, if a well-known recurring deadline has `status: "done"` for the prior year, create a fresh `pending` row for the new year.

## Outputs

- `deadlines.json` (upsert).

## Interaction with `renewal-alert`

- `renewal-alert` writes `deadlines.json` rows with `type: "renewal"` for t-30 / t-7 / overdue opt-out windows.
- `deadline-watch` must not rewrite those rows' `status` or `alertState` unless it is re-computing the alertState from `dueAt` (which is the same math as `renewal-alert` would do) — this is safe because the formula is idempotent.
- Neither skill deletes the other's rows.

## Never

- Never file a franchise tax return, 409A, or any other regulatory filing. You surface the deadline and who owns it; the humans do the filing.
- Never silently skip an overdue row. Overdue should be the loudest alert on the dashboard.
- Never invent a deadline category not on the approved list without user confirmation.
