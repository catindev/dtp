# Update Note: Time Speed Controls

**Date:** 2026-07-04  
**Version:** 0.1.50  
**Scope:** runtime UI control for game time speed.  
**Status:** implemented on `catindev/year-campaign` and verified with `npm run check`, `npm run build`, `npm run debug:rt`, and a browser smoke.

---

## Summary

The game header now has time speed controls next to the clock:

- `1x`;
- `1.5x`;
- `2x`.

`1x` remains the default speed. Starting a new run resets the speed to `1x`.

## Behavior

The realtime ticker still runs every `500ms` in real time. The selected speed multiplies the simulated time applied per tick:

- `1x`: normal game speed;
- `1.5x`: faster planning flow when the board is stable;
- `2x`: fast-forward for quiet stretches.

The speed controls are disabled when the run is not actively playable, such as morning report, win screen, or loss screen.

## Save Compatibility

This is a runtime UI setting, not gameplay state. It is not saved into the run state and does not change `SAVE_SCHEMA_VERSION`.

## Verification

Checks run:

```sh
npm run check
npm run debug:rt
npm run build
```

Browser smoke:

- started a new run;
- confirmed `1x` is active by default;
- switched to `2x`;
- confirmed the game clock advances faster;
- confirmed there were no console errors.
