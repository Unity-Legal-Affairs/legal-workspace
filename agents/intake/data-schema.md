# Intake Agent — Data Schema

Every file documented here lives at the **agent root** (or under a subfolder at the agent root). Nothing lives under `.houston/<agent>/` — the file watcher skips those paths and the dashboard would not react.

All records share three common fields:

```ts
interface BaseRecord {
  id: string;          // UUID v4
  createdAt: string;   // ISO-8601 UTC
  updatedAt: string;   // ISO-8601 UTC
}
```

Writes to JSON files are atomic: write `<path>.tmp`, then rename. Cross-agent writes to `../operator/*` and `../counsel/*` follow the same rule.

---

## `queue.json` (index)

A flat array used by the dashboard for fast rendering. One entry per inbound request. Detailed content lives in `intake/{id}/request.json`.

```ts
interface QueueItem extends BaseRecord {
  id: string;                        // intake id (also the folder name)
  source: "email" | "slack" | "ticketing" | "upload" | "other";
  counterparty?: string;             // e.g. "Acme Corp"
  subject: string;                   // short subject line
  requesterEmail?: string;
  requesterTeam?: "sales" | "procurement" | "hr" | "eng" | "finance" | "exec" | "other";
  category:
    | "nda"
    | "msa"
    | "dpa"
    | "order-form"
    | "employment"
    | "privacy"
    | "security-questionnaire"
    | "subpoena"
    | "litigation-hold"
    | "dsr"
    | "vendor-security"
    | "corp"
    | "other";
  ndaTrafficLight?: "GREEN" | "YELLOW" | "RED";
  status: "new" | "classified" | "drafted" | "routed" | "matter-opened" | "closed";
  priority: "P1" | "P2" | "P3" | "P4";
  routedTo?: "counsel" | "operator" | "self";
  matterId?: string;                 // set when a matter is opened in Operator
  attorneyReviewRequired: boolean;
  sla: {
    firstReplyDueAt?: string;        // ISO-8601 UTC, set at triage
    breached: boolean;
  };
  tags: string[];
}
```

**Written by:** `triage-inbound` (create), `nda-traffic-light` (sets `ndaTrafficLight`, may set `attorneyReviewRequired`), `draft-template-response` (status → `drafted`), `route-to-counsel` (status → `routed`, `routedTo = "counsel"`), `open-matter` (status → `matter-opened`, `matterId`).

---

## `intake/{id}/request.json`

Full detail for one intake request. Created at triage, enriched by downstream skills.

```ts
interface IntakeRequest extends BaseRecord {
  id: string;                       // same as the queue entry id
  queueId: string;                  // foreign key into queue.json (same as id)
  source: "email" | "slack" | "ticketing" | "upload" | "other";
  rawText: string;                  // the original message body (plain text)
  rawHtml?: string;                 // original HTML body if any
  attachments: IntakeAttachment[];  // parsed attachments list
  metadata: {
    externalThreadId?: string;      // upstream message/thread id (Composio returns these)
    externalFrom?: string;
    externalTo?: string[];
    externalCc?: string[];
    receivedAt?: string;
    [key: string]: unknown;
  };
  classificationNotes?: string;     // reasoning the triage skill captured
  playbookHints?: string[];         // hints extracted from routing-rules.json at triage
  questionnaire?: {
    // Populated by security-questionnaire-intake when source is a questionnaire.
    questions: QuestionnaireQuestion[];
    delta?: QuestionnaireDelta;
  };
}

interface IntakeAttachment {
  id: string;
  filename: string;
  mimeType?: string;
  size?: number;
  storageRef?: string;              // where the attachment is stored (opaque)
}

interface QuestionnaireQuestion {
  id: string;
  section?: string;
  question: string;
  expectedFormat?: "yes-no" | "free-text" | "attachment" | "multiple-choice";
}

interface QuestionnaireDelta {
  newQuestions: string[];           // question ids not seen before for this counterparty
  changedQuestions: string[];       // question ids whose text materially changed
  unchangedQuestions: string[];     // question ids answerable from prior responses
  priorVendorSlug?: string;         // ../operator/vendors/{slug} reference when applicable
}
```

**Written by:** `triage-inbound` (create), `nda-traffic-light` (may append classification notes), `draft-template-response` (may append classification notes), `security-questionnaire-intake` (populates `questionnaire`).

---

## `intake/{id}/draft-response.md`

Plain markdown. The current template response draft awaiting human approval. Overwritten each time a fresh draft is generated. **Never sent automatically.**

**Written by:** `draft-template-response`.

---

## `templates.json`

The response template library. Loaded by `draft-template-response` to render replies.

```ts
interface ResponseTemplate extends BaseRecord {
  id: string;
  key:
    | "dsr"
    | "litigation-hold"
    | "vendor-security"
    | "nda-approve"
    | "nda-standard-redline"
    | "privacy-inquiry"
    | "subpoena-ack"
    | "insurance-cert"
    | "custom";
  title: string;                    // human-readable title
  body: string;                     // markdown body with {{placeholders}}
  escalationRules: string[];        // plain-English rules, e.g.
                                    //   "If dataset mentioned contains children's data → escalate to counsel"
  defaultRoutedTo: "self" | "counsel" | "operator";
}
```

**Written by:** human operators (seeded) and, occasionally, an agent skill when the user explicitly asks to add a template.

---

## `routing-rules.json`

Declarative routing rules that `triage-inbound` and `route-to-counsel` consult to decide where a request goes.

```ts
interface RoutingRule extends BaseRecord {
  id: string;
  matchCategory: string;            // matches QueueItem.category (or "*" for any)
  matchKeywords: string[];          // any-of match on subject + rawText
  routedTo: "self" | "counsel" | "operator";
  priorityFloor?: "P1" | "P2" | "P3" | "P4";
  notes?: string;                   // human notes, also used as playbookHints
}
```

**Written by:** human operators (seeded and curated).

---

## `ndas.json` (fast NDA sub-queue)

Dashboard-optimized view over NDAs. Every row points back at a `queue.json` entry. Kept denormalized on purpose — the dashboard's NDA section reads this file without joining.

```ts
interface NdaRow extends BaseRecord {
  id: string;
  queueId: string;                  // foreign key into queue.json
  counterparty: string;
  mutual: boolean;
  termMonths?: number;
  residuals?: "standard" | "broad" | "none";
  governingLaw?: string;            // e.g. "Delaware", "California", "New York"
  trafficLight: "GREEN" | "YELLOW" | "RED";
  flagClauses: string[];            // short labels, e.g. ["non-compete", "IP assignment"]
}
```

**Written by:** `nda-traffic-light`.

---

## Cross-agent writes (reference)

This agent performs cross-agent writes to the following files owned by sister agents. They are documented here for transparency; their full schemas live in the respective sister agent's `data-schema.md`.

- `../operator/matters.json` — index upsert when a matter is opened. Each row includes `id`, `slug`, `title`, `practiceArea`, `ownerType`, `status`, `openedAt`, `intakeId`.
- `../operator/matters/{matterId}/matter.json` — full matter detail, including a back-link to `../../intake/intake/{queueId}/request.json`.
- `../counsel/queue-in.json` — routing notes for substantive review: `{ id, intakeId, category, counterparty, playbookHints[], priority, routedAt }`.

All cross-agent writes are atomic (`.tmp` + rename).
