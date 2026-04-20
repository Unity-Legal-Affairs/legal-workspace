# Counsel Agent — Data Schema

Every file documented here lives at the **agent root** (or under a subfolder at the agent root). Nothing lives under `.houston/<agent>/` — the file watcher skips those paths and the dashboard would not react.

All records share three common fields:

```ts
interface BaseRecord {
  id: string;          // UUID v4
  createdAt: string;   // ISO-8601 UTC
  updatedAt: string;   // ISO-8601 UTC
}
```

Writes to JSON files are atomic: write `<path>.tmp`, then rename.

---

## `playbook.json` (array)

The clause-rule policy library. User-curated, authoritative. We read; we never mutate directly. Non-standard accepted positions go through `playbook-drift.json` for the user to manually promote.

```ts
type ClauseType =
  | "limitation-of-liability"
  | "indemnification"
  | "data-processing"
  | "ip-ownership"
  | "ip-license"
  | "confidentiality"
  | "term-termination"
  | "auto-renewal"
  | "governing-law"
  | "warranty"
  | "insurance"
  | "non-compete"
  | "non-solicit"
  | "audit-rights"
  | "assignment"
  | "most-favored-nation"
  | "exclusivity"
  | "publicity"
  | "force-majeure"
  | "sla-credits"
  | "subprocessor"
  | "scc-transfer"
  | "custom";

interface ClauseRule extends BaseRecord {
  clauseType: ClauseType;
  standardPosition: string;       // our ideal position
  acceptableRange: string;        // what we'll live with
  escalationTrigger: string;      // what requires a human attorney
  fallbackPositions: string[];    // ordered concessions, most favorable first
  dealSizeTier?: "small" | "mid" | "large"; // optional tier-dependent positions
  notes?: string;
}
```

**Written by:** user (manually). **Read by:** `review-contract`, `risk-assess`, `dpa-diff`, `draft-redline-pushback`, `update-playbook`, and the dashboard.

---

## `clauses.json` (array)

Clause index across all executed contracts. Powers precedent search. Detailed clause text lives in `clauses/{contract-id}/clauses.json`.

```ts
interface ClauseIndex extends BaseRecord {
  contractId: string;             // foreign key into ../operator/contracts.json
  counterparty: string;
  clauseType: ClauseType;         // same enum as playbook
  text: string;                   // actual clause from the executed contract, trimmed
  deviation: "none" | "minor" | "major";
  deviationNotes?: string;
}
```

**Written by:** `extract-clauses`. **Read by:** `precedent-search`, `dpa-diff`, `review-contract` (as precedent signal).

---

## `clauses/{contract-id}/clauses.json`

Full extracted clause set for one contract, keyed by clauseType. One file per contract.

```ts
interface ContractClauseFile {
  contractId: string;
  counterparty: string;
  clauses: Record<ClauseType, ExtractedClause>;
}

interface ExtractedClause {
  text: string;                   // full clause text
  deviation: "none" | "minor" | "major";
  deviationNotes?: string;
  position?: string;              // standard / non-standard summary
}
```

**Written by:** `extract-clauses`, `dpa-diff` (updates DPA-module entries for re-diff).

---

## `reviews.json` (array)

Review index. One entry per matter under review. Detailed review content lives in `reviews/{matter-id}/review.md`.

```ts
interface ReviewIndex extends BaseRecord {
  matterId: string;               // foreign key into ../operator/matters.json
  contractType: string;           // e.g. "MSA", "SaaS order form", "NDA", "DPA", "SOW"
  counterparty: string;
  deviationCount: number;         // total flagged deviations (minor + major)
  riskScore: number;              // 0-100 derived (majors × 20 + minors × 5, capped 100)
  status: "in-review" | "redlined" | "sent" | "accepted" | "closed";
  attorneyReviewRequired: boolean;
}
```

**Written by:** `review-contract` (create/update), `draft-redline-pushback` (flips `status` to `redlined`), user-driven status transitions (`sent`, `accepted`, `closed`). **Read by:** the dashboard, `update-playbook`.

---

## `reviews/{matter-id}/review.md`

Plain markdown. Deviation report + redline proposal. Sections per clause: current text, standard position (from playbook), acceptable range, deviation severity, proposed redline, fallback tiers. A `## DPA Diff` section is appended by `dpa-diff` when applicable.

**Written by:** `review-contract` (creates), `dpa-diff` (appends `## DPA Diff` section).

---

