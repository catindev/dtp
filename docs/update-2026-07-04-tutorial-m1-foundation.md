# Tutorial Mode M1: State Foundation

**App version:** 0.1.52  
**Save schema:** `rt-tutorial-v8`

## What Changed

Milestone 1 only adds the persistence foundation for tutorial mode.

- `RtGameState.runMode` now separates normal campaign runs from tutorial runs.
- `RtGameState.tutorial` reserves a serializable Director state with current stage, current step, completed steps, branch id, and timers.
- Normal campaign runs still start with `runMode: "campaign"` and `tutorial: null`.
- Tutorial completion is stored separately in localStorage via `dtp.tutorial.completed`.

## Why Completion Is Outside The Run Save

Tutorial completion is player-level progress, not gameplay-run state.

During 0.x development, gameplay saves are intentionally reset on incompatible schema changes. If tutorial completion lived inside the run save, every schema reset could force the player to repeat tutorial. Keeping it in a separate localStorage key lets completion survive `SAVE_SCHEMA_VERSION` bumps.

## Compatibility

This is a gameplay state shape change, so old autosaves are not migrated. The save schema moved from `rt-campaign-v7` to `rt-tutorial-v8`.

Normalization still fills missing tutorial fields for debug fixtures and internally-created partial states:

- missing `runMode` becomes `campaign`;
- campaign runs always clear `tutorial` to `null`;
- tutorial runs with missing tutorial payload get a safe `boot` placeholder.

## Verification

Added `tutorial-foundation` to `npm run debug:rt`.

The smoke checks:

- new runs default to campaign mode;
- campaign runs do not carry tutorial state;
- completion storage fails closed when localStorage is unavailable;
- legacy state without tutorial fields normalizes to campaign;
- partial tutorial state gets a safe Director placeholder.
