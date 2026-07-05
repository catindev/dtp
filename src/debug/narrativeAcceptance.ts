import {
  TASK_NARRATIVE_ARCHETYPES,
  renderTaskNarrative,
} from "../engine/narrative";
import type {
  RtTask,
  RtTaskDomain,
} from "../engine/types";

const SAMPLE_DOMAIN: RtTaskDomain = "auth";

const fixture = Object.values(TASK_NARRATIVE_ARCHETYPES)
  .filter((archetype) => archetype.id.startsWith("core."))
  .map((archetype, index) => {
    const task = {
      id: `FIX-${String(index + 1).padStart(3, "0")}`,
      kind: archetype.kind,
      domain: SAMPLE_DOMAIN,
      narrativeRef: {
        archetypeId: archetype.id,
        variantSeed: 1,
        branchId: "default",
        variableValueIds: {
          area: SAMPLE_DOMAIN,
        },
        tags: archetype.tags,
        tone: "neutral",
        density: "core",
      },
      comments: [],
      lastCommentId: null,
    } as unknown as RtTask;
    const en = renderTaskNarrative(task, "en");
    const ru = renderTaskNarrative(task, "ru");
    assert(archetype.meaning.length >= 3, `${archetype.id} missing meaning checklist.`);
    assert(en.core.headline.length > 0, `${archetype.id} missing EN headline.`);
    assert(ru.core.headline.length > 0, `${archetype.id} missing RU headline.`);
    return {
      archetypeId: archetype.id,
      kind: archetype.kind,
      tags: archetype.tags,
      expectedMeaning: archetype.meaning,
      samples: {
        en: en.core,
        ru: ru.core,
      },
    };
  });

const output = {
  schema: "dtp-task-narrative-acceptance-v1",
  generatedAt: new Date().toISOString(),
  protocol: {
    unit: "card_reader_pair",
    instruction:
      "Show one rendered card narrative to one reader. The reader retells what the task asks, why it matters, and what can go wrong.",
    grading:
      "Compare the retelling with expectedMeaning written before the test. Pass rate is a decision trigger, not an automatic verdict.",
    targetPassRate: 0.9,
    perCardFloor: "Investigate any archetype with repeated misses even when the global pass rate is green.",
  },
  archetypes: fixture,
};

console.log(JSON.stringify(output, null, 2));

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
