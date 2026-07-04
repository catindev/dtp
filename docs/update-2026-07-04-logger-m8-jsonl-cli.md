# Logger Refactor M8: JSONL Inspection CLI

**Date:** 2026-07-04  
**Version:** 0.1.47  
**Save schema:** unchanged, `rt-campaign-v6`  
**Status:** implemented and verified with `npm run check` plus a missing-session CLI smoke.

## Goal

Keep playtest analysis practical after replacing monolithic session JSON with JSONL files.

## Commands

```sh
npm run logs:session -- <sessionId>
npm run logs:summary -- <sessionId>
npm run logs:events -- <sessionId> [--type task_spawned]
npm run logs:timeline -- <sessionId>
```

Default backend log directory:

```txt
/Users/vladimirtitskiy/Dev/dtp-backend/logs
```

Override:

```sh
DTP_BACKEND_LOG_DIR=/path/to/logs npm run logs:summary -- <sessionId>
```

## Behavior

The CLI reads:

- `meta.json`;
- `events.jsonl`;
- `summaries.jsonl`;
- `errors.jsonl`;
- `snapshots/latest.json`.

It does not need the old giant per-session JSON file.

## Risk Analysis

Risk: the CLI may encourage inspecting raw events instead of adding better summaries.

Mitigation: this tool is for developer/playtest diagnostics. Player-facing explanations still belong in UI.

Risk: old pre-JSONL sessions are not readable by this command.

Mitigation: no legacy support by design. The new logging model is the source of truth going forward.

## Verification

Checks run:

- `npm run check`;
- `npm run logs:summary -- missing-session`.
