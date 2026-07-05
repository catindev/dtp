# Logger Refactor M3: Snapshot Logging Opt-In

**Date:** 2026-07-04  
**Version:** 0.1.42  
**Save schema:** unchanged, `rt-campaign-v6`  
**Status:** implemented and verified with `npm run check` and `npm run debug`.

## Goal

Stop treating full debug snapshots as normal telemetry.

The previous frontend posted a backend snapshot every second while the game screen was open. In real playtest logs, snapshots accounted for almost all storage volume.

## Behavior Change

Periodic snapshot posting is disabled by default.

It can be enabled explicitly for local debugging:

```sh
VITE_DTP_DEBUG_SNAPSHOTS=1 npm run dev
```

When enabled, the interval is now 60 seconds instead of 1 second.

Snapshots still happen for status/loss/win transitions through `useStatusDebugSnapshot`, so critical diagnostics are preserved without creating a constant stream of full-state payloads.

## Risk Analysis

Risk: fewer automatic snapshots can make a rare crash harder to inspect.

Mitigation: status-change snapshots remain, manual copy snapshot remains, and runtime error logging is a later milestone.

Risk: a developer expects periodic snapshots in local debugging.

Mitigation: opt-in mode is explicit through `VITE_DTP_DEBUG_SNAPSHOTS=1`.

Risk: a snapshot still goes through backend telemetry transport.

Mitigation: after M2, snapshots are stored as `snapshots/latest.json`, not appended to `events.jsonl`.

## Verification

Checks run:

- `npm run check`;
- `npm run debug`.
