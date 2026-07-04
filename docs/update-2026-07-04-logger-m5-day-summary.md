# Logger Refactor M5: Day Summary Telemetry

**Date:** 2026-07-04  
**Version:** 0.1.44  
**Save schema:** unchanged, `rt-campaign-v6`  
**Status:** implemented and verified with `npm run check` and `npm run debug`.

## Goal

Add compact summaries so playtest analysis does not need frequent full-state snapshots.

## Behavior Change

When a Morning Briefing is created, the frontend emits one backend log entry:

```txt
kind: summary
type: day_summary
```

The summary is keyed by `morningReport.id` and logged once.

Payload includes:

- report id;
- day and previous day;
- shipped/missed task ids;
- consequence counts;
- resource delta;
- release delta;
- consequence delta;
- `daySummary`;
- compact horizon review rows;
- current resources after the report.

## Risk Analysis

Risk: React rerenders can duplicate the same summary.

Mitigation: the hook stores logged report ids in a ref and ignores repeats.

Risk: summary logs can become another large payload class.

Mitigation: consequence objects are not copied. The payload stores counts and ids only.

Risk: an autosaved Morning Briefing may log again after reload.

Mitigation: that is acceptable for now because persistent seq/idempotency is handled by the offline queue milestone. The summary id remains stable enough for later dedupe.

## Verification

Checks run:

- `npm run check`;
- `npm run debug`.
