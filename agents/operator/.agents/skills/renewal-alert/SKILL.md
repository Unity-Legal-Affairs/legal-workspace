---
name: renewal-alert
description: Use when the renewal calendar needs refreshing — either on a scheduled cadence or after contract ingest — walk every contract with `autoRenew=true`, compute each opt-out deadline from effectiveDate + termMonths - noticePeriodDays, and upsert rows into `renewals.json` with alertState t-90 / t-60 / t-30 / t-7 / overdue based on days-until-opoutDueAt; also emit `deadlines.json` entries for the t-30 and t-7 windows so the dashboard's "Deadlines 30 days" stat reflects them.
---

# Renewal Alert

## When to use

The renewal calendar must stay live. Run this skill:
- On a scheduled cadence (e.g. daily or weekly), whichever the user configures.
- After any contract is ingested, executed, or amended (because the opt-out date may have changed).
- On direct user ask: "refresh the renewal calendar" or "show me renewals in the next 30 days."

## Steps

1. **Read `contracts.json`** atomically. Filter to `autoRenew === true` AND `status === "executed"` AND no `terminated` status.
2. **For each contract, compute `opoutDueAt`** if not already cached on the contract record:
   ```
   opoutDueAt = effectiveDate + termMonths months - noticePeriodDays days
   ```
   Skip any contract where `termMonths` or `noticePeriodDays` is missing; leave a note for the user to complete the record.
3. **Compute `renewalAt`** = `effectiveDate + termMonths months` (i.e. the date auto-renewal fires if we do nothing).
4. **For each contract, compute `alertState` and `windowDays`** from days-until-opoutDueAt (today → opoutDueAt):
   - Overdue (≤ 0 days): `alertState = "overdue"`, `windowDays = 7`.
   - ≤ 7 days: `alertState = "t-7"`, `windowDays = 7`.
   - ≤ 30 days: `alertState = "t-30"`, `windowDays = 30`.
   - ≤ 60 days: `alertState = "t-60"`, `windowDays = 60`.
   - ≤ 90 days: `alertState = "t-90"`, `windowDays = 90`.
   - > 90 days: no renewal alert — skip (don't write a `none` row just to have one).
5. **Upsert `renewals.json` atomically.** One row per `contractId`. Fields: `contractId`, `counterparty` (denormalized from the contract for fast dashboard reads), `opoutDueAt`, `renewalAt`, `windowDays`, `alertState`, `status` (start at `pending`; preserve `acknowledged` / `opted-out` / `renewed` / `terminated` if already present), `ownerEmail` (carry over from contract if set).
6. **Promote t-30 and t-7 windows into `deadlines.json`.** For any renewal now in `alertState === "t-30"` or `"t-7"` or `"overdue"`, upsert a matching row into `deadlines.json`:
   - `type: "renewal"`
   - `dueAt: opoutDueAt`
   - `description: "Opt-out for {counterparty} (auto-renew {renewalAt})"`
   - `status: "pending"` (or preserve existing)
   - `alertState` mirrors the renewal (`t-30` | `t-7` | `overdue`).
   - `contractId` set.
   Upsert by `contractId` (so subsequent runs update, not duplicate).
7. **Remove stale rows.** Any row in `renewals.json` whose contract is now `terminated` or past renewal with no action should transition — mark `status: "renewed"` (if auto-renewed) or `status: "terminated"` as appropriate; do not delete for audit trail.
8. **Summarize to the user.** Just the deltas: new t-7 alerts, anything that tipped overdue, anything that renewed. Quiet otherwise.

## Outputs

- `renewals.json` (upsert per contract).
- `deadlines.json` (upsert per contract in the t-30 / t-7 / overdue window).
- No matter writes from this skill (the user approves opt-out actions separately).

## Never

- Never send an opt-out notice. That requires explicit user approval through a separate flow.
- Never mutate the underlying contract record; this skill only reads from `contracts.json`.
- Never skip an overdue contract. Surface it louder, not quieter.
