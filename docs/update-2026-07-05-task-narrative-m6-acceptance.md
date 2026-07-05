# Task narrative M6: acceptance fixture and validation

## What changed

M6 adds a narrative acceptance fixture generator:

```bash
npm run debug:narrative
```

The command prints JSON with:

- `archetypeId`
- task kind
- tags
- prewritten `expectedMeaning`
- rendered EN A-layer
- rendered RU A-layer

This makes the content test reproducible instead of relying on "looks clear to us".

## Playtest protocol

The unit is `card_reader_pair`.

For each pair:

1. Show one rendered card narrative to one reader.
2. Ask them to retell:
   - what the task asks;
   - why it matters;
   - what can go wrong.
3. Compare the retelling to `expectedMeaning`.
4. Mark pass/fail for that card-reader pair.

Aggregate by pairs, not just by cards. A card read by five people produces five pairs.

## Threshold

Target pass rate: 90%.

This threshold is a trigger for a decision, not an automatic verdict. If one archetype repeatedly fails, fix that archetype even when the global pass rate is green. If the global pass rate is low, stop adding flavor and repair A-layer clarity first.

## A/B discipline

For clarity tests, A-layer must be tested independently:

- use `density: core`;
- do not show flavor aside;
- do not ask the reader to infer gameplay from comments;
- compare against `expectedMeaning` written before the test.

Flavor B-layer can be tested later, but it must never carry essential task meaning.

## Validation commands

For this milestone:

```bash
npm run check
npm run debug:rt
npm run debug:narrative
```

`debug:rt` covers runtime generation and game safety. `debug:narrative` covers acceptance fixture shape and A-layer availability.

When redirecting the fixture to a file, use:

```bash
npm run --silent debug:narrative > narrative-fixture.json
```
