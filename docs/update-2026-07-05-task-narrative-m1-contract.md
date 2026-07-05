# Task narrative M1: schema and renderer contract

## What changed

M1 starts the task generation rewrite away from saved localized task titles.

Fresh `RtTask` now carries:

- `narrativeRef.archetypeId`
- `narrativeRef.branchId`
- `narrativeRef.variantSeed`
- `narrativeRef.variableValueIds`
- `narrativeRef.tags`
- `narrativeRef.density`
- `comments`
- `lastCommentId`

The player-facing card title, card problem line, inspector story block, task links, shipment rows, and loss active-pressure rows render through `renderTaskNarrative()`.

`task.title` remains only as a temporary debug marker (`TASK-ID: archetypeId`) while old internal event strings are cleaned up in later milestones. It is no longer a UI source of truth.

## No legacy gameplay state

This is a schema-breaking change. `SAVE_SCHEMA_VERSION` is now `rt-narrative-v10`.

During 0.x we do not preserve old gameplay state across incompatible model changes. Old saves should be rejected by schema mismatch and the player should start a new run.

`normalizeRealtimeState()` and task normalization are only for current-schema sanitation and debug harnesses. A task without `narrativeRef` is invalid for the current schema.

## Current content scope

M1 includes a minimal core archetype set:

- one self-contained core archetype per task kind;
- tutorial-specific archetypes for scripted tutorial tasks;
- no runtime flavor yet.

This keeps the game playable while the actual content catalog is expanded in the next milestones.

## Open follow-ups

- M2 expands the core archetype bank and wires task generation to richer archetype selection.
- M3 adds runtime flavor budget and nullable B-layer rendering.
- M4 gives fallout tasks their own narrative refs instead of generic core text.
- M5 adds event-driven task comments split into `signal` and `flavor`.
- M6 adds acceptance fixtures with prewritten meaning checklists.
