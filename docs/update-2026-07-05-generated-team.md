# Generated team roster

Date: 2026-07-05

## Context

The starting team used fixed names and fixed skill/specialty values. This made every new run start with the same visible characters and the same hidden capability profile.

## Change

New campaign runs now generate the starting team from the run seed:

- the five starting roles remain stable: analyst, backend, frontend, QA, SRE;
- character names are shuffled from a larger name pool;
- each character gets small seed-based variation in stage skills and subtask specialties;
- role identity is preserved by keeping primary skills above a minimum floor.

The same seed still reproduces the same team, which keeps playtest logs and debug harness runs comparable. Different seeds generate different names and capability profiles.

## Balance Notes

The variation is intentionally narrow:

- primary role strengths stay strong enough to preserve the starting-team contract;
- off-role skills can vary, so some runs have slightly more flexible people;
- starting stamina still begins at 100 for every character.

This creates different people without turning the opening hand into a hard random fail.

## Save Compatibility

No save schema bump is required. Existing saves keep their existing characters. The generated roster only affects newly created runs.

## Verification

`debug:rt` includes a `generated-team` smoke check:

- names are unique within the starting team;
- the same seed reproduces the same roster signature;
- different seeds produce a different roster signature.
