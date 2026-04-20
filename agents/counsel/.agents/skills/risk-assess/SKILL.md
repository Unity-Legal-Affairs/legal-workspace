---
name: risk-assess
description: Use when a matter needs risk classification — applies the 5×5 severity × likelihood matrix (Negligible→Critical / Rare→Almost Certain), assigns classification (acceptable / monitor / escalate / block), and flags escalation requirements on the matter.
---

# Risk Assess

## When to use

A matter has a contract, a counterparty, and enough context for us to reason about financial exposure and likelihood. Usually run after `review-contract` has surfaced the deviations (the risk picture is sharper after review), but can also be run standalone when the user wants an early read on a new opportunity.

## Steps

1. **Resolve the matter.** Read the matter row from `../operator/matters.json` by `matterId`. Pull counterparty, contract type, deal size / ARR, data-sensitivity tags if any.
2. **Pick the severity band.** Using the financial-exposure defaults from `CLAUDE.md`:
   - `negligible` (< $10k), `minor` ($10k–$100k), `moderate` ($100k–$1M), `major` ($1M–$10M), `critical` (> $10M).
   - Exposure includes deal value at risk + plausible downside (indemnity uncapped, liability uncapped, data-breach exposure). Don't conflate deal ARR with exposure — a $50k/yr SaaS deal with uncapped indemnity can have `major` severity.
3. **Pick the likelihood.** Based on: counterparty track record (if we have clauses.json history), deal novelty, how aggressively the counterparty's paper deviates from our playbook, whether the deviation is on a clause that historically triggers disputes (liability / indemnity / IP / DPA).
   - `rare`, `unlikely`, `possible`, `likely`, `almost-certain`.
4. **Place on the grid and classify.**
   - Bottom-left: `acceptable`.
   - Diagonal band: `monitor`.
   - Top-right quadrant: `escalate`.
   - Top-right corner (critical × likely, critical × almost-certain, major × almost-certain): `block`.
5. **Automatic escalation rule.** If the cell is `major × likely` or higher, force `classification: "escalate"` (or `"block"`) and flip `attorneyReviewRequired` to true on the matter.
6. **Write `risk-assessments/{matter-id}/assessment.json`** with full detail: severity, likelihood, classification, financialExposureBand (text), drivers (list of specific risks driving the placement), mitigations (controls that could move us down the grid), rationale, escalationRecommendation.
7. **Upsert `risk-assessments.json`** (the index) with severity, likelihood, classification, matterId, escalationRecommendation. Atomic write.
8. **If classification is `escalate` or `block`, update `../operator/matters.json`** — set `riskScore` (derive: `acceptable`=10, `monitor`=40, `escalate`=75, `block`=95), `attorneyReviewRequired: true`, `updatedAt`. Leave all other fields alone. Atomic write.
9. **Report to chat** — the cell, the classification, the top drivers, the top mitigations, and the escalation recommendation.

## Outputs

- Writes `risk-assessments/{matter-id}/assessment.json`
- Upserts `risk-assessments.json`
- Conditionally writes `../operator/matters.json` (riskScore + attorneyReviewRequired only)

## Never

- Place on a cell without explaining the drivers.
- Skip the update to `../operator/matters.json` when classification is `escalate` or `block`. That cross-write is the only way the matter index reflects our assessment.