## `reviews/{matter-id}/pushback.md`

Plain markdown. Counter-proposal message drafted for sending to the counterparty. Firm-voice, references specific clauses and our playbook position. The user reads, edits if wanted, then sends via Composio (Gmail / DocuSign / etc.).

**Written by:** `draft-redline-pushback`.

---

## `risk-assessments.json` (array)

Risk assessment index. One entry per matter assessed.

```ts
interface RiskAssessmentIndex extends BaseRecord {
  matterId: string;               // foreign key into ../operator/matters.json
  severity: "negligible" | "minor" | "moderate" | "major" | "critical";
  likelihood: "rare" | "unlikely" | "possible" | "likely" | "almost-certain";
  classification: "acceptable" | "monitor" | "escalate" | "block";
  escalationRecommendation?: string;
}
```

**Written by:** `risk-assess`. **Read by:** the dashboard.

---

## `risk-assessments/{matter-id}/assessment.json`

Full matrix-cell positioning for one matter.

```ts
interface RiskAssessmentDetail extends BaseRecord {
  matterId: string;
  severity: RiskAssessmentIndex["severity"];
  likelihood: RiskAssessmentIndex["likelihood"];
  classification: RiskAssessmentIndex["classification"];
  financialExposureBand: string;  // e.g. "$100k–$1M"
  drivers: string[];              // specific risk drivers from the matter
  mitigations: string[];          // proposed controls that could lower severity or likelihood
  rationale: string;              // why we placed it on this cell
  escalationRecommendation?: string;
}
```

**Written by:** `risk-assess`.

---

## `playbook-drift.json` (array)

Proposed updates to `playbook.json`. The user reviews and manually promotes approved drift entries into the playbook — we never mutate `playbook.json` ourselves.

```ts
interface PlaybookDrift extends BaseRecord {
  clauseType: ClauseType;
  matterId: string;                  // the matter where the non-standard position was accepted
  acceptedPosition: string;          // the non-standard position that got accepted
  proposedPlaybookUpdate: string;    // suggested playbook text change (acceptableRange expansion, new fallback, etc.)
  status: "proposed" | "accepted-into-playbook" | "rejected";
}
```

**Written by:** `update-playbook`. Status transitions (`accepted-into-playbook`, `rejected`) are user-driven.

---

## `compliance-checks.json` (array)

Compliance review decisions for feature launches / product initiatives.

```ts
interface ComplianceCheck extends BaseRecord {
  initiative: string;                      // feature / product described
  regsTouched: string[];                   // e.g. ["GDPR","CCPA","HIPAA","SOC2","COPPA","PCI-DSS"]
  approvalsRequired: string[];             // e.g. ["privacy review","security review","CISO sign-off","board approval"]
  riskAreas: string[];                     // specific risk areas flagged
  recommendation: "approve" | "approve-with-conditions" | "escalate";
  conditions?: string[];                   // required conditions if recommendation is approve-with-conditions
  attorneyReviewRequired: boolean;
}
```

**Written by:** `compliance-check`.

---

## `queue-in.json` (array) — READ-ONLY from our perspective

Routing requests from the Intake agent. Intake writes; we read and then act (running `review-contract` / `risk-assess` / etc. as appropriate).

```ts
interface RouteRequest extends BaseRecord {
  intakeId: string;               // foreign key into ../intake/queue.json
  category: string;               // e.g. "vendor-contract", "customer-msa", "dpa", "feature-review"
  counterparty: string;
  playbookHints: string[];        // specific clause types Intake suspects will deviate
  priority: "P1" | "P2" | "P3" | "P4";
}
```

**Written by:** Intake agent. **Read by:** our skills (which then pull the full intake record from `../intake/intake/{intakeId}/request.json`).

---

## Cross-agent file references

Read-only from Counsel (we never write to these):
- `../intake/queue.json` — the Intake triage queue
- `../intake/intake/{id}/request.json` — full intake record for one matter
- `../operator/contracts.json` — the authoritative contract index (we read to get contract context; `extract-clauses` updates Operator-documented renewal-relevant key terms via Operator's contract row schema)

Read + conditional write from Counsel:
- `../operator/matters.json` — we write back ONLY two fields (`riskScore`, `attorneyReviewRequired`) and `updatedAt`, and only when `risk-assess` lands at `escalate`/`block` OR `review-contract` flips `attorneyReviewRequired` to true. All other fields on the matter row are Operator's to own.
