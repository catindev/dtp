# Update Note: Partial QA Coverage

**Date:** 2026-07-04  
**Version:** 0.1.40  
**Save schema:** `rt-campaign-v6`  
**Status:** implemented and covered by realtime smoke.

## Context

Playtest feedback exposed a confusing state: a task could show release risk `No QA pass` while the task details also said that the QA pass had been completed.

The root cause was partial coverage. Off-role or weak QA work could raise `testCoverage`, but still leave it below the release threshold. The old logic marked the QA subtask as done anyway, leaving the player with a risk they could not clearly fix.

## Behavior Change

QA work now distinguishes two outcomes:

- `coverageComplete = true`: coverage reached `RELEASE_QA_COVERAGE_THRESHOLD`; the QA subtask is completed.
- `coverageComplete = false`: coverage stayed below the threshold; the QA subtask remains open and can be assigned again.

When coverage is partial:

- the task keeps the `no_qa` release reason;
- the QA subtask progress reflects coverage toward the threshold, capped below completion;
- `lastNote` tells the player to assign QA again;
- logs emit `QA coverage partial` instead of `QA pass done`.

## Diagnostics

QA events now include:

- `coverageComplete`;
- `testCoverage`;
- `coverageThreshold`;
- `coverageGain`.

The realtime debug smoke includes `partial-qa-coverage`, which asserts that partial QA leaves the QA subtask open and allows a real QA character to be reassigned.

## Save Compatibility

This changes gameplay semantics for existing tasks and subtasks. In the 0.x save policy, incompatible gameplay states are not migrated. `SAVE_SCHEMA_VERSION` was bumped to `rt-campaign-v6`.
