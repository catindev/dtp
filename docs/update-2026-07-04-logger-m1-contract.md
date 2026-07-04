# Logger Refactor M1: Log Contract v1

**Date:** 2026-07-04  
**Version:** 0.1.41  
**Save schema:** unchanged, `rt-campaign-v6`  
**Status:** implemented and verified with `npm run check` and `npm run debug`.

## Goal

Start the logging refactor by creating a stable event contract before changing storage.

The previous logger used loosely shaped entries with:

- `kind: action | game_event | snapshot`;
- `name`;
- arbitrary `payload`.

That was enough for local debugging, but not enough for append-only JSONL or a future DB schema.

## New Contract

Frontend log entries now include:

- `schema: "log-v1"`;
- `seq`;
- `kind: event | snapshot | summary | error`;
- `type`;
- `payload`.

Actions and game events are now both normal telemetry events:

- UI actions use `kind: "event"` and `payload.channel = "action"`;
- engine events use `kind: "event"` and `payload.channel = "game_event"`;
- debug snapshots keep `kind: "snapshot"`.

## Compatibility Decision

There is no compatibility layer for old log entries or old backend readers.

The project is still in 0.x, and the goal of this refactor is stable, compact, analyzable logs. Keeping legacy aliases would make the new contract less clear and would preserve the exact shape that made the current logs hard to reason about.

The current backend is updated in the next milestone to read `type` directly.

## Risks And Mitigation

Risk: old localStorage queues may contain pre-`log-v1` entries.

Mitigation: the queue validator now accepts only `log-v1` entries. Old queued diagnostics are discarded automatically. This is acceptable for local debug logs and does not affect gameplay saves.

Risk: the pre-refactor backend expects `name`.

Mitigation: this is intentionally not supported. Milestone 2 replaces the backend storage path with `log-v1` JSONL files.

Risk: sequence numbers are currently in-memory only.

Mitigation: this milestone introduces the field but does not rely on it for dedupe yet. Persistent seq/idempotency is handled by the later offline queue milestone.

## Verification

Checks run:

- `npm run check`;
- `npm run debug`.
