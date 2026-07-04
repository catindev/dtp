# Logger Refactor M7: Runtime Error Telemetry

**Date:** 2026-07-04  
**Version:** 0.1.46  
**Save schema:** unchanged, `rt-campaign-v6`  
**Status:** implemented and verified with `npm run check` and `npm run debug`.

## Goal

Capture browser/runtime crashes as compact telemetry before the page reloads or Chrome shows an error screen.

## Behavior Change

The app root installs listeners for:

- `window.error`;
- `window.unhandledrejection`.

Each failure emits:

```txt
kind: error
type: runtime_error
```

Payload includes:

- source;
- current screen;
- message;
- stack;
- compact game state: status, pause, day, campaign day, game time, task count.

The handler also writes a debug snapshot with:

```txt
trigger: runtime_error
```

## Risk Analysis

Risk: error logging itself can throw and create a loop.

Mitigation: the handler is wrapped in `try/catch` and never rethrows.

Risk: stack traces can be larger than normal events.

Mitigation: this event is rare and goes to `errors.jsonl`, separate from normal gameplay events.

Risk: errors that happen before React mounts are not captured.

Mitigation: acceptable for this milestone. Earlier boot-level capture can be added if that becomes a real source of crashes.

## Verification

Checks run:

- `npm run check`;
- `npm run debug`.
