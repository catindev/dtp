# Update Note: Year Campaign, Horizon Goals, And Victory Report

**Date:** 2026-07-04  
**Scope:** first implementation pass for the campaign "year" form.  
**Status:** implemented on `catindev/year-campaign` and verified with `npm run check`, `npm run build`, `npm run debug:rt`, and `npm run debug:ab`.

---

## Summary

The realtime prototype now has a finite campaign frame on top of the existing daily release loop.

Current campaign shape:

- one campaign year is 80 game days;
- one quarter is 20 game days;
- one month is 10 game days;
- one week is 5 game days;
- weekly goals are available from day 1;
- monthly goals unlock after the first week;
- quarterly goals unlock after the first month;
- yearly goal unlocks after the first quarter;
- surviving past day 80 wins the run.

The design intent is not to replace endless-survival pressure entirely. The year campaign gives the prototype a clear victory contract and a clean place for post-run evaluation, while long-run playtest thinking can still compare score, grade, value, trust, debt, fallout, and burnout.

---

## Engine Changes

New calendar model:

```txt
src/engine/calendar.ts
```

It derives:

- campaign day;
- week and day-in-week;
- month and week-in-month;
- quarter and day-in-quarter;
- unlocked business horizons.

New goal model:

```txt
src/engine/goals.ts
```

Goals are stored in:

```txt
state.horizonGoals.week
state.horizonGoals.month
state.horizonGoals.quarter
state.horizonGoals.year
```

Each goal tracks:

- opened day;
- end day;
- current value earned inside the horizon;
- expected value;
- trust target;
- reward;
- missed trust penalty.

Release value is now applied to every active horizon goal. The legacy `quarterValue` / `quarterGoal` fields remain as a compatibility projection while old UI/report code is phased out.

---

## Horizon Reviews

Morning transition now resolves every due horizon goal.

Example: if a day is both the end of a week and the end of a month, the morning report can contain two review blocks.

The player-facing morning screen reads:

```txt
report.horizonReviews[]
```

The legacy field:

```txt
report.quarterReview
```

is still populated from quarter reviews for compatibility, but it is no longer the primary UI source.

Trust damage from stacked failed goals is capped per day:

```txt
MAX_HORIZON_TRUST_DAMAGE_PER_DAY = 10
```

This prevents a single morning from becoming an unreadable trust cliff when week, month, and quarter all fail together.

---

## Header

The game header now shows campaign time instead of a quarter-only line.

Displayed context:

- week;
- day in week;
- month;
- quarter;
- campaign day out of 80;
- nearest active horizon goal;
- next review timing.

This makes planning visible without forcing the player to read debug logs.

---

## Victory Contract

The run is won when the team reaches the morning after day 80 without losing.

Loss conditions still have priority:

- trust reaches 0;
- clients reach 0;
- debt reaches 100.

If none of those fires before the year ends, the game sets:

```txt
state.status = "won"
state.victoryReport = ...
state.paused = true
```

The victory report includes:

- grade A-D;
- score 0-100;
- final resources;
- peak debt;
- release mix;
- fallout created/resolved/unresolved;
- missed tasks;
- expired backlog opportunities;
- total burnout.

The first scoring formula is intentionally simple and should be treated as a tuning surface, not a finished balance contract.

---

## Save Versioning

Gameplay state changed structurally, so save schema moved to:

```txt
rt-campaign-v5
```

In 0.x, incompatible gameplay saves are not migrated. The menu asks the player to start a new run instead.

---

## Diagnostics

Realtime smoke now includes:

- horizon boundary review smoke;
- stacked horizon trust cap smoke;
- win-contract smoke with victory report assertions.

Long-run A/B harness treats `status === "won"` as successful survival.

Observed harness shape after this pass:

- competent bot can reach year-end in a majority of sampled seeds;
- reckless bot still dies quickly;
- clean vs dirty release separation remains visible.

---

## Follow-Up Risks

The current goals are static tuning numbers. They work as a first playable contract, but they are not final balance.

Known follow-ups:

- review whether weekly goals are too easy after process boost grows;
- review whether clean bot runs reaching 3000+ value imply runaway economy;
- replace remaining quarter-specific names in historical docs only if they start confusing current work;
- decide whether victory should include a leaderboard payload.
