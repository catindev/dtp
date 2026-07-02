# Idea Note: Backlog Value Decay

**Date:** 2026-07-01
**Status:** design idea, not implemented.
**Purpose:** preserve the idea for a later backlog/flow redesign pass.

---

## Short Version

Replace the current backlog deadline pressure with quiet opportunity decay:

```txt
Backlog task has no ticking deadline.
While it waits in Backlog, its remaining value slowly decays toward zero.
When the player moves it to In Progress, decay stops and a real delivery deadline starts.
If backlog value reaches zero before the task is taken, the task fades out and adds a small debt hit.
```

This separates three different player decisions:

```txt
did not take the task at all -> quiet opportunity loss + debt
took it and shipped with compromises -> clean/risky/dirty release
took it, invested work, and still missed -> missed-work fallout chain
```

The intent is not to make Backlog harmless. The pressure should come from backlog capacity, spawn cadence, and accumulated debt, not from loud fallout for tasks the player never touched.

---

## Problem Being Addressed

The current model makes untouched backlog tasks feel similar to engaged work:

- a task can lose its deadline budget before the player has started it;
- a task that was never touched can create consequences that feel too dramatic;
- the player can feel punished for not working on everything, instead of making a conscious capacity tradeoff.

The confirmed fun pressure is currently elsewhere:

```txt
QA/analysis scarcity
clean/risky/dirty release decisions
missed work after the player already committed to a task
fallout that clearly points back to a decision
```

Backlog pressure should support that loop, not compete with it.

---

## Design Principle

Backlog should answer this question:

```txt
What am I willing to let go?
```

In Progress should answer this question:

```txt
Can I finish what I committed to?
```

Done/Prod should answer this question:

```txt
Was the release good enough, and what did it cause tomorrow?
```

The idea works only if those layers stay distinct.

---

## Proposed MVP Mechanics

### Backlog State

Add explicit backlog opportunity fields to tasks:

```txt
baseValue             original generated value
remainingValue        current value available if the task is eventually shipped
backlogDecayDuration  how long it takes remainingValue to reach zero in Backlog
backlogDecayElapsed   elapsed decay time while not yet engaged
engagedOnce           true after first move into In Progress
deadlineStarted       true after real deadline begins
```

Naming can change during implementation. The important distinction is:

```txt
baseValue is historical;
remainingValue is gameplay value;
deadline starts only after engagement.
```

### In Backlog

While a task is in Backlog and `engagedOnce === false`:

- no delivery deadline ticks;
- `remainingValue` decays linearly toward zero;
- card shows current value and complexity;
- card does not pulse red because there is no delivery deadline yet;
- if `remainingValue <= 0`, the task fades/shrinks out and resolves as ignored opportunity.

MVP decay should use one global duration first:

```txt
BACKLOG_VALUE_DECAY_GAME_MINUTES = 900
```

That is roughly 1.5 workdays with the current 08:00-18:00 day. Do not immediately make partner/compliance/techdebt decay at different rates. One new tuning axis is enough for the first pass.

### First Move To In Progress

When the player moves a never-engaged task from Backlog to In Progress:

- `engagedOnce = true`;
- backlog value decay stops;
- `task.value` or release value is set to the current `remainingValue`;
- real deadline starts from a fresh delivery budget;
- existing In Progress / Done / Prod rules take over.

This should make "I picked this task" a clear commitment moment.

### After Engagement

Once `engagedOnce === true`, the task must never return to the free backlog-decay state.

Important guardrail:

```txt
Do not allow free deadline parking by moving In Progress -> Backlog.
```

Choose one of these before implementation:

1. Forbid `In Progress -> Backlog` after engagement.
2. Allow the move, but keep the real deadline ticking even if the card is visually parked in Backlog.

The safer MVP is option 1. It matches the mental model:

```txt
Backlog is untouched work.
In Progress is committed work.
```

### Ignored Opportunity Resolution

When backlog value reaches zero:

- remove the card from the active board with a small fade/shrink animation;
- do not create a fallout task;
- do not put it in the loud Morning Briefing consequences block;
- log the event quietly;
- apply a small debt hit.

