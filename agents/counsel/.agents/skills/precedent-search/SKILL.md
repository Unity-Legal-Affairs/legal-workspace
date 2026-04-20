---
name: precedent-search
description: Use when the user asks `what did we agree to on [clause] with [counterparty]` or `find me past examples of [clause-type]` — retrieves matching clauses from `clauses.json` ranked by recency and exact-counterparty match, with the full text from `clauses/{contract-id}/clauses.json`.
---

# Precedent Search

## When to use

The user wants to know what position we've previously accepted on a given clause type — either with a specific counterparty ("what's our standard with Acme on liability?") or generically ("show me our last five indemnification clauses"). This skill does NOT mutate state; it reads and returns to chat.

## Steps

1. **Parse the query.** Extract `clauseType` (required — map natural-language terms to our enum) and optional `counterparty` name.
2. **Load `clauses.json`.** If absent or empty, tell the user and stop.
3. **Filter.**
   - Keep rows where `clauseType` matches.
   - If `counterparty` is specified, prioritize exact-match (case-insensitive, trimmed) over fuzzy match.
4. **Rank.**
   - Exact-counterparty matches come first.
   - Then sort by `updatedAt` descending (recency).
   - Cap at 10 results unless the user asked for more.
5. **For each hit, load the full clause text** from `clauses/{contractId}/clauses.json` (the index has a trimmed copy; the per-contract file has the canonical full text).
6. **Return to chat** a formatted list: counterparty, contract type, clause text, deviation marker, and the contract link (if Operator's `../operator/contracts.json` has a `documentUrl` for that `contractId`, include it).

## Outputs

- Writes nothing. Returns structured results to chat.

## Never

- Hallucinate a precedent. If `clauses.json` is empty for that `clauseType`, say so.
- Rank by similarity to a freeform text query — this is a clause-type / counterparty filter, not a semantic search.
