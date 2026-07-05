import type { RtTutorialState } from "../engine/types";

export const TUTORIAL_START_STAGE_ID = "team-basics";
export const TUTORIAL_START_STEP_ID = "move-task-to-work";

export function createInitialTutorialState(): RtTutorialState {
  return {
    stageId: TUTORIAL_START_STAGE_ID,
    stepId: TUTORIAL_START_STEP_ID,
    completed: false,
    completedStepIds: [],
    timers: {},
    activeBranchId: null,
    focusTaskId: null,
    focusCharacterId: null,
    steps: [],
  };
}
