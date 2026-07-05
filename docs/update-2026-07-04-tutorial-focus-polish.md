# Tutorial Focus Polish

**App version:** `0.1.57`  
**Save schema:** unchanged, `rt-tutorial-v9`

This pass fixes two tutorial regressions found in live play.

## Focus Target

Tutorial attention is no longer "always pulse the focused task card."

The Director now exposes focus by current action:

- task-move steps focus the task card;
- character-assignment steps focus the matching free character card;
- wait steps do not pulse a card;
- the focus animation is one-shot, not constant.

The current checklist row also gets a one-shot pop animation whenever a new step becomes active.

## First Task Script

The first tutorial task is now deterministic:

- one QA subtask only;
- no starting bugs;
- high quality;
- no bug triage;
- no generated design/backend/frontend rework.

The goal of stage 1 is only to teach:

1. move task to In Progress;
2. drag QA to task;
3. wait for completion;
4. move task to Done.

Bug discovery and multi-subtask work are taught in later stages.

## Checks

`tutorial-stage-one` smoke now asserts:

- the task is the focus during the task-move step;
- QA is the focus during the QA-assignment step;
- the first task ends with exactly one completed QA subtask;
- no design/rework subtask is created.

