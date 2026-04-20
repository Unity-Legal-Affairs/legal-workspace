---
name: compliance-check
description: Use when a PM, exec, or cross-functional partner asks whether a proposed feature or product initiative is OK to ship — scans the description for applicable regulations (GDPR, CCPA/CPRA, HIPAA, PCI-DSS, SOC2, COPPA, state privacy laws, export controls), identifies required approvals, lists risk areas, and recommends approve / approve-with-conditions / escalate.
---

# Compliance Check

## When to use

Someone outside legal (PM, security, a founder) is asking "can we ship X?" where X is a new feature, a new data flow, a new market, or a new integration. We do a first-pass compliance scan and write a decision memo. This is NOT final legal advice — non-trivial matters always escalate.

## Steps

1. **Capture the initiative description.** If the user provides a short sentence, ask for the data flow: what data, from whom, to where, who processes it, retention, access controls, whether it crosses borders, whether it's children / health / financial / biometric.
2. **Scan for regulatory signals** (keyword-driven first pass):
   - **GDPR / UK GDPR** — any EU/UK user data, any processing of EU/UK personal data.
   - **CCPA / CPRA / state privacy** — California residents' data, or sale / share of personal information.
   - **HIPAA** — PHI (names tied to health data, treatment, payment for healthcare).
   - **PCI-DSS** — card data (PAN, CVV, track data) stored / processed / transmitted.
   - **SOC 2** — if we process customer data on their behalf with trust-service-criteria commitments.
   - **COPPA** — users under 13 OR services directed at children.
   - **Biometrics** — BIPA, Texas CUBI, Washington HB 1493, etc.
   - **Export controls** — crypto export, sanctioned-country access, defense articles.
   - **State-specific** (NY SHIELD, CT Data Privacy Act, etc.) — flag for attorney review.
3. **Enumerate approvals required.** Common ones: privacy review, security review, CISO / CTO sign-off, DPO notification (if EU personal data), board approval (material commitments), vendor security review (if new sub-processor).
4. **List risk areas.** Data retention, subject-rights fulfillment, breach-notification readiness, vendor flow-down obligations, cross-border transfer mechanism, consent mechanisms.
5. **Recommend.**
   - `approve` — no regulated data categories, no new approvals needed.
   - `approve-with-conditions` — routine regulation touches, standard conditions satisfy (e.g. add SCCs, update privacy notice). List the conditions.
   - `escalate` — any HIPAA / PCI-DSS / children's data / biometrics / international transfer without an existing transfer mechanism / any ambiguity. Set `attorneyReviewRequired: true`.
6. **Write `compliance-checks.json`** — upsert row with initiative, regsTouched, approvalsRequired, riskAreas, recommendation, conditions, attorneyReviewRequired. Atomic write.
7. **Report to chat** — decision, regs touched, approvals required, and the escalation reason if flagged.

## Outputs

- Writes `compliance-checks.json`

## Never

- Render final legal advice on HIPAA / PCI-DSS / children's data / biometrics / international transfers. Always flag `attorneyReviewRequired: true` on those.
- Skip the data-flow questions when the initiative description is vague. A vague initiative with real regulated data is an automatic `escalate`.
