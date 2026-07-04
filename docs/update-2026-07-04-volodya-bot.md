# Volodya bot: playtest-derived automation

## Context

Old playtest logs contain enough repeated action/event chains to extract a practical player model, but not enough clean data to replay the player exactly. Early sessions were dominated by large snapshots, while useful signal came mostly from `action` and `game_event` entries: task moves, assignments, QA completions, releases, outsourcing attempts, and day summaries.

This note documents the observed play patterns and the debug bot that imitates them.

## Observed Patterns

Across the larger historical sessions:

- The player commits backlog cards quickly when the board has capacity, but does not intentionally flood `In Progress`.
- Typical WIP is roughly 2-4 active tasks.
- Most releases are clean, but risky releases are accepted when the deadline, value, or trust cushion makes waiting expensive.
- Dirty releases are uncommon and mostly happen when the task is already late, resources are blocked, or release pressure is high.
- QA is a central loop: QA pass, bug found, bugfix, QA recheck.
- Analysis is used often, but not strictly before every implementation step.
- Outsourcing is used as an expensive fallback, mostly for missing competence, QA/recheck pressure, and hard blockers.
- The player protects stamina somewhat, but will push people below comfortable stamina when the board is burning.

The strongest quantitative anchors from parsed old logs:

- `Backlog -> In Progress`: 201 observed moves.
- `In Progress -> Done`: 159 observed moves.
- Done readiness mix: 101 clean, 40 risky, 18 dirty.
- Assignments by role: QA 207, backend 186, frontend 141, SRE 140, analyst 121.
- QA-heavy tasks commonly include 1-2 QA passes; recheck loops happen after bugfixes.
- Outsourcing succeeds mostly on design/QA/important work, while many attempts fail because of insufficient budget or busy tasks.

## Bot Behavior

`volodya` is implemented as a debug bot in `src/debug/volodya.ts` and can be run with:

```sh
npm run debug:volodya
```

Optional controls:

```sh
npm run debug:volodya -- 515151
DTP_VOLODYA_SEEDS=16 npm run debug:volodya -- 515151
```

The bot:

- keeps 2-4 tasks in progress depending on backlog/team/release pressure;
- commits valuable, urgent, or decaying backlog cards first;
- assigns QA aggressively to `no_qa`, `known_bug`, and `changed_after_qa`;
- uses analysis for hidden work and low clarity, but avoids analyzing every task to 100;
- lets developers/SRE work on matching subtasks first, then off-role work if pressure is high;
- queues clean tasks immediately;
- queues risky tasks under deadline/value/trust pressure;
- queues dirty tasks only with trust cushion and heavy deadline pressure;
- outsources missing competence, QA pressure, and blockers when budget allows.

## Intended Use

The bot is not a balance oracle. It is a reproducible approximation of the current human play style, useful for:

- catching regressions in basic survivability;
- comparing balance changes against the current playtest style;
- testing whether a new mechanic creates pressure for a realistic cautious player;
- producing repeatable baseline runs before a manual playtest.

If future playtests change the dominant strategy, the bot should be updated from logs again.

## Known Limits

- It does not simulate UI pause/hesitation directly.
- It has no visual perception model; it sees full engine state.
- It does not reproduce misclicks, failed drags, or attention lapses except indirectly via conservative WIP and stamina thresholds.
- It is intentionally not optimal: it should sometimes release risky work and sometimes spend budget imperfectly.
