# Idea: Remove Design As A Separate MVP Role

Status: idea, not implemented.
Date: 2026-07-02.

## Summary

Design should probably be removed from the current MVP as a separate executable work type.

Right now it adds cognitive noise and can feel unfair: the starting team has no designer, but the generator can create design subtasks. The player then reads the situation less as an interesting tradeoff and more as a bad roll that requires outsource spending.

The useful meaning behind design should move into analysis and, later, into a separate external dependency mechanic.

## Why This Matters

The current core loop is strongest when the player manages:

- clarity through analysis;
- implementation through backend, frontend, and SRE work;
- risk reduction through QA;
- stamina and budget pressure.

Design as an extra role does not currently add enough unique decisions to justify the extra mental load. In many corporate product flows, design is also a shared or external function: delivery teams often receive design input from outside the team rather than treating it as an internal engineering task.

## Current Symptoms

- The starting roster has no dedicated designer.
- A task can arrive with design work before the player has meaningful tools to plan around it.
- Outsource becomes a required design patch instead of an emergency capacity tool.
- Two design tasks early in a run can feel like bad luck, not like a readable strategic problem.
- The role chips become noisier while the main playable roles already cover the interesting pressure.

## Proposed Direction

Remove `design` as an executable subtask role from the MVP.

Move its gameplay meaning into:

- `analysis`: product scenario clarification, UX edge cases, acceptance criteria, copy/flow decisions;
- future external dependency mechanics: waiting for design/product input, buying external help, or accepting a lower-confidence solution.

This keeps the visible MVP role set closer to the main production loop:

- analysis;
- backend;
- frontend;
- QA;
- SRE.

## Expected Benefits

- Lower cognitive load on cards.
- Fewer early-game "unfair hand" situations.
- Cleaner player reasoning: if a task is blocked, it is blocked by visible team capacity, stamina, QA, SRE, clarity, or budget.
- Outsource can return to being a costly fallback, not a mandatory missing-role bandage.
- The game can preserve design/product uncertainty through analysis without introducing a standalone specialist before the system needs one.

## Risks And Compensations

Removing design reduces one current budget sink. If we do it, budget pressure should be preserved elsewhere:

- QA/SRE outsource remains expensive;
- emergency actions such as stamina loans or incident response can consume budget;
- future hiring/contractor systems can become the major long-term spend.

It can also make tasks slightly easier unless design-generated work is retargeted:

- design uncertainty should increase analysis cost or hidden-work probability;
- design-related bugs should become frontend, analysis, or QA follow-up work;
- task templates that currently add design should be rebalanced toward frontend or analysis.

## Implementation Notes For Later

This is a state-breaking gameplay change and should bump `SAVE_SCHEMA_VERSION`.

Likely areas to update:

- remove or deprecate `design` from task/subtask role types;
- remove `designer` from MVP-facing role lists if it remains unused;
- retarget generated design subtasks in the task factory;
- retarget bug/rework generation that currently creates design work;
- update outsource copy and pricing if design is no longer a supported target;
- update localization, userdocs, and the main design document;
- add tests/smokes for runs that previously produced early design blockers.

## Open Questions

- Should design become a future external dependency event rather than a role?
- Should analysis become slower or more stamina-expensive when it absorbs UX/product uncertainty?
- What should replace design as an early budget pressure point?
- Should some task categories still mention design narratively without creating design work?
