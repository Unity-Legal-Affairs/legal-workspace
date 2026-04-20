---
name: triage-inbound
description: Use when an inbound legal request arrives via any Composio-connected channel (email, Slack, ticketing, upload) and no queue entry exists yet — fetch the raw message via Composio, classify category (NDA / MSA / DPA / order-form / employment / privacy / security-questionnaire / subpoena / litigation-hold / DSR / vendor-security / corp / other), extract counterparty and requester team, assign P1-P4 priority from content signals + requester team, and write the queue row atomically.
---

# Triage Inbound

## When to use
A fresh inbound legal request has landed and no `queue.json` entry exists for it yet, OR an existing entry must be re-triaged because the content materially changed (e.g. a "quick question" attached a subpoena, or a routine ping turned into a litigation-hold notice). Every inbound request runs this skill before any other action is taken on it.

## Steps
1. **Identify the source** (`email | slack | ticketing | upload | other`). The user names the channel or a fetch reference is supplied. Use `composio search <keyword>` to find the correct fetch slug for that channel type. Do NOT hardcode tool slugs.
2. **Fetch via Composio.** Pull subject, body (text and HTML if available), sender, recipients, external thread id, and any attachment refs. Store attachments as metadata references — do not copy blobs into the agent folder unless the user asks.
3. **Classify category.** Choose one of: `nda | msa | dpa | order-form | employment | privacy | security-questionnaire | subpoena | litigation-hold | dsr | vendor-security | corp | other`. Use content signals: "mutual non-disclosure" → nda; "master services" → msa; "data processing" → dpa; "subpoena" or "records request" → subpoena; "preservation" or "legal hold" → litigation-hold; "data subject request" / "DSAR" / "right to delete" → dsr; "SOC 2" / "security questionnaire" / questionnaire-style forms → security-questionnaire.
4. **Extract counterparty + requester.** Identify the external counterparty (e.g. "Acme Corp") from signatures, email domain, or signature block. Identify the internal requester's team (`sales | procurement | hr | eng | finance | exec | other`) from the requester's email or Slack handle.
5. **Assign priority.** Content + requester-team signals:
   - **P1 (default)**: outages, data-loss, active subpoena, litigation-hold notices, regulator contact, any "breach" / "class action" language.
   - **P2**: sales-blocked deals, exec-team requests, time-sensitive employment matters.
   - **P3**: standard vendor paper, routine privacy review, non-urgent MSA/DPA.
   - **P4**: FYI, general questions, template requests.
6. **Set SLA.** `firstReplyDueAt` = now + SLA window: **P1 = 2h**, **P2 = 1 business day**, **P3 = 3 business days**, **P4 = 7 business days**. `breached = false` initially.
7. **Flag `attorneyReviewRequired`.** Set `true` when ANY of these hold: category is `litigation-hold` or `subpoena`; employment matter involves termination / separation / harassment; content contains RED-flag keywords (`breach`, `subpoena`, `regulator`, `class action`, `investigation`, `preservation notice`). When in doubt, flag.
8. **Atomic write.** Upsert into `queue.json` with `status = "classified"` (or `"new"` if no routing rule matched). Write full detail to `intake/{id}/request.json` including `classificationNotes` (reasoning captured) and `playbookHints` (lifted from any matched `routing-rules.json` entry). Use `.tmp` + rename.

## Outputs
- Writes `queue.json` (index upsert)
- Writes `intake/{id}/request.json` (full detail with classificationNotes + playbookHints)
