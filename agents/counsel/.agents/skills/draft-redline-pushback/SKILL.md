---
name: draft-redline-pushback
description: Use when a review has been completed and the user needs to send the counter-proposal to the counterparty — drafts the negotiation message in professional firm-voice, referencing the specific clauses, deviation reasons, and the proposed fallback position from the playbook.
---

# Draft Redline Pushback

## When to use

`review-contract` has produced a review with flagged deviations and proposed redlines. Now we need to communicate our position to the counterparty — an email, a comment, or a message we'll paste into their contract-review platform. We draft it. The user reads, edits, and sends.

## Steps

1. **Load the review.** Read `reviews/{matter-id}/review.md`. Identify all clauses with `minor` or `major` deviations.
2. **Load the playbook** for the relevant clause types, so we can cite our standard position and fallback language verbatim.
3. **Load matter context** from `../operator/matters.json` for counterparty name, our contact, deal type. If available.
4. **Draft the message.** Firm-voice, professional. Structure:
   - Opening — acknowledge receipt, name the document, confirm we're sending our review.
   - One block per flagged clause:
     - Clause name + a short quote of the counterparty's current text.
     - Our position (one sentence, from the playbook's `standardPosition`).
     - Why it matters (one sentence rationale — risk, precedent, practical).
     - Our proposed language (from the playbook's `standardPosition` or the first `fallbackPositions` tier, whichever fits the deal size tier).
   - Closing — offer to jump on a call, suggest a timeline for their response, polite sign-off.
   - NO dramatic language ("egregious", "unacceptable"). NO legal threats. NO final-advice disclaimers that talk to the counterparty as if we're their lawyer.
5. **Write to `reviews/{matter-id}/pushback.md`.** Plain markdown. Overwrite if exists.
6. **Update `reviews.json`.** Flip `status` to `redlined` (from `in-review`). Refresh `updatedAt`. Atomic write.
7. **Report to chat** — confirmation, the counterparty name, and a one-line summary of what we pushed back on. Remind the user that nothing has been sent — they send it themselves via Composio (Gmail / DocuSign / etc.) when ready.

## Outputs

- Writes `reviews/{matter-id}/pushback.md`
- Updates `reviews.json` (`status` → `redlined`)

## Never

- Send the message. The user sends. We draft.
- Address the counterparty as if we represent them. We represent ourselves.
- Promise a date or a term the user hasn't approved.
- Use the playbook's `escalationTrigger` language as a threat. Escalation is our internal process; the counterparty doesn't need to know about it.
