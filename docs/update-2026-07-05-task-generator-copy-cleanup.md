# Task generator copy cleanup

Date: 2026-07-05

## Context

Live RU playtests exposed generated task copy that read like translated English:

- `партнерские выплаты закрывал`;
- `новый ежедневный сценарий для логина`;
- `Уменьшить хрупкость в зоне: уведомления клиентов`;
- raw English fragments inside RU task/subtask labels such as `auth flow`, `happy path`, `production path`.

This pass treats task copy as part of the generator contract, not as a one-off UI typo.

## Changes

### Narrative archetypes

`src/engine/narrative/taskNarrativeCatalog.ts` now has more domain-specific text for feature and saved-view tasks:

- `featureWorkflowHeadline` / `featureWorkflowProblem` stay domain-specific;
- `savedViewHeadline` / `savedViewProblem` were added so saved-view tasks do not render as `сценарий для логина`;
- `areaDat` was added for phrases such as `данные по логину` / `данные по партнерским выплатам`.

Several templates were rewritten to avoid grammar traps:

- English avoids subject templates like `The {area} is...`, which broke for plural domains such as `search results`;
- Russian avoids raw `production`, `performance`, `compliance`, `fix`, and translationese wrappers;
- fallout and incident copy now uses player-facing terms such as `последствие`, `прод`, `исправление`, and `рабочий путь`.

### Legacy task title and subtask bank

`src/engine/content.ts` was cleaned because it still feeds visible fallback task titles and generated subtask labels:

- RU task titles no longer contain raw `auth flow`, `admin API`, `webhook receiver`, `audit log`, `retention policy`;
- RU subtask labels no longer contain `happy path`, `edge cases`, `rollout`, `fix`, `alert`, `production path`, `failure modes`, `policy enforcement`;
- EN labels were lightly edited for clearer player-facing wording.

## Guardrails

`src/debug/realtime.ts` now runs `task-generator-copy` smoke:

- rendered narrative copy is checked for unresolved placeholders and banned player-facing slang;
- RU task titles and RU subtask labels are checked against a generator-copy banlist.

The banlist is intentionally specific. It does not ban valid game acronyms such as QA, SRE, API, CRM, CSV, or DB.

`src/debug/narrativeAcceptance.ts` now fills every domain variable in the acceptance fixture and fails if any rendered sample still contains a `{placeholder}`. This keeps the human review artifact useful for content review instead of showing raw templates.

## Verification

Validated with:

- `npm run check`;
- `npm run debug:rt`;
- `npm run debug:narrative`;
- generated narrative matrix across all core archetypes and domains in both locales.

No save schema bump is required: this is content-only and does not change run state semantics.
