# Task narrative copy guardrails

This update fixes two player-facing narrative problems found in a live RU card:

- generated Russian templates used `{area}` as a grammatical subject, which produced phrases like `партнерские выплаты закрывал`;
- internal design slang such as `хвосты` leaked into player-facing copy.

## Rule

Narrative templates must not require a single generated variable to work in every Russian case.

Use explicit domain variables for Russian grammar:

- `{areaAcc}`: `уведомления клиентов`, `экспорт отчетов`, `логин`;
- `{areaGen}`: `уведомлений клиентов`, `экспорта отчетов`, `логина`;
- `{areaPrep}`: `уведомлениях клиентов`, `экспорте отчетов`, `логине`.

Avoid generic wrappers like `зона: {area}`. They avoid grammar bugs but read like translated English.

## Player-Facing Terms

Internal terms are still allowed in code, tags, archetype ids, docs, logs, and telemetry:

- `fallout`;
- `хвост`;
- `tail`.

Player-facing task narrative should use ordinary product language instead:

- `последствие`;
- `дополнительная работа`;
- `эскалация`;
- `follow-up work`;
- `consequence`.

## Smoke Coverage

`npm run debug:rt` now renders narrative archetypes across domains and checks player-facing text for banned terms and known bad phrases:

- RU: `хвост`, `фоллаут`, `закрывал`, `породить`;
- RU: `зона` / `зоне` / `зоны` / `зону`;
- EN: `fallout`.

The smoke checks rendered core and flavor text, not internal ids or tags.
