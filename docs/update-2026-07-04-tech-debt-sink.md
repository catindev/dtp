# Update Note: Tech Debt Release Sink

**Date:** 2026-07-04  
**Version:** 0.1.51  
**Save schema:** `rt-campaign-v7`  
**Scope:** economy tuning for year-campaign survivability.  
**Status:** implemented on `catindev/year-campaign` and verified with `npm run check`, `npm run debug:rt`, `npm run debug:ab`, `DTP_AB_SEEDS=24 npm run debug:ab`, and `npm run build`.

---

## Problem

The year-campaign acceptance harness showed that the campaign infrastructure worked, but the debt economy did not.

Before this change, a competent bot often died with:

- high trust;
- full or near-full clients;
- clean release history;
- goals completed;
- `debt = 100`.

The diagnosis was that debt had several event-based inflows, but only a weak outflow: any clean release reduced debt by `1`.

That made debt a long-run failure path even for clean play.

## Design Decision

Debt recovery should stay event-based and earned. It should not become passive regeneration.

The implemented loop:

- ordinary clean releases still reduce debt slightly;
- clean `techDebt` releases reduce debt significantly;
- risky `techDebt` releases can reduce debt a little;
- dirty or low-score `techDebt` releases do not become a free escape hatch.

This turns `techDebt` tasks into the intended medicine for high debt. The generator already increases `techDebt`, `bug`, and `performance` task weights when debt is high, so the player now receives an actionable signal instead of a fake cure.

## Implementation

Release debt delta now goes through `releaseDebtDelta()`.

Current constants:

```txt
RELEASE_CLEAN_DEBT_REDUCTION = 1
RELEASE_TECH_DEBT_CLEANUP_VALUE_DIVISOR = 4
RELEASE_TECH_DEBT_CLEANUP_MIN = 4
RELEASE_TECH_DEBT_CLEANUP_MAX = 12
RELEASE_TECH_DEBT_RISKY_CLEANUP_VALUE_DIVISOR = 8
RELEASE_TECH_DEBT_RISKY_CLEANUP_MIN = 2
RELEASE_TECH_DEBT_RISKY_CLEANUP_MAX = 6
```

The value divisor keeps larger tech-debt tasks more meaningful, while min/max caps keep the mechanic tunable.

## Save Compatibility

This changes core economy semantics. In 0.x we do not preserve gameplay saves across incompatible semantic changes, so save schema moved from:

```txt
rt-campaign-v6
```

to:

```txt
rt-campaign-v7
```

## Harness Result

Baseline acceptance target:

- competent survival: at least `50%`;
- reckless survival: at most `20%`;
- competent debt should not end near `100` in most runs.

Observed after this change:

```txt
npm run debug:ab
competent survival: 8/12 = 0.67
reckless survival: 0/12 = 0
competent average debt: 47.33
needsTuning: false

DTP_AB_SEEDS=24 npm run debug:ab
competent survival: 15/24 = 0.63
reckless survival: 0/24 = 0
competent average debt: 48.25
needsTuning: false
```

## Follow-Up Risks

The debt sink is now strong enough for the harness, but it needs manual playtesting.

Watch for:

- techDebt tasks becoming mandatory chores instead of interesting tradeoffs;
- techDebt cleanup being too opaque in the morning report;
- players ignoring non-techDebt work once debt crosses 55;
- `processBoost` plus techDebt cleanup making late campaign too easy.
