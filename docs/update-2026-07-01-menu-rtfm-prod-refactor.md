# Update Note: Menu, RTFM, Prod Cleanup, And UI Refactor

**Date:** 2026-07-01  
**Scope:** latest UI/UX and frontend structure changes after the pause-menu / RTFM iteration.  
**Status:** implemented and verified with `npm run check` and `npm run build`.

---

## Summary

This update cleaned up the player-facing shell around the realtime prototype:

- pause behavior was restored to a direct pause/resume toggle;
- the main/pause menu became the place for language, RTFM, continue, and new run;
- player-facing docs were added as a small bilingual wiki;
- the Prod column was made quieter;
- debug-only event panels were removed from the main play surface;
- menu/docs code was extracted from `App.tsx`.

---

## Pause And Main Menu

Current behavior:

- `Pause` only pauses or resumes the game tick;
- `Menu` opens the main/pause menu and pauses the current run;
- refresh opens the menu by default;
- when an autosave exists, the menu shows a compact saved-run card;
- `Continue` resumes the saved run;
- `New run` starts over from the menu;
- `New run` is not in the game header anymore.

Design reason:

```txt
pause is an in-game tempo control;
menu is a shell/navigation control;
new run belongs in the menu, not next to pause.
```

---

## RTFM / Userdocs

Added a bilingual player wiki:

```txt
userdocs/en
userdocs/ru
```

Pages:

- overview;
- game loop;
- team roles;
- tasks, quality, and risk.

The menu opens the wiki through `RTFM`. The selected UI language controls the displayed docs language.

Implementation:

```txt
src/userdocs.ts
src/components/DocsScreen.tsx
src/components/LanguageSwitch.tsx
```

Markdown is imported with Vite `?raw` and rendered with a small local renderer for headings, paragraphs, and lists. No new dependency was added.

---

## Prod Column Cleanup

Prod now has two views:

- released tasks;
- unfinished / missed work archive.

Changes:

- removed the `Released` / `Зарелизено` chip from released cards;
- disabled urgent pulsing for resolved missed-work cards in `Prod -> Unfinished`;
- kept late chips and postmortem/causal links where they still explain history.

Design reason:

```txt
Prod is history. It should explain what happened, not constantly ask for attention.
```

---

## Source-Linked Fallout UI

Fallout task names were simplified. Instead of putting the source task into the title, the inspector now exposes structure:

- `Triggered by` / `Спровоцировано задачей`;
- source task as a clickable chip;
- `Consequences` / `Последствия` on the source task;
- clicking a link selects and scrolls to the linked task, switching the Prod filter when needed.

This keeps card titles readable and preserves causal links for logs and analysis.

---

## Debug UI

Removed from the main game screen:

- Event Log panel;
- Debug Trace panel.

Still active:

- internal `RtGameState.log`;
- `.dtp-debug/latest-run.json`;
- backend session logs;
- frontend fallback queue while backend is offline.

Design reason:

```txt
players need game state, not debug telemetry.
playtest analysis still needs structured logs.
```

---

## Frontend Refactor

Extracted from `src/App.tsx`:

```txt
src/components/MenuScreen.tsx
src/components/DocsScreen.tsx
src/components/LanguageSwitch.tsx
src/userdocs.ts
src/formatting.ts
```

Result:

- `App.tsx` is smaller by roughly 280 lines;
- menu/docs concerns no longer live inside the main game shell;
- shared formatting helpers are no longer local to `App.tsx`;
- game behavior was intentionally left unchanged.

---

## Verification

Used checks:

```sh
npm run check
npm run build
```
