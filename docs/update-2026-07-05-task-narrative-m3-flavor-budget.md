# Task narrative M3: nullable flavor layer

## What changed

M3 enables the optional B-layer.

Tasks still remain understandable through the required A-layer:

- `headline`
- `problem`
- `stakes`
- `failurePreview`

Some archetypes now also provide a nullable flavor aside. The task generator may set `narrativeRef.density = "flavor"` only when the runtime budget allows it.

## Runtime budget

Flavor is controlled by `RtGameState.narrativeBudget`, not by how many flavor texts exist in the bank.

Current settings:

- rolling window: 10 tasks;
- target ratio: 20%;
- hard cap: the generator cannot fill the rolling window with flavor even on an unlucky seed.

The budget stores task ids. The current ratio is derived from the generated tasks' `narrativeRef.density`, so logs can be analyzed structurally.

## Acceptance guardrail

`debug:rt` now includes `narrative-flavor-budget`.

It generates 80 tasks and checks:

- flavor appears at least sometimes;
- flavor stays rare;
- every flavor task renders a real B-layer aside.

## Risk handling

Risk: flavor becomes noise.

Handling: the ratio is runtime-gated and the B-layer is never required for task meaning.

Risk: flavor hides important gameplay information.

Handling: flavor text is rendered only as an aside in the story block. It does not replace risk, roles, deadline, value, or readiness signals.
