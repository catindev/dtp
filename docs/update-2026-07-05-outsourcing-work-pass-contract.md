# Outsourcing work-pass completion contract

Date: 2026-07-05

## Context

Outsourced work completed the task state correctly, but UI feedback did not behave like normal character work:

- no `on-subtask-completed` sound;
- no one-shot task bounce;
- telemetry had to infer outsourcing from a separate `outsourced` event type.

The bug came from modeling completion feedback as a list of event types instead of a shared work-pass contract.

## Change

Work completion events now carry a shared payload contract:

- `workPassCompleted: true`;
- `taskId`;
- `subtaskId`;
- `subtaskRole`;
- `workType`;
- `actorType: "character" | "outsource"`;
- `actorId`.

Character work uses `actorType: "character"` and the character id.

Outsourced work uses `actorType: "outsource"` and `actorId: "outsourcing"`.

Outsourced completion now emits the same semantic event types as regular work:

- non-QA subtask: `subtask_done`;
- bugfix subtask: `bugfix_done`;
- QA pass: `qa_done`.

`outsourcing_started` remains separate because it is a start/spend event, not a completion event.

## UI And Telemetry

Sound and task bounce now listen to `isWorkPassCompletedEvent(event)`, not to a hard-coded list of event types. This means outsourced completion triggers the same `on-subtask-completed.ogg` sound and task bounce as internal work.

Game-event telemetry now also exposes:

- `actorType`;
- `actorId`;
- `workType`.

This keeps logs analyzable without parsing event titles or special-casing outsourcing.

## Verification

`debug:rt` now asserts:

- outsourced backend work emits `workPassCompleted` with `actorType: "outsource"`;
- outsourced QA work emits `qa_done` with the same completion contract;
- character completion still emits `actorType: "character"`.

No save schema bump is required: this changes runtime events and logs, not saved gameplay state.
