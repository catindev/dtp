# Tutorial Milestone 5: Attention Polish And Follow-Up Boundary

**App version:** `0.1.56`  
**Save schema:** unchanged, `rt-tutorial-v9`

Milestone 5 finishes the tutorial MVP pass with a separate attention signal for the current tutorial target.

## What Changed

- Tutorial focus no longer reuses the one-shot work-complete bounce.
- The focused tutorial task receives a dedicated `tutorial-focus` card class.
- The focused card gently bounces until the player points at it or starts dragging it.
- `on-quest.ogg` remains the audio cue for tutorial task spawn and tutorial step completion.

This keeps three signals separate:

- work-complete bounce: one-shot feedback that a worker finished a task pass;
- urgent pulse: deadline pressure;
- tutorial focus bounce: "interact with this card now."

## Why This Is Separate

The tutorial is a scripted onboarding run. It teaches the core loop with controlled tasks and gated actions.

First-time campaign hints are a different feature and should not be treated as "done" by the tutorial:

- first dirty label;
- first fallout card;
- first horizon review;
- first missed opportunity;
- first exhausted employee;
- first insufficient outsource budget.

Those hints should appear in normal campaign play only when the player first encounters the system. They must be short, localized, and dismissible.

## Risks And Handling

Risk: tutorial focus fights with existing task animations.  
Handling: the tutorial focus uses a separate class and stops during hover/active/drag states.

Risk: the player reads the bounce as a gameplay risk status.  
Handling: the bounce is only active in tutorial mode and only for the current quest target.

Risk: tutorial completion is confused with complete onboarding.  
Handling: docs explicitly keep campaign first-time hints as follow-up work.

## Checks

- `npm run check`
- `npm run debug:rt`

