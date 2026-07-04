# Tutorial Mode M4: Full Guided Flow

**App version:** 0.1.55  
**Save schema:** unchanged, `rt-tutorial-v9`

## Goal

Milestone 4 extends tutorial from the first card loop to the full MVP training flow.

The tutorial now covers:

1. moving a task and assigning QA;
2. completing one task through several specialists;
3. shipping a risky task when QA is exhausted;
4. choosing what to do with a missed deadline;
5. reaching the morning report and starting a normal campaign directly.

## Stages

### Stage 1: Task And Team Control

The player moves a simple QA task into In Progress, assigns QA, waits for work, and moves it to Done.

### Stage 2: Several Specialists

The player receives a task with backend, frontend, and QA subtasks.

The Director only allows the current assignment:

- backend;
- frontend;
- QA;
- then move to Done.

### Stage 3: Compromise Under Pressure

QA is deliberately exhausted by the Director. The player must finish urgent backend work and move the task to Done without QA.

This teaches that some releases are compromises, not perfect outcomes.

### Stage 4: Deadline Choice

The player completes SRE work, then the Director forces the deadline into an expired state.

The choice step allows two outcomes:

- move the task to Done: `branchId = "ship_late"`;
- wait: Director advances after 2.5 seconds, `branchId = "wait_missed"`.

The wait path is accelerated by Director. It is not literal waiting.

### Stage 5: End Of Day

Director moves the clock to just before the release train and allows the existing morning report flow to run.

When the tutorial morning report is ready:

- `tutorial.completed = true`;
- the button text becomes `Start new game` / `Начать новую игру`;
- clicking it stores `dtp.tutorial.completed = true`;
- a new normal campaign starts immediately.

The player does not go back through the main menu after tutorial completion.

## Telemetry

Tutorial step events use:

- `tutorial_task_spawned`;
- `tutorial_step_completed`;
- `tutorial_stage_started`;
- `tutorial_completed`.

Choice branches are stored in `branchId` / `activeBranchId`.

This makes playtest splits readable:

- players who start tutorial vs skip tutorial;
- deadline choice: `ship_late` vs `wait_missed`;
- completion before starting a normal campaign.

## Risks And Handling

Risk: the final day never ends because tutorial tick blocks release train.  
Handling: release train stays blocked until `wait-day-end`, then normal morning report is allowed.

Risk: the choice branch requires real waiting.  
Handling: the wait branch has a 2.5 second Director timer.

Risk: QA exhaustion feels random.  
Handling: only the compromise stage deliberately exhausts QA, after restoring the team between tutorial stages.

Risk: tutorial completion is lost on gameplay schema bump.  
Handling: completion still lives in separate localStorage, not in `RtGameState`.

## Verification

`npm run debug:rt` now includes `tutorial-full-flow`.

The smoke checks:

- stage 1 transitions into stage 2;
- the full scripted flow reaches deadline choice;
- `ship_late` branch reaches morning report and `report-ready`;
- `wait_missed` branch reaches day-end without literal long waiting;
- both branches are visible in the smoke payload.
