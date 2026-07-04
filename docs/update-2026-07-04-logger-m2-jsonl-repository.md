# Logger Refactor M2: JSONL Repository Backend

**Date:** 2026-07-04  
**Backend version:** 0.1.1  
**Frontend version:** unchanged, 0.1.41  
**Status:** implemented in `dtp-backend` and verified with `npm run check` plus an HTTP smoke.

## Goal

Replace the old per-session monolithic JSON file with an append-friendly storage model, while keeping the backend ready for a future database adapter.

## Storage Contract

The backend now writes:

```txt
logs/index.json
logs/sessions/<sessionId>/
  meta.json
  events.jsonl
  summaries.jsonl
  errors.jsonl
  snapshots/
    latest.json
```

Events, summaries, and errors are append-only JSONL files.

Snapshots are not appended to the event stream. A snapshot overwrites `snapshots/latest.json`, so frequent debug snapshots cannot grow the session log without bound.

## Repository Pattern

Storage is behind a `LogRepository` interface:

- `ensure`;
- `health`;
- `readIndex`;
- `readSession`;
- `resetSession`;
- `appendEntries`;
- `sessionLocation`.

The current implementation is `JsonlSessionRepository`.

This keeps HTTP routes independent from file layout. A future DB logger should replace the repository implementation instead of rewriting server routes.

## Risk Analysis

Risk: old `logs/index.json` and `logs/sessions/<id>.json` files do not match the new storage version.

Mitigation: the backend starts a fresh `version: 3` index. Old files are left on disk but are not treated as active sessions.

Risk: JSONL can have a corrupt final line after a hard process kill.

Mitigation: the session reader parses JSONL line by line and ignores invalid lines. Appends remain simple and cheap.

Risk: GET `/api/log?sessionId=...` becomes less useful without the old full JSON file.

Mitigation: the endpoint returns session `meta`, recent events/summaries/errors, and the latest snapshot.

## Verification

Checks run:

- `npm run check` in `dtp-backend`;
- live HTTP smoke on port `8799`;
- smoke confirmed one event in `events.jsonl`;
- smoke confirmed one snapshot in `snapshots/latest.json`.
