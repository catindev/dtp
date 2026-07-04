# Tutorial Mode M2: Menu Entry And Recommendation

**App version:** 0.1.53  
**Save schema:** unchanged, `rt-tutorial-v8`

## Goal

Milestone 2 adds the player-facing entry flow without making tutorial mandatory.

The first-time menu now recommends tutorial when there is no saved run and `dtp.tutorial.completed` is not set. The player can:

- start tutorial;
- skip tutorial and start a normal campaign;
- open RTFM;
- continue an existing save without seeing the recommendation.

## Telemetry

The split is visible in frontend action logs:

- `tutorial_started` starts a guided tutorial run;
- `tutorial_skipped` starts a normal campaign run after choosing to skip.

Both payloads include the run seed, run mode, app commit, and save schema. Tutorial start also records the initial stage and step.

## Tutorial Run Skeleton

`createTutorialRealtimeState()` is now a separate entry point.

It creates a normal team and campaign shell, then switches to:

- `runMode: "tutorial"`;
- empty board;
- empty task map;
- disabled normal task spawner;
- tutorial Director state at `team-basics / move-task-to-work`.

The actual scripted task flow is intentionally not in this milestone. It belongs to the Director milestone so menu/telemetry can be tested separately from tutorial gameplay.

## Risks And Handling

Risk: a tutorial run accidentally receives normal seeded tasks or normal backlog spawns.  
Handling: `tutorial-entry` smoke asserts empty board, no tasks, disabled normal spawner, and `tutorial_started` event.

Risk: recommendation becomes blocking.  
Handling: the menu offers an explicit skip path that immediately starts a normal campaign.

Risk: saved runs get interrupted by first-time tutorial logic.  
Handling: the prompt appears only when there is no resume card.

## Verification

Added `tutorial-entry` to `npm run debug:rt`.

Manual acceptance for this milestone:

1. With no saved run and no tutorial completion flag, clicking Start opens the recommendation.
2. Start tutorial enters a tutorial run.
3. Skip starts a normal campaign and logs `tutorial_skipped`.
4. Existing saved runs still show Continue/New Run instead of the recommendation.
