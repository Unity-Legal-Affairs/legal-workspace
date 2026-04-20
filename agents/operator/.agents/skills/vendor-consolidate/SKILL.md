---
name: vendor-consolidate
description: Use when the user asks "what do we have with [vendor]?" or a new vendor is onboarded — consolidate every agreement with that counterparty across `contracts.json` (MSA, DPA, SOWs, order forms, NDAs) into a single `vendors.json` row plus a `vendors/{slug}/vendor.json` with all references, DPA/SCC status, subprocessor list, security-questionnaire highlights, and surviving obligations extracted from the key clauses.
---

# Vendor Consolidate

## When to use

- User asks for a vendor snapshot: "what do we have with Snowflake?"
- A new vendor is onboarded (NDA just signed, MSA about to be signed).
- Periodic refresh: the subprocessor list on a DPA is updated, or a new SOW is executed.
- Before a diligence request list is answered (the `diligence-room` skill may call this first).

## Steps

1. **Identify the counterparty.** Normalize to a canonical name. Derive `slug` from the canonical name (kebab-case). If an existing vendor row exists by slug or close-name match, reuse it — do not create a duplicate.
2. **Read `contracts.json`** and filter to contracts with that counterparty (case-insensitive, allow fuzzy match like "Snowflake Inc." ↔ "Snowflake"). Ask the user to confirm any ambiguous matches.
3. **Bucket by type.** Group the contracts:
   - `msa` — should be exactly one active one; if multiple, flag and ask.
   - `dpa` — data processing addendum; one active.
   - `sow` — usually many; the `latestSowContractId` is the one with the most recent `effectiveDate`.
   - `order-form`, `nda`, `license`, `partnership`, `other` — carry through.
4. **Inspect the DPA.** Load `contracts/{dpaContractId}/contract.json`. Extract:
   - Whether Standard Contractual Clauses are incorporated and which module (`module-1` controller-to-controller ... `module-4` processor-to-processor). Default `none` if no SCCs.
   - The subprocessor list (usually an annex). Each subprocessor: `name`, `purpose`, `region` if disclosed.
   - `subprocessorListLastSeenAt` = the DPA's most recent update timestamp.
5. **Compute `subprocessorStatus`** for the index row:
   - `current` — DPA is present AND subprocessor list updated in the last 12 months.
   - `stale` — DPA is present but subprocessor list > 12 months old.
   - `unknown` — no DPA, or DPA exists but no subprocessor annex was found.
6. **Extract surviving obligations** from the MSA's key clauses (read `contracts/{msaContractId}/contract.json` key terms). Common survivors:
   - Confidentiality / non-disclosure — usually survives N years post-termination.
   - Non-solicit — if present.
   - Indemnity — often survives.
   - License grants — feedback license, any perpetual license granted.
   For each, capture `kind`, `description`, `survivesUntil` (ISO-8601 or the string `"perpetual"`), and `sourceContractId`.
7. **Build `sowHistory`** — sorted descending by `effectiveDate`. Each entry: `contractId`, `effectiveDate`, `valueCents`, `scopeSummary` (short one-liner, pulled from the SOW's scope section).
8. **Count open matters touching this vendor.** Read `matters.json`; for each matter, if any of its `contractIds` in `matters/{id}/matter.json` references a contract with this counterparty, it's an open matter for this vendor. Set `openMatterCount`.
9. **Sum YTD spend** (optional). If any invoices reference matters that in turn reference this vendor's contracts, aggregate from `invoices.json` for the current year.
10. **Write `vendors/{slug}/vendor.json` atomically** with the full consolidated view.
11. **Upsert `vendors.json`** (index) atomically. Fields: `slug`, `name`, `msaContractId`, `dpaContractId`, `latestSowContractId`, `subprocessorStatus`, `openMatterCount`, `ytdSpendCents`.
12. **Report** to the user: a concise summary with any gaps flagged (no DPA, stale subprocessor list, missing MSA) — these are action items, not silent state.

## Outputs

- `vendors/{slug}/vendor.json` (full consolidated view).
- `vendors.json` (index upsert).

## Never

- Never invent clauses. If the MSA doesn't mention a non-solicit, don't create one.
- Never modify `contracts.json` or `contracts/{id}/contract.json`. This skill is read-only for contracts.
