# Legal Workspace

A three-agent workspace for **startup in-house counsel and legal ops** — the solo GC at a Series A-C startup wearing every hat, and the legal ops manager at a later-stage company running the function. Designed for the overlap: contract lifecycle, vendor and outside-counsel management, compliance deadline tracking, and knowledge capture.

## Who this is for

You are either:
- The **first legal hire** at a 50-300 person startup. You handle commercial contracts, employment one-offs, privacy/DPAs, corporate hygiene, and manage outside counsel. Your contract tracker is a spreadsheet. Your playbook lives in a Google Doc. You lose an afternoon a week to NDAs alone.
- The **legal ops manager** at a 500+ person company with a 2-10 person legal team. You own CLM, outside-counsel spend, matter intake routing, metrics, and tooling. You answer "what's legal doing?" every month with screenshots stitched from five systems.

Either way, you want agents that do the invisible work — triage, classification, playbook comparison, renewal alerts, invoice review, precedent retrieval — so your human attention goes to the judgment calls.

## The three agents

### Intake — the front door
Every inbound legal request lands here. NDAs get GREEN/YELLOW/RED classification. Vendor security questionnaires get diffed against the last-answered version. Template responses (DSR ack, litigation-hold ack, standard NDA approval, insurance cert request, subpoena acknowledgement) get drafted — never sent — for your approval. Anything substantive routes to Counsel. Anything needing tracking opens a matter in Operator.

Skills: `triage-inbound`, `nda-traffic-light`, `draft-template-response`, `open-matter`, `route-to-counsel`, `security-questionnaire-intake`.

### Counsel — the substantive reviewer
The contract playbook lives here. Every MSA, DPA, and vendor paper gets compared clause-by-clause against `playbook.json` (standard position / acceptable range / escalation trigger / fallback positions). Deviations surface with suggested redlines. Clauses from every executed contract index into a precedent library you can search by counterparty and clause type. Risk gets assessed on a 5×5 severity × likelihood matrix. DPAs diff against the prior-executed version with the same counterparty. Compliance checks scan proposed product initiatives against GDPR, CCPA, HIPAA, PCI-DSS, SOC2, and export controls. **Drafts only — never renders final legal advice.** Non-routine matters get flagged `attorneyReviewRequired: true` automatically.

Skills: `review-contract`, `extract-clauses`, `precedent-search`, `risk-assess`, `dpa-diff`, `compliance-check`, `update-playbook`, `draft-redline-pushback`.

### Operator — the back-office
Runs the legal function. Matters, outside-counsel spend (LEDES invoice parsing, block-billing / vague-narrative / budget-variance flags), renewal calendar with 90/60/30-day alerts, vendor-agreement consolidation (all MSA/DPA/SOW/order forms per counterparty in one view), board/diligence-room prep, compliance deadline watch (DE franchise tax, 409A refresh, policy attestations). The monthly metrics report writes itself.

Skills: `open-matter`, `parse-invoice`, `renewal-alert`, `vendor-consolidate`, `board-package`, `diligence-room`, `metrics-report`, `deadline-watch`.

The three agents share data through the filesystem — Intake writes matters to `../operator/matters.json`, Counsel writes review refs and risk scores back onto those matter records, Operator's renewal calendar reads `../counsel/clauses.json` for term and notice-period extraction. You don't wire them together; they see each other's work.

## Integrations

