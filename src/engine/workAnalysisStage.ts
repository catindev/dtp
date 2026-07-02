import {
  WORK_ANALYSIS_CLARITY_GAIN_BASE,
  WORK_ANALYSIS_CLARITY_GAIN_PER_SKILL,
  WORK_ANALYSIS_CLARITY_GAIN_RANDOM_MAX,
  WORK_ANALYSIS_QUALITY_GAIN_RATIO,
  WORK_ANALYSIS_REVEAL_HIGH_COUNT,
  WORK_ANALYSIS_REVEAL_HIGH_GAIN,
  WORK_ANALYSIS_REVEAL_LOW_COUNT,
  WORK_ANALYSIS_REVEAL_MEDIUM_COUNT,
  WORK_ANALYSIS_REVEAL_MEDIUM_GAIN,
} from "./balance";
import { characterEventData } from "./eventData";
import { clamp } from "./math";
import {
  randomInt,
  shuffle,
} from "./rng";
import type {
  RtCharacter,
  RtGameState,
  RtSubtask,
  RtTask,
} from "./types";
import { importanceWeight } from "./workRules";
import type { WorkStageEventSink } from "./workStageTypes";

export function completeAnalysisStage(
  state: RtGameState,
  task: RtTask,
  character: RtCharacter,
  emit: WorkStageEventSink,
): void {
  const gain =
    WORK_ANALYSIS_CLARITY_GAIN_BASE +
    character.skill.analysis * WORK_ANALYSIS_CLARITY_GAIN_PER_SKILL +
    randomInt(state, 0, WORK_ANALYSIS_CLARITY_GAIN_RANDOM_MAX);
  const revealed = revealSubtasksByAnalysis(state, task, gain);
  task.clarity = clamp(task.clarity + gain, 0, 100);
  task.quality = clamp(task.quality + Math.round(gain * WORK_ANALYSIS_QUALITY_GAIN_RATIO), 0, 100);
  task.currentSubtaskId = null;
  task.stageComplete = true;
  task.lastNote =
    revealed.length > 0
      ? `Analysis complete. Revealed ${revealed.length} subtask(s).`
      : "Analysis complete. No new subtasks found.";
  emit({
    type: "analysis_done",
    title: `${task.id} clarified`,
    body: `${character.name} improved task clarity.`,
    data: characterEventData(character, {
      taskId: task.id,
      clarityGain: gain,
      revealedCount: revealed.length,
    }),
    effects: [`clarity +${gain}`, ...revealed.map((subtask) => `revealed ${subtask.role}`)],
  });
}

function revealSubtasksByAnalysis(
  state: RtGameState,
  task: RtTask,
  clarityGain: number,
): RtSubtask[] {
  const hidden = task.subtasks.filter((subtask) => !subtask.revealed);
  const revealCount = Math.min(
    hidden.length,
    clarityGain >= WORK_ANALYSIS_REVEAL_HIGH_GAIN
      ? WORK_ANALYSIS_REVEAL_HIGH_COUNT
      : clarityGain >= WORK_ANALYSIS_REVEAL_MEDIUM_GAIN
        ? WORK_ANALYSIS_REVEAL_MEDIUM_COUNT
        : WORK_ANALYSIS_REVEAL_LOW_COUNT,
  );
  const revealed = shuffle(state, hidden)
    .sort((a, b) => importanceWeight(b.importance) - importanceWeight(a.importance))
    .slice(0, revealCount);
  for (const subtask of revealed) {
    subtask.revealed = true;
  }
  return revealed;
}
