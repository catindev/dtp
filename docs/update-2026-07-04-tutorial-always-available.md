# Tutorial Always Available In Menu

**App version:** `0.1.58`  
**Save schema:** unchanged, `rt-tutorial-v9`

The tutorial is now always directly available from the main menu.

## What Changed

- The menu always shows a `Start tutorial` / `Пройти обучение` action.
- The first-time recommendation dialog still appears when there is no saved run and tutorial has not been completed.
- Completing tutorial still stores `dtp.tutorial.completed`, but that flag now only controls recommendation, not access.

## Why

During active 0.x playtesting, tutorial should be easy to replay after every iteration. Hiding it after completion makes it harder to test onboarding fixes.

## Save Compatibility

This is a menu-only change. No state shape changed, so `SAVE_SCHEMA_VERSION` remains `rt-tutorial-v9`.

