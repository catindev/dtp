# Update Note: Localization, Quarter Review, And Generator Rebalance

**Date:** 2026-07-01  
**Scope:** current uncommitted prototype update after the July 1 playtest/review pass.  
**Status:** implemented and verified with `npm run check` and `npm run build`.

---

## Summary

This update addresses three connected problems from the latest review/playtest loop:

1. The player could not clearly see when the quarter ends or why a quarter goal failed.
2. The Russian UI was only partially localized, especially in release postmortem notes.
3. Task generation underused frontend work, making the frontend character idle too often in some sessions.

The update keeps the current endless-survival direction: the player is not trying to "win" permanently, but to survive longer and score better while juggling delivery, trust, debt, team stamina, and fallout.

---

## Quarter Planning And Review

### Header

The game header now exposes the full quarter goal:

```txt
Value current/target · Trust current/target
```

The helper line now distinguishes these states:

```txt
Goal met
Need +N value
Need +N trust
Need +N value and +M trust
```

This fixes the previous ambiguity where the player could see `Goal 280/75` and assume the quarter was safe, while the hidden trust requirement could still fail later in the day.

### Morning Briefing

Morning report now has a structural `quarterReview` block when a quarter boundary is crossed.

The block shows:

```txt
Quarter N Review
Goals met / Goals missed
Value actual/target met|missed
Trust actual/target met|missed
Quarter effect: trust -8 or budget/process boost
```

This separates quarter effects from ordinary release and fallout effects. Previously, `resolveQuarter()` ran inside the morning transition and its resource delta was merged into the same top-line delta as yesterday's releases. The screen could show a large trust drop without explaining that part of it came from a missed quarter goal.

### Engine State

`RtMorningReport` now carries separate deltas:

```txt
releaseDelta
consequenceDelta
quarterReview
```

The aggregate `resourceDelta` remains for summary totals, but UI can now attribute effects to their source.

Legacy autosaves are normalized:

```txt
releaseDelta -> zero delta when missing
consequenceDelta -> zero delta when missing
quarterReview -> null when missing
```

This avoids breaking current browser state after loading older saves.

---

## Localization

Added a centralized localization module:

```txt
src/i18n.ts
```

It contains:

- UI string dictionary for `en` and `ru`;
- task title pools for both languages;
- subtask text pools for both languages;
- label helpers for roles, importance, task kinds, readiness, blast radius, and risk reasons;
- regex-based localization for generated event/postmortem strings.

The selected locale is persisted in local storage:

```txt
dtp.locale.v1
```

New runs are created with the currently selected locale, and existing runs normalize missing locale to the default.

### Russian UI Coverage

The following player-facing surfaces now use the localization layer:

- main menu;
- game header;
- team panel;
- outsource card;
- board column names;
- task cards;
- selected task inspector;
- checklist;
- readiness/risk boxes;
- event log;
- loss report;
- debug panel labels;
- morning briefing;
- release postmortem notes;
- quarter review block.

### Postmortem Strings Fixed

The English strings visible in the Russian morning report are now localized, including:

```txt
N important subtask(s) were still open.
N critical subtask(s) were still open.
N known bug(s) shipped.
Release missed the business window by X, reducing value by Y%.
Analysis was incomplete; some work was never discovered.
QA coverage was low.
SRE safety was missing, so blast radius was higher.
Implementation changed after QA, so prior test coverage became stale.
```

Example Russian output:

```txt
Осталось важных подзадач: 2.
Релиз опоздал на 2ч 56м, поэтому value снижено на 44%.
Анализ не был завершен: часть работы так и не открыли.
QA-покрытие было низким.
SRE-защиты не было, поэтому влияние поломки было выше.
Реализацию меняли после QA, поэтому старое тестовое покрытие устарело.
```

Some domain terms are intentionally kept as short game jargon for now (`Value`, `QA`, `SRE`, `frontend/backend`) where they function as compact labels rather than prose.

---

## Task Generator Rebalance

The generator now distributes frontend-relevant work more reliably.

### Changes

Task generation now passes these inputs into subtask generation:

```txt
domain
blastRadius
frontendBias
```

Frontend work can now appear as important/critical work in more task types:

- `feature`: can be frontend-led in UI-heavy domains;
- `bug`: UI domains have higher frontend bug chance;
- `techDebt`: can generate frontend critical refactoring;
- `integration`: frontend integration status can become important;
- `performance`: UI/search/report/admin domains can generate frontend performance work;
- `compliance`: UI copy/masking/export-flow work can become important.

### Guardrail

There is a frontend workload guardrail:

```txt
FRONTEND_GUARDRAIL_WINDOW = 7
FRONTEND_GUARDRAIL_MIN_MAJOR_WORK = 1
```

If the last several ordinary tasks contain too little important/critical frontend work, the next suitable task is biased toward frontend work.

### Expected Effect

This should reduce sessions where the frontend character is idle while QA/SRE/backend carry the whole operational load. The goal is not to make every task frontend-heavy, but to make team composition matter more evenly across runs.

---

## UX Notes

### Language Switch

A compact `EN/RU` switch is now available:

- in the main menu;
- in the game header.

### Quarter Visibility

The session id was removed from the main brand block to reduce header noise. It remains available in debug output instead.

### Release/Morning Report Visual Hierarchy

The quarter review block has its own card style:

- green tint for met goals;
- red tint for missed goals;
- individual chips for Value and Trust goal state.

This makes quarter failure visually separate from release fallout and ordinary shipment rows.

---

## Verification

Commands run after implementation:

```bash
npm run check
npm run build
```

Additional localization smoke check:

```bash
node_modules/.bin/tsx --eval "import { localizeText } from './src/i18n.ts'; ..."
```

Verified Russian translations for the postmortem strings that appeared in the screenshot.

---

## Follow-Up Watchpoints

1. Play one full five-day quarter in Russian and confirm that the quarter review is understandable without reading logs.
2. Watch whether the frontend guardrail makes Nina meaningfully useful without overloading frontend work.
3. Check whether the header becomes too dense with both Value and Trust goals visible.
4. Continue tracking QA recheck pressure; this update explains outcomes better but does not rebalance the recheck mechanic.
5. Decide later whether to localize short domain jargon like `Value`, `frontend`, `backend`, `QA`, and `SRE`, or keep them as compact game terms.