Suggested first debt formula:

```txt
debtDelta = clamp(ceil(baseValue / 30), 1, 4)
```

Daily safety cap:

```txt
MAX_BACKLOG_DECAY_DEBT_PER_DAY = 6
```

Reason for the cap: debt is intentionally slower and safer than trust, but it still feeds future release score. Without a cap, ignored backlog can become guaranteed long-run death rather than a recoverable strategic cost.

---

## Why Debt, Not Trust

Use `Debt`, not `Trust`, as the cost of untouched backlog decay.

Reasons:

1. Trust is already sensitive because low trust amplifies later damage through pressure-like effects.
2. Trust already caused readability problems when quarter review damage was mixed with release damage.
3. Untouched backlog is usually invisible to customers; it should not feel like public trust damage.
4. Debt already means "unhandled internal mess that makes future work worse."

This creates a better systemic loop:

```txt
ignored backlog -> debt rises
debt rises -> future release scores get worse
future release scores get worse -> clean work becomes harder
```

That connects "I ignored this" to "future delivery got harder" without creating a loud incident for every skipped card.

---

## UI Direction

### Backlog Cards

Backlog cards should show:

- current value;
- approximate complexity;
- role chips if known;
- hidden-work chip if relevant;
- a quiet value bar or small value meter.

Backlog cards should not show:

- red delivery deadline;
- urgent pulsing from delivery time;
- fallout warning language.

The player-facing question should be:

```txt
Is this opportunity worth a scarce work slot?
```

not:

```txt
Is this already an incident?
```

### In Progress Cards

After engagement, cards keep the existing signals:

- deadline bar;
- readiness color;
- role chips;
- current work progress;
- done/rework/late release logic.

### Morning Briefing

Add a quiet daily summary row near the top-level release summary:

```txt
Delivered value: +N
Backlog opportunity faded: -M
Debt from ignored work: +D
Ignored tasks: K
```

This should not live in the same visual tier as `Consequences`.

Reason:

```txt
Consequences are dramatic feedback from risky or missed committed work.
Backlog decay is the quiet price of choosing not to do something.
```

Show loss next to delivered value. A standalone red "lost value" number would teach panic. Showing it beside delivered value teaches tradeoff:

```txt
I let small work fade so the team could deliver bigger work.
```

---

## Logging And Playtest Analysis

Avoid per-tick log spam. Log at aggregation points.

Recommended event/payloads:

```txt
backlog_opportunity_expired
  taskId
  baseValue
  remainingValueBeforeExpire
  complexity
  kind
  debtDelta
  day

day_summary
  backlogValueLost
  backlogExpiredCount
  backlogDebtAdded
  expiredBacklogTaskIds

morning_report_opened
  deliveredValue
  backlogValueLost
  backlogDebtAdded
```

Useful derived metrics:

- value delivered vs value faded;
- debt from ignored backlog vs debt from dirty releases;
- count of tasks taken into progress after losing part of their value;
- average remaining value at engagement;
- how often backlog fills to capacity;
- how often spawner slows because backlog is full;
- whether players ignore low-value/high-complexity tasks intentionally.

---

## Harness Questions Before Implementation

Run a harness prototype before polishing UI.

### H1: Is Debt Recoverable?

Question:

```txt
Does debt from ignored backlog remain bounded under reasonable but imperfect play?
```

Expected:

- debt rises if the player ignores too much;
- clean releases can still pull the run back;
- ignoring backlog is not a guaranteed slow death.

Red flag:

```txt
Debt climbs monotonically even when the player is otherwise playing well.
```

Fixes if red:

- lower `debtDelta`;
- lower daily debt cap;
- slow decay;
- make clean releases reduce debt more reliably;
- reduce spawn pressure.

### H2: Is Selective Ignoring Sometimes Correct?

Compare strategies on the same seed:

```txt
A: take almost everything, release more risky/dirty
B: selectively ignore low-value/high-complexity work
C: over-clean everything
D: mostly ignore backlog
```

Expected:

- B sometimes beats A and C;
- D loses long-term through debt/value starvation;
- A still creates dirty/fallout pressure;
- C may survive but score slower.

