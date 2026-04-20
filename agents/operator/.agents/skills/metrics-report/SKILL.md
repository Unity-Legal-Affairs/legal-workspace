---
name: metrics-report
description: Use when the user asks "how's legal doing this month" or on a monthly cadence — compute cycle-time (intake-open to matter-close), volume by requester team (cross-read from `../intake/queue.json`), spend by firm and practice area, matters opened vs closed, top expiring renewals, and write a monthly metrics report under a dedicated metrics matter.
---

# Metrics Report

## When to use

- Monthly cadence (e.g. first business day of the month, covering the prior month).
- User asks: "how's legal doing?", "monthly legal metrics", "what did we spend last month", "how many matters did we open in Q3."
- Ahead of a board meeting (often `board-package` calls this first).

## Steps

1. **Scope the period.** Default: the prior full calendar month (`YYYY-MM`). If the user asks for a quarter, use `YYYY-QX`. Keep the period label consistent across the report.
2. **Find or create the metrics matter.** Look for a matter with `title = "Legal metrics — {period}"` and `practiceArea = "compliance"`. If none, call `open-matter`:
   - `practiceArea: "compliance"`
   - `ownerType: "in-house"`
   - `tags: ["metrics", "{period}"]`
   (This matter has no budget; it is a container for the report.)
3. **Compute volume by requester team.**
   - Cross-read `../intake/queue.json`.
   - Filter intake rows where `createdAt` falls in the period.
   - Group by `requesterTeam` (or equivalent field; check Intake's schema — if the field is named differently, adapt).
   - Output a table: team, count, median acknowledgement time.
4. **Compute cycle-time.**
   - For each matter in `matters.json` closed in the period (i.e. `closedAt` in range), pair with its originating intake (via `intakeId` — look up `createdAt` in `../intake/queue.json`).
   - Cycle time = `matter.closedAt - intake.createdAt` in calendar days.
   - Report median, p90, and count.
5. **Compute spend breakdowns.** Read `invoices.json`.
   - By firm (group by `firmId`, sum `amountCents`): top 5, plus totals.
   - By practice area (lookup `matterId → matters.json[...].practiceArea`, group, sum): top 5, plus totals.
   - Total outside-counsel spend in the period. Compare to prior period if available.
6. **Matters opened vs closed.**
   - Count matters with `openedAt` in the period.
   - Count matters with `closedAt` in the period.
   - Net change.
7. **Top expiring renewals.** Read `renewals.json`. Top 5 rows with `alertState` in `t-90 | t-60 | t-30 | t-7 | overdue`, sorted by `opoutDueAt` ascending.
8. **Write `matters/{metrics-matter-id}/metrics-report.md` atomically** with this structure:

   ```
   # Legal Metrics — {period}

   _Generated {now}. Matter: {matter.id}._

   ## Volume

   | Team       | Requests | Median ack |
   |------------|----------|------------|
   | ...

   ## Cycle time

   - Median: {days}d
   - P90:    {days}d
   - Sample: {N} closed matters

   ## Spend

   **Total outside-counsel spend: {total} (vs. prior period {delta})**

   ### By firm (top 5)
   | Firm       | Spend    | Matters |
   |------------|----------|---------|
   | ...

   ### By practice area
   | Area       | Spend    |
   |------------|----------|
   | ...

   ## Matters

   - Opened: {n}
   - Closed: {n}
   - Net:    {signed n}

   ## Top Expiring Renewals

   - {counterparty} — t-{windowDays} — opt-out {opoutDueAt}
   - ...

   ## Notes & Gaps

   - {anything missing — e.g., "Intake metrics incomplete: `requesterTeam` not set on X rows"}
   ```

9. **Link the report into the metrics matter.** In `matters/{metrics-matter-id}/matter.json`, append a `doc-added` timeline event and add to `docs` with `kind: "memo"`.
10. **Summarize to the user** in chat: the headline numbers (spend total, matters net, cycle-time median), and the path to the full report.

## Outputs

- `matters/{metrics-matter-id}/metrics-report.md` (the report).
- `matters/{metrics-matter-id}/matter.json` (timeline + docs update).
- `matters.json` (upsert via `open-matter` if we created the container matter).

## Cross-agent reads

- `../intake/queue.json` — volume by requester team, cycle-time origin.
- `../counsel/reviews.json` — optional: average review turnaround, if the user asks.

## Never

- Never publish the report externally (e.g. to an investor) without explicit user approval.
- Never fabricate numbers. If a data source is incomplete, list it under "Notes & Gaps" and report the partial number honestly.
