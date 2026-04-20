# Operator Agent — Data Schema

Every file documented here lives at the **agent root** (or under a subfolder at the agent root). Nothing lives under `.houston/<agent>/` — the file watcher skips those paths and the dashboard would not react.

All records share three common fields:

```ts
interface BaseRecord {
  id: string;          // UUID v4
  createdAt: string;   // ISO-8601 UTC
  updatedAt: string;   // ISO-8601 UTC
}
```

Writes to JSON files are atomic: write `<path>.tmp`, then rename. All money is stored as integer USD cents (`*Cents: number`), never floats.

---

## `matters.json` (index)

Flat array used by the dashboard for fast rendering. One entry per matter. Detailed matter content lives in `matters/{id}/matter.json`.

```ts
interface MatterIndex extends BaseRecord {
  slug: string;                       // kebab-case slug
  title: string;                      // short human title
  practiceArea:
    | "commercial"
    | "employment"
    | "privacy"
    | "corp"
    | "ip"
    | "litigation"
    | "financing"
    | "compliance"
    | "other";
  ownerType: "in-house" | "outside-counsel" | "mixed";
  outsideCounselId?: string;          // foreign key -> outside-counsel.json
  status:
    | "open"
    | "waiting"
    | "in-review"
    | "negotiating"
    | "closing"
    | "closed";
  openedAt: string;                   // ISO-8601 UTC
  closedAt?: string;                  // ISO-8601 UTC
  budgetCents?: number;               // matter budget, USD cents
  spendToDateCents: number;           // running total, USD cents
  intakeId?: string;                  // foreign key -> ../intake/queue.json
  reviewId?: string;                  // foreign key -> ../counsel/reviews.json
  attorneyReviewRequired: boolean;
  riskScore?: number;                 // 0-100, written by Counsel
  tags: string[];
}
```

**Written by:** `open-matter` (create/upsert), `parse-invoice` (updates `spendToDateCents`), Counsel agent (cross-write: `riskScore`, `reviewId`), Intake agent (cross-write: initial row with `intakeId`).

---

## `matters/{id}/matter.json`

Full matter detail, including timeline events and refs back to intake, counsel, invoices, and contracts.

```ts
interface MatterDetail extends BaseRecord {
  id: string;                         // mirrors MatterIndex.id
  slug: string;
  title: string;
  summary: string;                    // short plain-text summary
  intakeRef?: string;                 // "../intake/queue/{id}/request.json" style ref
  counselReviewRef?: string;          // "../counsel/reviews/{id}/review.md"
  invoiceIds: string[];               // refs into invoices.json
  contractIds: string[];              // refs into contracts.json
  docs: MatterDoc[];                  // external doc refs (via Composio: Drive/Box)
  timeline: MatterTimelineEvent[];
}

interface MatterDoc {
  id: string;
  kind: "brief" | "memo" | "exhibit" | "signed-agreement" | "draft" | "other";
  title: string;
  fileRef: string;                    // external id in Drive / Box / CLM
  addedAt: string;                    // ISO-8601 UTC
}

interface MatterTimelineEvent {
  id: string;
  at: string;                         // ISO-8601 UTC
  kind:
    | "opened"
    | "status-change"
    | "invoice-received"
    | "invoice-flagged"
    | "review-requested"
    | "review-completed"
    | "risk-scored"
    | "doc-added"
    | "closed"
    | "note";
  summary: string;
  refId?: string;                     // id into invoices / reviews / docs
}
```

**Written by:** `open-matter` (creates the file + opened event), `parse-invoice` (appends invoice-received / invoice-flagged events), `board-package` / `diligence-room` / `metrics-report` (attach their own markdown files alongside).

---

## `contracts.json` (index)

Flat array. One entry per contract. Detailed terms live in `contracts/{id}/contract.json`.

```ts
interface ContractIndex extends BaseRecord {
  counterparty: string;
  type:
    | "msa"
    | "dpa"
    | "sow"
    | "order-form"
    | "nda"
    | "employment"
    | "lease"
    | "partnership"
    | "license"
    | "other";
  effectiveDate: string;              // ISO-8601 UTC
  termMonths?: number;
  expiresAt?: string;                 // ISO-8601 UTC
  autoRenew: boolean;
  noticePeriodDays?: number;
  opoutDueAt?: string;                // ISO-8601 UTC, computed from effective + term - notice
  liabilityCapCents?: number;
  valueCents?: number;
  ownerEmail?: string;                // internal owner
  status: "draft" | "executed" | "expired" | "terminated";
  fileRef?: string;                   // external id in CLM / Drive / Box
  matterId?: string;                  // foreign key -> matters.json
}
```

