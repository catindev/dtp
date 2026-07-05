# Task narrative M5: task comments scaffold

## What changed

Tasks now support structured comments in gameplay.

Each comment stores:

- `class`: `signal` or `flavor`;
- `narrativeId`;
- creation day and minute;
- variable ids.

Comments render through `renderTaskComment()` in the task inspector. They are not shown on the card face, so scan-level card UI stays compact.

## First signal comments

M5 adds signal comments for:

- partial QA coverage;
- QA converting bugs into rework;
- implementation changing after QA.

These are moments where the player needs a clear next action. The comments do not replace readiness badges or subtasks; they explain why the next action matters.

## Spam guardrails

The comment helper:

- de-dupes repeated adjacent comments with the same `narrativeId` and variables;
- keeps at most 8 comments per task;
- updates `lastCommentId` for telemetry.

## Acceptance

`debug:rt` now verifies:

- partial QA creates `signal.partial-qa-coverage`;
- comment rendering works in Russian;
- changed-after-QA creates `signal.changed-after-qa`.

## Next

More signal and flavor comments can be added later, but only when they explain an actionable state or add rare flavor without hiding gameplay information.