Red flag:

```txt
Selective ignoring never wins.
```

If so, value decay is decorative and the real problem is still capacity or reward shape.

### H3: Does Starting Deadline On Engagement Make Missed Work Fairer?

Question:

```txt
Do PAY-004/REP-011-like misses feel less like the game stole time before work started?
```

Expected:

- fewer "I did everything in order and still had no time" moments;
- committed missed work still happens under bad planning or over-cleaning;
- fallout remains meaningful after the player actually engaged.

Red flag:

```txt
In Progress misses vanish entirely.
```

Fixes if red:

- shorten engaged deadlines;
- increase work duration;
- increase QA/rework pressure;
- reduce night recovery or budget availability only if stamina pressure is still too soft.

---

## Side Effects And Guardrails

### Risk: Backlog Becomes Free Parking

If backlog capacity is loosened, value decay alone will not create pressure.

Guardrail:

```txt
Keep BACKLOG_LIMIT tight.
Do not increase capacity in the same pass.
```

The cap is the actual pressure wall. Value decay is the compass.

### Risk: Player Cannot See The Tradeoff

If value decays silently with no summary, it will feel arbitrary.

Guardrail:

```txt
Show current value on cards.
Show daily faded value next to delivered value.
Log expired opportunities with task ids.
```

### Risk: Debt Becomes Invisible Until It Is Too Late

Debt is intentionally quieter than trust, but too quiet can become confusing.

Guardrail:

```txt
Morning Briefing should say debt from ignored work explicitly.
Task postmortem should not blame a release for backlog debt.
```

### Risk: Deadline Parking Exploit

If a player can start a deadline, move the task back to Backlog, and pause the deadline, the system breaks.

Guardrail:

```txt
Once engaged, deadline remains active or returning to Backlog is forbidden.
```

Prefer forbidding the move for MVP.

### Risk: Existing Saves Break

This changes task state shape.

Guardrail:

```txt
Add migration defaults for old tasks.
If semantics are too different, bump SAVE_SCHEMA_VERSION.
```

Suggested migration:

```txt
baseValue = task.value
remainingValue = task.value
backlogDecayElapsed = 0
engagedOnce = task.column !== "backlog"
deadlineStarted = task.column !== "backlog"
```

But if old backlog tasks already have partially spent deadlines, a clean schema reset may be more honest.

---

## First Implementation Slice

Do not implement all refinements at once.

Recommended first slice:

1. Add backlog value fields and migration.
2. Stop delivery deadline ticking for never-engaged backlog tasks.
3. Decay `remainingValue` while in Backlog.
4. On first move to In Progress, start delivery deadline fresh.
5. Expire zero-value backlog tasks into quiet debt.
6. Add card UI for value + complexity in Backlog.
7. Add Morning Briefing summary fields.
8. Add debug harness metrics for H1/H2.

Explicitly postpone:

- different decay speeds by task kind;
- special partner/compliance urgency;
- new reward types;
- changing fallout formulas;
- changing QA/rework balance.

---

## Open Decisions

1. Should `task.value` itself decay, or should release logic use a separate `remainingValue`?
2. Should engaged tasks be forbidden from returning to Backlog, or can they return with deadline still ticking?
3. What is the exact debt formula and daily cap?
4. Should vanished backlog tasks appear in `Prod -> Unfinished`, or only in Morning Briefing/day summary?
5. How much value decay should be visible on the card: exact number, coarse bar, or both?
6. Should backlog value decay pause during the Morning Briefing/menu pause? Expected answer: yes, because the game tick is paused.

---

## Design Verdict

This is a strong direction if it is treated as a commitment model, not just a visual timer replacement.

The important part is the phase split:

```txt
Backlog = opportunity selection
In Progress = commitment and delivery risk
Done/Prod = release quality and consequences
```

The debt choice is also sound. It makes ignored work feed the same economy that later makes releases harder, without adding another opaque trust penalty.

Do not implement it as a soft cosmetic decay. It needs tight backlog capacity, debt accounting, Morning Briefing summary, and harness checks. Otherwise it will either be ignored by the player or become a hidden slow-death system.
