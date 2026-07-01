# Update Note: Refactor Milestones And Current Architecture

**Date:** 2026-07-01
**Scope:** refactor pass after the menu/RTFM/Prod iteration.
**Status:** implemented and verified with `npm run check`, `npm run build`, `npm run debug:rt`, and `npm run debug:ab`.

---

## Summary

This pass turned the prototype from two large working files into a split engine + shell structure.

Before the refactor, most behavior lived in:

```txt
src/realtime/simulation.ts
src/App.tsx
```

After the refactor:

- `src/realtime/simulation.ts` is a compatibility facade for the game engine API;
- `src/engine/*` owns simulation rules;
- `src/hooks/*` owns browser/runtime orchestration;
- `src/components/*` owns player-facing UI panels;
- `src/App.tsx` wires the shell together instead of containing the implementation.

The refactor was intentionally behavior-preserving. The goal was to reduce risk for future mechanics work, not to rebalance the game.

---

## Engine Split

The realtime simulation was split into focused engine modules.

Current responsibilities:

```txt
src/engine/balance.ts       constants and tuning knobs
src/engine/types.ts         shared realtime state types
src/engine/rng.ts           deterministic random helpers
src/engine/catalog.ts       task catalogs and role/domain data
src/engine/taskFactory.ts   task creation and title/subtask generation
src/engine/spawn.ts         initial team/tasks and task spawn cadence
src/engine/board.ts         legal board movement
src/engine/work.ts          character assignment, stamina, progress, bugs, QA, analysis
src/engine/outsourcing.ts   outsource availability, payment, and progress
src/engine/release.ts       release train and business effects
src/engine/consequences.ts  fallout, missed work, chain depth, terminal effects
src/engine/morning.ts       morning report assembly
src/engine/time.ts          day clock, deadlines, shock decay
src/engine/loss.ts          loss checks and loss report
src/engine/migration.ts     autosave normalization
src/engine/readiness.ts     clean/risky/dirty, late release, release score internals
src/engine/resources.ts     resource delta helpers
src/engine/math.ts          small numeric helpers
```

`src/realtime/simulation.ts` now keeps the public API stable for the UI:

- `createRealtimeState`;
- `tickRealtime`;
- `moveRealtimeTask`;
- `assignCharacterToTask`;
- `outsourceTaskWork`;
- `cancelTaskWork`;
- `runDailyReleaseTrain`;
- readiness and formatting exports.

Design reason:

```txt
UI code should not know where every simulation rule lives.
Tests/debug harnesses should be able to call one stable facade.
```

---

## Legacy Runtime

The old prototype runtime was moved away from the active path:

```txt
src/archive/core
src/debug/legacy.ts
```

`debug:legacy` exists for historical comparison. Active realtime checks use:

```txt
npm run debug:rt
npm run debug:ab
```

This removes the previous ambiguity where dead code still looked like the main engine.

---

## App Shell Refactor

`App.tsx` is now the composition layer:

- boot state;
- choose screen: `menu`, `game`, `docs`;
- hold selected task/doc/prod filter state;
- connect hooks to components;
- render the current shell.

The implementation moved into hooks:

```txt
src/hooks/useGameBoot.ts          autosave boot, initial session, locale, refs
src/hooks/useGameMutation.ts      safe state mutation wrapper
src/hooks/useRuntimeEffects.ts    ticker, autosave, backend log pump, debug snapshots
src/hooks/useGameActions.ts       start/continue/menu/pause/cancel/link actions
src/hooks/useGameDragAndDrop.ts   task/character/outsource drag-and-drop
src/hooks/useGameEventEffects.ts  event logging and one-shot task bounce
src/hooks/useTaskFeedback.ts      flash, bounce, reject shake, pause shake
src/hooks/useLocaleSync.ts        locale persistence and state sync
src/hooks/useSelectedTaskSync.ts  selected task cleanup after state changes
```

The main UI moved into components:

```txt
src/components/GameHeader.tsx
src/components/MenuScreen.tsx
src/components/DocsScreen.tsx
src/components/TeamPanel.tsx
src/components/BoardPanel.tsx
src/components/TaskCard.tsx
src/components/TaskInspector.tsx
src/components/MorningReportPage.tsx
src/components/LossReport.tsx
src/components/RunBanner.tsx
src/components/SidePanel.tsx
src/components/ReadinessBadge.tsx
src/components/TinyBar.tsx
```

Design reason:

```txt
App should show the page layout.
Hooks should orchestrate browser/game side effects.
Components should render one visible area each.
```

---

## UI Changes Captured In This Pass

The refactor also preserved and documented the latest UX decisions:

- `Pause` only pauses or resumes the game;
- `Menu` opens the main menu and pauses the current run;
- language settings live in menu/docs screens, not in the active game header;
- `New run` lives in the menu, not in the game header;
- the game header shows a compact quarter/day line, goal value/trust, release countdown, and resources;
- noisy goal-helper text was removed from the header;
- `Prod` replaced `Released` as the player-facing column concept;
- `Prod` has two filters: released tasks and unfinished/missed resolved work;
- released cards no longer show the extra `Released` / `Зарелизено` chip;
- Done cards no longer show the old `Ships at 18:00` chip;
- `Checklist` is now `Subtasks` / `Подзадачи`;
- Russian `Unknown work` is now `Скрытая работа`;
- fallout task titles no longer include the source task name;
- the inspector shows structured links:
  - `Triggered by` / `Спровоцировано задачей`;
  - `Consequences` / `Последствия`;
- linked task chips select and scroll to the linked card, switching the `Prod` filter when needed;
- in-game Event Log and Debug Trace are removed from the player surface, while backend/session logging remains active.

---

## Current File Size Snapshot

The biggest active files after the pass:

```txt
src/engine/work.ts                 ~633 lines
src/engine/consequences.ts         ~461 lines
src/components/MorningReportPage.tsx ~367 lines
src/hooks/useGameDragAndDrop.ts    ~352 lines
src/engine/migration.ts            ~348 lines
src/engine/types.ts                ~337 lines
src/engine/taskFactory.ts          ~314 lines
src/realtime/simulation.ts         ~284 lines
src/App.tsx                        ~254 lines
```

Interpretation:

- the original two largest bottlenecks were reduced substantially;
- the next refactor targets are now obvious and local;
- future work should not add new mechanics directly into `App.tsx`.

---

## Verification

Commands used after the refactor sequence:

```bash
npm run check
npm run build
npm run debug:rt
npm run debug:ab
git diff --check
```

The checks are not exhaustive automated tests. They are the current guardrail set:

- TypeScript catches broken imports/types;
- production build catches Vite packaging issues;
- `debug:rt` catches core realtime regressions such as quarter length and release/morning flow;
- `debug:ab` checks the clean/risky/dirty anti-dominance shape;
- `git diff --check` catches whitespace and patch hygiene issues.

---

## Remaining Refactor Targets

Recommended next milestones:

1. Split `src/engine/work.ts` into assignment, progress, stamina, QA/bugs, and analysis helpers.
2. Split `src/engine/consequences.ts` into release fallout, missed work, chain termination, and text/payload builders.
3. Split `src/hooks/useGameDragAndDrop.ts` into payload parsing, move/drop handlers, and rejection feedback.
4. Move remaining magic balance numbers out of formulas into `src/engine/balance.ts`.
5. Add narrower regression checks around migration, missed work, outsource, and QA recheck.

These are lower-risk now because the public facade and visible UI components are already separated.
