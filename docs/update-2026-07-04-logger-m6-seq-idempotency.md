# Logger Refactor M6: Persistent Seq And Retry Idempotency

**Date:** 2026-07-04  
**Frontend version:** 0.1.45  
**Backend version:** 0.1.2  
**Save schema:** unchanged, `rt-campaign-v6`  
**Status:** implemented and verified with TypeScript checks plus a live backend HTTP smoke.

## Goal

Make frontend retry batches safe before moving logs to a real server or DB.

## Frontend Change

Each log entry already had `seq`. It is now persisted per session:

```txt
dtp.backendLogSeq.v1.<sessionId>
```

After reload, the logger continues from the last stored sequence instead of starting again at 1.

## Backend Change

`JsonlSessionRepository` stores:

```txt
meta.json -> lastSeq
```

When a batch arrives, the repository ignores any entry with:

```txt
entry.seq <= meta.lastSeq
```

This makes duplicate retry batches idempotent for the current FIFO queue.

## Risk Analysis

Risk: out-of-order delivery could drop a late lower-seq event.

Mitigation: the current frontend queue sends entries FIFO and retries the same head batch. This design intentionally optimizes for that model. A DB implementation can later replace this with a unique `(session_id, seq)` constraint.

Risk: localStorage may reject seq persistence.

Mitigation: sequence still works in memory. Persistence failure only weakens reload idempotency, not gameplay.

Risk: old session meta has no `lastSeq`.

Mitigation: repository normalizes missing `lastSeq` to 0.

## Verification

Checks run:

- `npm run check` in `dtp2`;
- `npm run check` in `dtp-backend`;
- live HTTP smoke on port `8799`;
- first POST returned `appended: 1`;
- repeated POST returned `appended: 0`.