Every external tool — Gmail, Slack, Jira/Linear intake, Box, Google Drive, iManage, SharePoint, DocuSign, Ironclad, Spotdraft, Juro, Agiloft, SimpleLegal, Brightflag, Carta, Rippling, OneTrust, Whistic, Diligent, and anything else — is accessed through **[Composio](https://composio.dev)**. There are no per-tool documents or configs in this workspace. Connect whatever you use in Houston's Integrations tab; the agents discover tool slugs via `composio search <keyword>` and adapt.

## Hard constraints (built in)

- **Never renders final legal advice.** Every agent flags `attorneyReviewRequired: true` on non-routine matters — routed to a human before anything external goes out.
- **Never sends.** Intake drafts template responses, Counsel drafts redlines and pushback messages, Operator drafts board packages and diligence checklists. You approve in chat.
- **Privilege-aware.** Skills preserve privilege markers on privileged work product; they don't leak summaries of privileged matters to third-party channels.
- **Composio-only transport.** No tool is hardcoded; skills describe *what* to fetch, not *which tool*.
- **Data at agent root.** Never under `.houston/<agent>/` (Houston's file watcher skips that path and dashboards would stop reacting).

## Install

In Houston: **Add from GitHub** → paste this repo's URL. Houston installs all three agents and creates a workspace under `~/Documents/Houston/Legal Workspace/`.

First-run: the three agents start with empty indexes (seeded via `agentSeeds`), so dashboards render clean empty states with prompts pointing you at what to try first.

## Try these first

**Intake:**
- `Triage my legal-intake inbox from the connected channels` — pulls everything new, classifies, drafts template responses where safe.
- `NDA traffic-light scan my queue` — runs the GREEN/YELLOW/RED rubric across pending NDAs.
- `Open a matter for the Acme MSA review` — creates a matter in Operator and routes the review to Counsel.

**Counsel:**
- `Review the attached contract against our playbook` — clause-by-clause deviation report with redline.
- `What did we agree to on LOL caps with [vendor] last year?` — precedent search.
- `Assess the risk of this matter` — 5×5 matrix classification.
- `Can we ship this feature?` (paste a PRD) — compliance check against GDPR/CCPA/HIPAA/SOC2/etc.

**Operator:**
- `What renewals are coming up in the next 90 days?` — renewal calendar with opt-out dates.
- `Parse the invoice from [firm] this month` — LEDES parse + budget variance + block-billing flags.
- `What do we have with [vendor]?` — consolidated vendor view across all agreements.
- `Prep the board package for next Thursday` — consents, open items, filings due.
- `Monthly legal metrics` — cycle time, spend by firm, volume by requester team.

## Structure

```
legal-workspace/
├── workspace.json
├── README.md
└── agents/
    ├── intake/
    │   ├── houston.json
    │   ├── CLAUDE.md
    │   ├── bundle.js
    │   ├── icon.png
    │   ├── data-schema.md
    │   └── .agents/skills/<6 skills>/SKILL.md
    ├── counsel/
    │   ├── houston.json
    │   ├── CLAUDE.md
    │   ├── bundle.js
    │   ├── icon.png
    │   ├── data-schema.md
    │   └── .agents/skills/<8 skills>/SKILL.md
    └── operator/
        ├── houston.json
        ├── CLAUDE.md
        ├── bundle.js
        ├── icon.png
        ├── data-schema.md
        └── .agents/skills/<8 skills>/SKILL.md
```

## Data layout

Each agent stores data at its own root — never under `.houston/<agent>/`, which Houston's file watcher skips (dashboards wouldn't react). Everything is JSON indexes + per-entity subfolders with markdown for narrative artifacts (reviews, pushback drafts, board packages, diligence checklists). Writes are atomic via temp-file-rename. See each agent's `data-schema.md` for the full contract.

Cross-agent reads and writes use relative paths: Counsel reads `../intake/queue.json`, Operator reads `../counsel/reviews.json`, Intake writes new matters to `../operator/matters.json`. Each agent's `data-schema.md` documents the cross-boundary flows explicitly.

## Prior art

The Intake `nda-traffic-light` skill and Counsel's `risk-assess` 5×5 matrix adapt patterns from [Anthropic's legal knowledge-work plugin](https://github.com/Unity-Legal-Affairs/knowledge-work-plugins/tree/main/legal). The filling gaps Anthropic's plugin left open — matter management, clause library / precedent capture, outside-counsel spend, reactive dashboards, cross-agent handoffs — are the reason this workspace exists.

