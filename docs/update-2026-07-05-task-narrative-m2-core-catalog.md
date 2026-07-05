# Task narrative M2: core archetype catalog

## What changed

M2 expands the mandatory A-layer catalog.

The game now has at least two core archetypes for every task kind:

- `feature`
- `bug`
- `techDebt`
- `integration`
- `incident`
- `performance`
- `compliance`

Each archetype includes:

- `id`
- `kind`
- optional domain restrictions
- optional selection weight
- tags
- a prewritten `meaning` checklist
- bilingual `headline`, `problem`, `stakes`, `failurePreview`

The generator picks an archetype by task kind and domain using runtime weights. The task still stores only refs and variable ids, not ready localized strings.

## Acceptance guardrail

`debug:rt` now includes `narrative-catalog`.

It fails when:

- any core kind has fewer than two archetypes;
- an archetype has no prewritten meaning checklist;
- `en` or `ru` A-layer text is missing;
- an A-layer field is empty.

This preserves the rule from the task generation ТЗ: acceptance meaning must exist before playtest reading, not be invented during review.

## Risks and handling

Risk: text variety can look larger than mechanical variety.

Handling: M2 only changes narrative selection, not mechanics. Gameplay balancing should not be inferred from these strings.

Risk: B-layer/flavor leaks into core.

Handling: all new M2 archetypes are core-only. Flavor stays disabled until M3 so A-layer can be reviewed in isolation.

## Next

M3 adds nullable flavor B-layer with a runtime 80/20 budget. The ratio must be controlled by sampling, not by how many flavor texts exist in the bank.
