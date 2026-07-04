# Logger Refactor M9: Log Size Guardrails

**Date:** 2026-07-04  
**Version:** 0.1.48  
**Save schema:** unchanged, `rt-campaign-v6`  
**Status:** implemented and verified with `npm run check`, `npm run debug`, and production build.

## Goal

Prevent the original logging problem from silently returning.

The old logger generated huge files because full snapshots were treated like normal telemetry. This milestone adds a smoke check that fails when compact events or summaries become too large.

## Guardrails

`npm run debug` now includes `log-size-budget`.

It builds:

- one representative telemetry event;
- one representative day summary;
- one backend snapshot.

Current observed sizes:

```txt
event: 599 bytes
summary: 1175 bytes
snapshot: 7486 bytes
```

Assertions:

- event must stay below 2500 bytes;
- summary must stay below 8000 bytes;
- snapshot must remain a separate heavier diagnostic class.

## Risk Analysis

Risk: limits are too strict and block useful future event fields.

Mitigation: thresholds are generous compared to current observed sizes. If a new field is justified, update the limit intentionally with documentation.

Risk: a single synthetic event does not cover every possible payload.

Mitigation: this is a cheap regression guard, not full telemetry auditing. The next step for production would be aggregate size checks over real playtest logs.

## Verification

Checks run:

- `npm run check`;
- `npm run debug`;
- `npm run build`.