**Written by:** `vendor-consolidate` (touches counterparty groupings), `renewal-alert` (reads, does not write), plus ingest flows driven through Composio.

---

## `contracts/{id}/contract.json`

Full contract record — every extracted term, linked docs, and per-contract timeline.

```ts
interface ContractDetail extends BaseRecord {
  id: string;
  counterparty: string;
  type: ContractIndex["type"];
  effectiveDate: string;
  termMonths?: number;
  expiresAt?: string;
  autoRenew: boolean;
  noticePeriodDays?: number;
  opoutDueAt?: string;
  keyTerms: ContractTerm[];
  parties: ContractParty[];
  linkedDocIds: string[];
  timeline: ContractTimelineEvent[];
}

interface ContractTerm {
  key: string;                        // e.g. "liability-cap", "indemnity", "ip-ownership"
  value: string;                      // extracted verbatim where possible
  sourceSnippet?: string;             // the source sentence / clause
}

interface ContractParty {
  name: string;
  role: "counterparty" | "us" | "guarantor" | "affiliate";
  signerName?: string;
  signerEmail?: string;
}

interface ContractTimelineEvent {
  id: string;
  at: string;
  kind: "drafted" | "negotiated" | "executed" | "amended" | "renewed" | "terminated" | "note";
  summary: string;
}
```

---

## `renewals.json`

Flat array. The renewal calendar with active alert states, recomputed by `renewal-alert`.

```ts
interface RenewalAlert extends BaseRecord {
  contractId: string;                 // foreign key -> contracts.json
  counterparty: string;               // denormalized for fast dashboard render
  opoutDueAt: string;                 // ISO-8601 UTC
  renewalAt: string;                  // ISO-8601 UTC (next auto-renewal date if not opted out)
  windowDays: 90 | 60 | 30 | 7;       // which notice window this alert represents
  status: "pending" | "acknowledged" | "opted-out" | "renewed" | "terminated";
  alertState: "none" | "t-90" | "t-60" | "t-30" | "t-7" | "overdue";
  ownerEmail?: string;
}
```

**Written by:** `renewal-alert`.

---

## `vendors.json`

Flat array. One row per counterparty we have any paper with. Detailed consolidation lives in `vendors/{slug}/vendor.json`.

```ts
interface VendorIndex extends BaseRecord {
  slug: string;                       // kebab-case slug (also folder name)
  name: string;
  msaContractId?: string;
  dpaContractId?: string;
  latestSowContractId?: string;
  subprocessorStatus: "current" | "stale" | "unknown";
  openMatterCount: number;
  ytdSpendCents?: number;
}
```

**Written by:** `vendor-consolidate`.

---

## `vendors/{slug}/vendor.json`

Consolidated vendor view: all agreements, SOW history, DPA / SCC status, subprocessor list, security-questionnaire answers, surviving obligations.

```ts
interface VendorFile extends BaseRecord {
  slug: string;
  name: string;
  agreements: VendorAgreementRef[];   // every contract we have with this vendor
  dpa: {
    present: boolean;
    contractId?: string;
    sccsModuleInUse?: "module-1" | "module-2" | "module-3" | "module-4" | "none";
    subprocessors: VendorSubprocessor[];
    subprocessorListLastSeenAt?: string;
  };
  securityQuestionnaire?: {
    answeredAt: string;
    sourceDocRef?: string;
    highlights: string[];
  };
  survivingObligations: SurvivingObligation[];
  sowHistory: VendorSowHistoryEntry[];
}

interface VendorAgreementRef {
  contractId: string;
  type: ContractIndex["type"];
  status: ContractIndex["status"];
  effectiveDate: string;
  expiresAt?: string;
}

interface VendorSubprocessor {
  name: string;
  purpose: string;
  region?: string;
}

interface SurvivingObligation {
  kind: "confidentiality" | "non-solicit" | "indemnity" | "license-grant" | "other";
  description: string;
  survivesUntil?: string;             // ISO-8601 UTC or "perpetual"
  sourceContractId: string;
}

interface VendorSowHistoryEntry {
  contractId: string;
  effectiveDate: string;
  valueCents?: number;
  scopeSummary: string;
}
```

