---
name: parse-invoice
description: Use when an outside-counsel invoice arrives via any Composio-connected inbox (e-billing system, email attachment, CLM) — fetch the file, parse LEDES line items when present, compute total spend and budget variance, flag block-billing / vague-narratives / partner-bloat / over-budget / duplicate-task, write `invoices.json` + `invoices/{id}/invoice.json`, and roll the spend into the matter.
---

# Parse Invoice

## When to use

A new outside-counsel invoice has arrived. Source is any Composio-connected surface: a dedicated e-billing system (SimpleLegal / Brightflag / LegalTracker), a direct email inbox, a CLM that ingests invoices, a Drive / Box drop folder. You will not know which transport until the user tells you or the cron job fires — discover the slug with `composio search <keyword>`.

Every invoice produces two records (index + detail) and updates the matter's running spend. The skill is idempotent per `externalInvoiceId`.

## Steps

1. **Locate the invoice file.** Fetch via Composio. Accept PDF, LEDES 1998B text, CSV export, or structured JSON. Preserve the raw file reference.
2. **Identify firm and matter.**
   - Firm: match against `outside-counsel.json` by firm name or billing contact email. If no match, stop and ask the user to add the firm (never auto-create an approved firm).
   - Matter: match against `matters.json` by matter name / matter number. If ambiguous, ask once. If none, stop and ask the user to open the matter first (call `open-matter` if they approve).
3. **Detect LEDES compliance.** The canonical LEDES 1998B fields on each line item:
   - `LINE_ITEM_DATE`
   - `TASK_CODE` (e.g. `L110`, `L120`)
   - `ACTIVITY_CODE` (e.g. `A104`)
   - `TIMEKEEPER_CLASSIFICATION` (partner / counsel / associate / paralegal / other)
   - `TIMEKEEPER_NAME`
   - `HOURS`
   - `RATE`
   - `LINE_ITEM_TOTAL`
   - `NARRATIVE`

   If all present across lines, set `ledesCompliant = true`. If not, extract best-effort and set `ledesCompliant = false`.
4. **Parse line items** into `InvoiceLineItem[]`. Normalize money to USD cents (integer), hours to two decimal precision, narrative trimmed.
5. **Compute per-line flags:**
   - `block-billing` — narrative covers more than 3 distinct task verbs in a single line (heuristic: count of verbs across known legal-activity vocabulary).
   - `vague-narrative` — narrative is fewer than 10 words, OR matches known-bad patterns: `"work on matter"`, `"general matter"`, `"misc"`, `"various tasks"`, `"attend to matter"`.
   - `duplicate-task` — same timekeeper + same task code + same day + same hours + near-identical narrative as another line item.
6. **Compute invoice-level flags:**
   - `partner-bloat` — partner-class timekeeper hours > 40% of total invoice hours.
   - `over-budget` — `matter.spendToDateCents + sum(lineTotalCents) > matter.budgetCents` (only if `budgetCents` is set).
   - Aggregate any per-line flags onto the invoice-level `flags[]` as well (deduplicated).
   - If none apply, set `flags = ["none"]`.
7. **Compute `varianceCents`** (optional, informational): actual amount vs. matter budget pro-rated for the billing month. `(amountCents) - (budgetCents / 12)` if `budgetCents` is set; otherwise leave unset.
8. **Write `invoices/{id}/invoice.json` atomically** with the full parsed detail.
9. **Upsert `invoices.json`** (index). Status starts at `received`. `ledesCompliant`, `amountCents`, `varianceCents`, `flags`, `periodMonth` (`YYYY-MM` from the invoice date), `firmId`, `matterId` all populated.
10. **Update the matter atomically.**
    - Read `matters.json`, find the row, add `amountCents` to `spendToDateCents`, bump `updatedAt`, write back.
    - Read `matters/{id}/matter.json`, push the invoice id into `invoiceIds`, append a timeline event `invoice-received` (plus `invoice-flagged` if any flag other than `none`), write back.
11. **Notify the user** in chat with a one-line summary: firm, matter, amount, flags (if any), and the new matter spend-to-date. Do not auto-approve, auto-pay, or auto-send anything.

## Outputs

- `invoices/{id}/invoice.json` (full parsed detail).
- `invoices.json` (index upsert).
- `matters.json` (spend update only).
- `matters/{id}/matter.json` (timeline append + `invoiceIds` update).

## Never

- Never mark an invoice `approved` or `paid` yourself. Only `received` or `disputed` (the latter only after explicit user instruction).
- Never send a payment. Never hit a payments API even if Composio exposes one.
- Never overwrite the firm's negotiated rate on the fly; if a line item rate exceeds `negotiatedRateCentsPerHour`, flag it and tell the user, don't rewrite the firm record.
