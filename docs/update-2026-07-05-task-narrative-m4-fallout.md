# Task narrative M4: fallout narrative refs

## What changed

Fallout tasks now use dedicated narrative archetypes instead of noisy generated titles.

Generated fallout tasks carry structured narrative variables:

- `sourceTaskId`
- `cause`
- `area`

The task headline stays readable:

- `Fix fallout in ...`
- `Handle fallout escalation in ...`
- `Repair partner fallout in ...`
- `Rework fallout in ...`

The relationship to the source task is still visible in the inspector through the existing "Triggered by" section and task link. Logs can now analyze fallout by `narrativeRef.archetypeId`, `variableValueIds.sourceTaskId`, and `variableValueIds.cause` without parsing text.

## Why

Old fallout names duplicated cause and source in the task title. That made cards noisy and made telemetry depend on title parsing.

The new model keeps the card title short and moves causality into data.

## Guardrails

`debug:rt` now extends the missed-work smoke:

- generated fallout task must have a `fallout` tag;
- `sourceTaskId` must match the source card;
- `cause` must be structured;
- debug `title` must not contain noisy `after TASK-ID` wording;
- rendered problem text must still explain the source id to the player.

## Next

M5 adds event-driven task comments, split into signal and flavor, so consequences can add short notes without bloating the headline.
