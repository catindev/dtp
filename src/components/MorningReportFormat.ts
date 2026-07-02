import type {
  RtEvent,
  RtMorningReport,
  RtReadinessReport,
  RtTask,
} from "../realtime/simulation";
import {
  labelConsequenceCause,
  localizeEffect,
  type Locale,
} from "../i18n";

export function effectTone(effect: string): "positive" | "negative" | "neutral" {
  if (effect.startsWith("debt +")) return "negative";
  if (effect.startsWith("debt -")) return "positive";
  if (effect.startsWith("dirty release")) return "negative";
  if (effect.startsWith("clean release")) return "positive";
  if (/\s-[0-9]/.test(effect) || effect.startsWith("no ")) return "negative";
  if (/\s\+[0-9]/.test(effect) || effect.includes("reduced")) return "positive";
  return "neutral";
}

export function releaseEffectsForTask(
  task: RtTask,
  releaseEvent: RtEvent | undefined,
  readiness: RtReadinessReport,
): string[] {
  const eventEffects = releaseEvent?.effects ?? [task.lastNote];
  const effectsWithoutOutcome = eventEffects.filter((effect) => !isReleaseOutcomeEffect(effect));
  return [`${readiness.readiness} release`, ...effectsWithoutOutcome];
}

export function formatSignedNumber(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function consequenceText(
  consequence: RtMorningReport["consequences"][number],
  locale: Locale,
): string {
  if (locale === "ru") {
    if (consequence.source === "release") {
      return `Потому что вчерашняя ${consequence.sourceTaskId} уехала с проблемой: ${consequenceCauseLabel(
        consequence.cause,
        locale,
      )}.`;
    }
    if (consequence.source === "missed_backlog") {
      return `Потому что ${consequence.sourceTaskId} осталась в бэклоге после дедлайна.`;
    }
    if (consequence.source === "missed_in_progress") {
      return `Потому что ${consequence.sourceTaskId} была в работе, когда день закончился.`;
    }
    return `Потому что цепочка последствий от ${consequence.rootCauseTaskId} дошла до лимита.`;
  }
  if (consequence.source === "release") {
    return `Because yesterday's ${consequence.sourceTaskId} shipped with ${consequenceCauseLabel(
      consequence.cause,
      locale,
    )}.`;
  }
  if (consequence.source === "missed_backlog") {
    return `Because ${consequence.sourceTaskId} was left in Backlog past its deadline.`;
  }
  if (consequence.source === "missed_in_progress") {
    return `Because ${consequence.sourceTaskId} was still in progress when the day closed.`;
  }
  return `Because the fallout chain from ${consequence.rootCauseTaskId} reached its cap.`;
}

export function consequenceFallbackLabel(
  consequence: RtMorningReport["consequences"][number],
  locale: Locale,
): string {
  if (consequence.effects.includes("minor hit")) return localizeEffect("hit", locale);
  return localizeEffect("blocked", locale);
}

function isReleaseOutcomeEffect(effect: string): boolean {
  return /^(clean|risky|dirty) release$/.test(effect);
}

function consequenceCauseLabel(
  cause: RtMorningReport["consequences"][number]["cause"],
  locale: Locale,
): string {
  return labelConsequenceCause(locale, cause);
}