**Written by:** `vendor-consolidate`.

---

## `outside-counsel.json`

Flat array. Approved firms, rates, contacts, engagement letter refs.

```ts
interface OutsideFirm extends BaseRecord {
  firm: string;                       // firm name
  practiceAreas: string[];            // e.g. ["commercial", "privacy"]
  rackRateCentsPerHour?: number;
  negotiatedRateCentsPerHour?: number;
  contact: {
    name: string;
    email: string;
    phone?: string;
  };
  engagementLetterContractId?: string;
  statusOnPanel: "approved" | "trial" | "sunset";
}
```

**Written by:** the user via chat (paneling decisions); this agent never auto-approves a firm.

---

## `invoices.json`

Flat array. Outside-counsel invoices received, with flags and budget variance. Detailed LEDES line items live in `invoices/{id}/invoice.json`.

```ts
interface InvoiceIndex extends BaseRecord {
  firmId: string;                     // foreign key -> outside-counsel.json
  matterId: string;                   // foreign key -> matters.json
  periodMonth: string;                // "YYYY-MM"
  amountCents: number;
  varianceCents?: number;             // actual vs. matter budget pro-rata for the month
  flags: Array<
    | "block-billing"
    | "vague-narrative"
    | "partner-bloat"
    | "over-budget"
    | "duplicate-task"
    | "none"
  >;
  status: "received" | "approved" | "disputed" | "paid";
  ledesCompliant: boolean;
}
```

**Written by:** `parse-invoice`.

---

## `invoices/{id}/invoice.json`

Parsed LEDES detail (line items with timekeeper, task code, hours, rate, narrative).

```ts
interface InvoiceDetail extends BaseRecord {
  id: string;                         // mirrors InvoiceIndex.id
  firmId: string;
  matterId: string;
  periodMonth: string;
  amountCents: number;
  ledesCompliant: boolean;
  lineItems: InvoiceLineItem[];
  flags: InvoiceIndex["flags"];
}

interface InvoiceLineItem {
  id: string;
  date: string;                       // ISO-8601 UTC date (day)
  taskCode?: string;                  // LEDES TASK_CODE (e.g. "L110")
  activityCode?: string;              // LEDES ACTIVITY_CODE (e.g. "A104")
  timekeeperClassification:
    | "partner"
    | "counsel"
    | "associate"
    | "paralegal"
    | "other";
  timekeeperName: string;
  hours: number;
  rateCents: number;                  // USD cents per hour
  lineTotalCents: number;
  narrative: string;
  flags: Array<
    | "block-billing"
    | "vague-narrative"
    | "partner-bloat"
    | "over-budget"
    | "duplicate-task"
  >;
}
```

**Written by:** `parse-invoice`.

---

## `deadlines.json`

Flat array. Corporate and compliance deadlines with live alert states, refreshed by `deadline-watch`.

```ts
interface DeadlineAlert extends BaseRecord {
  type:
    | "franchise-tax"
    | "409a-refresh"
    | "policy-attestation"
    | "sccs-update"
    | "cap-table-certification"
    | "board-consent-due"
    | "renewal"
    | "custom";
  dueAt: string;                      // ISO-8601 UTC
  description: string;
  owner?: string;                     // internal email or name
  status: "pending" | "done" | "waived";
  alertState: "none" | "t-30" | "t-7" | "t-1" | "overdue";
  contractId?: string;                // set when type === "renewal"
}
```

**Written by:** `deadline-watch`, `renewal-alert` (for t-30 / t-7 renewal entries).

---

## Cross-agent data contracts

- **Intake → Operator:** Intake writes new rows into `matters.json` (cross-agent). Fields Intake sets: `id`, `createdAt`, `updatedAt`, `slug`, `title`, `practiceArea`, `ownerType`, `status: "open"`, `openedAt`, `intakeId`, `attorneyReviewRequired`, `tags`, `spendToDateCents: 0`. Operator merges and initializes `matters/{id}/matter.json` with an `opened` timeline event.
- **Counsel → Operator:** Counsel updates `matters.json[n]` fields `reviewId` and `riskScore` only. Operator must not overwrite these via its own skills.
- **Operator → Intake / Counsel:** read-only. Operator never writes into sibling agents' index files.
