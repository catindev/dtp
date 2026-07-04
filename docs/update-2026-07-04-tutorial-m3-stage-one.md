# Tutorial Mode M3: Director And First Stage

**App version:** 0.1.54  
**Save schema:** `rt-tutorial-v9`

## Goal

Milestone 3 makes the first tutorial stage playable:

1. the tutorial starts with an empty board;
2. after 2 seconds of game tick, Director spawns one guided QA task;
3. the quest sidebar asks the player to move the task to In Progress;
4. then it asks the player to drag QA onto the task;
5. then it waits until the work completes;
6. then it asks the player to move the task to Done.

This covers the first basic loop: card movement, character assignment, work progress, and Done queue.

## Quest Attention Cue

Tutorial quest events now use `sounds/on-quest.ogg`.

The sound plays once for:

- `tutorial_task_spawned`;
- `tutorial_step_completed`.

The existing `soundEventKeysRef` dedupe keeps this from replaying on every React render.

## Director Model

`src/tutorial/tutorialDirector.ts` owns tutorial rules:

- current stage and step;
- delayed tutorial task spawn;
- allowed tutorial drag/drop actions;
- step completion;
- tutorial game-log events.

React renders the quest and forwards user intent. It does not decide tutorial progression.

## Gating

During tutorial, only the current checklist action is allowed.

Examples:

- during `move-task-to-work`, only the focus task can be dragged into In Progress;
- during `assign-qa`, only QA can be dragged onto the focus task;
- outsource and unrelated characters are rejected;
- wrong drops shake the target and log `tutorial_action_rejected`.

Campaign mode is unaffected because all tutorial gates return allowed when `runMode !== "tutorial"`.

## State Change

Tutorial state now stores:

- `focusTaskId`;
- `focusCharacterId`.

These ids make the tutorial deterministic and analyzable without relying on localized task titles or character names.

Because this changes saved game shape, schema moved from `rt-tutorial-v8` to `rt-tutorial-v9`.

## Risks And Handling

Risk: tutorial gets normal random tasks.  
Handling: tutorial tick skips normal spawner and release train until later stages.

Risk: a wrong action mutates tutorial state.  
Handling: drop handlers check tutorial gates before normal move/assign/outsource logic.

Risk: wait step becomes literal waiting.  
Handling: the first stage task has low complexity and direct QA work; smoke advances it through real assignment ticks.

Risk: tutorial Director state desyncs after reload.  
Handling: timers and focus ids are stored inside `RtTutorialState`.

## Verification

Added `tutorial-stage-one` to `npm run debug:rt`.

The smoke checks:

- the task does not spawn before the 2 second Director timer;
- the task appears in Backlog after the timer;
- only the expected task move is allowed;
- only QA assignment is allowed;
- work completion advances the wait step;
- moving the task to Done completes the first stage.
