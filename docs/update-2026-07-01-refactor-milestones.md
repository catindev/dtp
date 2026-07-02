# Update Note: Refactor Milestones And Current Architecture

**Date:** 2026-07-01
**Updated:** 2026-07-02
**Scope:** refactor pass after the menu/RTFM/Prod iteration, plus follow-up engine/UI cleanup.
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
src/engine/locale.ts        engine-local locale type and normalizer
src/engine/content.ts       simulation task/subtask text used by task generation and UI maps
src/engine/rng.ts           deterministic random helpers
src/engine/catalog.ts       task catalogs and role/domain data
src/engine/taskFactory.ts   task assembly facade
src/engine/taskKind.ts      task kind weights, blast radius, value multiplier
src/engine/taskSubtasks.ts  generated subtask composition and frontend-work guardrail
src/engine/spawn.ts         initial team/tasks and task spawn cadence
src/engine/board.ts         legal board movement
src/engine/work.ts          assignment, active progress, stamina drain, task selection
src/engine/workStages.ts    analysis, implementation, QA, bugfix, and test completion
src/engine/workRules.ts     shared work scoring/postmortem helpers
src/engine/bugs.ts          bug discovery, QA recheck, and bugfix subtask creation
src/engine/outsourcing.ts   outsource availability, payment, and progress
src/engine/release.ts       release train and business effects
src/engine/consequences.ts  consequence orchestration facade
src/engine/consequenceTail.ts tail task creation, chain depth, terminal effects
src/engine/consequenceText.ts consequence symptoms and legacy title cleanup
src/engine/consequenceResolution.ts missed work resolution and minor-hit rules
src/engine/morning.ts       morning report assembly
src/engine/time.ts          day clock, deadlines, shock decay
src/engine/loss.ts          loss checks and loss report
src/engine/migration.ts     autosave normalization orchestration
src/engine/migrationReports.ts morning report and consequence save migration
src/engine/migrationTasks.ts task save migration
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
src/hooks/dragAndDropHelpers.ts   drag payload parsing, reject reasons, drag ghost
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
src/components/MorningReportSections.tsx
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

## Follow-Up Refactor Pass 2026-07-02

The second pass focused on reducing the remaining hotspots without changing gameplay balance.

Completed milestones:

1. `src/engine/work.ts` progress/stamina formulas were named and grouped into local helpers.
2. Stage completion moved from `work.ts` to `src/engine/workStages.ts`.
3. Shared work helpers moved to `src/engine/workRules.ts`, removing the `outsourcing.ts -> work.ts` dependency.
4. Engine text/locale dependencies were moved out of UI `i18n.ts` into `src/engine/content.ts` and `src/engine/locale.ts`.
5. Task generation was split into `taskFactory.ts`, `taskKind.ts`, and `taskSubtasks.ts`.
6. Backend log transport/queue moved from `frontendLogging.ts` to `src/logging/backendLog.ts`.
7. Drag-and-drop payload/reject helpers moved from `useGameDragAndDrop.ts` to `src/hooks/dragAndDropHelpers.ts`.
8. The consequence contour was split into orchestration, tail creation, text, and resolution modules.
9. Autosave migration was split into state orchestration, morning report migration, and task migration.
10. `MorningReportPage.tsx` was reduced to page composition; report subsections moved to `MorningReportSections.tsx`.
11. Debug/backend snapshot building moved from `frontendLogging.ts` to `src/logging/debugSnapshot.ts`.
12. `debug:rt` gained narrow regression smoke checks for migration normalization and debug/backend snapshot shape.
13. Morning report sections were split into resource, flow, quarter review, consequence, shipment, and formatting modules.

Important compatibility choices:

- `src/realtime/simulation.ts` still re-exports the public engine API for UI code and debug scripts.
- Saved game locale values remain `"en"` / `"ru"`; no save reset is required for the locale refactor.
- `i18n.ts` re-exports engine content, so existing UI imports keep working while engine no longer imports UI i18n.
- Drag-and-drop behavior is intentionally unchanged; the refactor only moved MIME payload parsing, reject text, pause blocking, and ghost rendering.
- Backend logging still uses the same localStorage queue key and backend endpoints.
- Backend log config now tolerates Node debug-script imports without assuming Vite `import.meta.env`.

---

## Current File Size Snapshot

The biggest active files after the follow-up pass:

```txt
src/engine/workStages.ts                  ~405 lines
src/engine/work.ts                        ~366 lines
src/engine/types.ts                       ~337 lines
src/realtime/simulation.ts                ~284 lines
src/hooks/useGameDragAndDrop.ts           ~281 lines
src/logging/backendLog.ts                 ~271 lines
src/App.tsx                               ~254 lines
src/engine/taskSubtasks.ts                ~175 lines
src/engine/consequenceTail.ts             ~171 lines
src/logging/debugSnapshot.ts              ~170 lines
src/engine/consequences.ts                ~165 lines
src/hooks/dragAndDropHelpers.ts           ~134 lines
src/engine/migrationReports.ts            ~133 lines
src/engine/migration.ts                   ~131 lines
src/engine/migrationTasks.ts              ~128 lines
src/engine/consequenceText.ts             ~108 lines
src/components/MorningResourceGrid.tsx    ~92 lines
src/engine/taskFactory.ts                 ~92 lines
src/components/MorningReportFormat.ts     ~89 lines
src/components/MorningReportPage.tsx      ~88 lines
src/components/MorningShipmentList.tsx    ~73 lines
src/engine/consequenceResolution.ts       ~62 lines
src/components/MorningConsequenceList.tsx ~55 lines
src/components/QuarterReviewPanel.tsx     ~52 lines
src/frontendLogging.ts                    ~48 lines
src/components/MorningFlowStrip.tsx       ~24 lines
src/components/MorningReportSections.tsx  ~5 lines
```

Interpretation:

- the original two largest bottlenecks were reduced substantially;
- the next refactor targets are now mostly engine/runtime seams;
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
- `debug:rt` also catches save migration normalization and backend snapshot shape regressions;
- `debug:ab` checks the clean/risky/dirty anti-dominance shape;
- `git diff --check` catches whitespace and patch hygiene issues.

---

## Remaining Refactor Targets

Recommended next milestones after this pass:

1. Split `src/engine/workStages.ts` into analysis, implementation, QA, and bugfix modules once mechanic changes resume.
2. Split `src/hooks/useGameDragAndDrop.ts` by drop target if the drag UX gains more rules.
3. Split `src/logging/backendLog.ts` into queue storage, transport, and compaction if diagnostics work expands.
4. Add narrower regression checks around outsource, QA recheck, and drag/drop rejection semantics.

These are lower-risk now because the public facade and visible UI components are already separated.
