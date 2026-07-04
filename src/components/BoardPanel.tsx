import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import { type Locale } from "../i18n";
import { RT_COLUMNS, type RtColumn, type RtGameState } from "../realtime/simulation";
import { DragOverlayLayer } from "../dnd/DragOverlayLayer";
import { TaskCard } from "./TaskCard";
import { TaskColumn } from "./board/TaskColumn";
import { SortableTaskCard } from "./board/SortableTaskCard";
import type { ProdView } from "./board/types";
import type { CharacterDropAnimation } from "../hooks/useGameDragAndDrop";

interface BacklogExitGhost {
  index: number;
  taskId: string;
}

interface BoardPanelProps {
  activeCharacterDragId: string | null;
  activeOutsourceDrag: boolean;
  activeTaskDragId: string | null;
  attentionTaskIds: Set<string>;
  characterDropAnimation: CharacterDropAnimation | null;
  flashTaskId: string | null;
  game: RtGameState;
  locale: Locale;
  onProdViewChange: (view: ProdView) => void;
  onTaskClick: (taskId: string) => void;
  prodView: ProdView;
  rejectColumnIds: Set<RtColumn>;
  rejectTaskIds: Set<string>;
  selectedTaskId: string | null;
}

export function BoardPanel({
  activeCharacterDragId,
  activeOutsourceDrag,
  activeTaskDragId,
  attentionTaskIds,
  characterDropAnimation,
  flashTaskId,
  game,
  locale,
  onProdViewChange,
  onTaskClick,
  prodView,
  rejectColumnIds,
  rejectTaskIds,
  selectedTaskId,
}: BoardPanelProps) {
  const prodTaskIds = prodView === "released" ? game.board.released : archivedUnfinishedTaskIds(game);
  const {
    backlogEnteringTaskIds,
    backlogExitGhosts,
  } = useBacklogCardLifecycle(game);

  return (
    <>
      <section className="board">
        {RT_COLUMNS.map((column) => {
          const taskIds = column === "released" ? prodTaskIds : game.board[column];
          return (
            <TaskColumn
              column={column}
              key={column}
              locale={locale}
              onProdViewChange={onProdViewChange}
              prodView={prodView}
              reject={rejectColumnIds.has(column)}
              taskIds={taskIds}
            >
              {column === "backlog"
                ? renderBacklogTaskCards({
                    activeTaskDragId,
                    attentionTaskIds,
                    backlogEnteringTaskIds,
                    backlogExitGhosts,
                    flashTaskId,
                    game,
                    locale,
                    onTaskClick,
                    rejectTaskIds,
                    selectedTaskId,
                    taskIds,
                  })
                : taskIds.map((taskId) => {
                    const task = game.tasks[taskId];
                    if (!task) return null;
                    return (
                      <SortableTaskCard
                        activeTaskDragId={activeTaskDragId}
                        attention={attentionTaskIds.has(task.id)}
                        flash={flashTaskId === task.id}
                        game={game}
                        key={task.id}
                        locale={locale}
                        onClick={() => onTaskClick(task.id)}
                        reject={rejectTaskIds.has(task.id)}
                        selected={selectedTaskId === task.id}
                        task={task}
                      />
                    );
                  })}
            </TaskColumn>
          );
        })}
      </section>
      <DragOverlayLayer
        activeCharacterDragId={activeCharacterDragId}
        activeOutsourceDrag={activeOutsourceDrag}
        activeTaskDragId={activeTaskDragId}
        characterDropAnimation={characterDropAnimation}
        game={game}
        locale={locale}
        selectedTaskId={selectedTaskId}
      />
    </>
  );
}

interface RenderBacklogTaskCardsArgs {
  activeTaskDragId: string | null;
  attentionTaskIds: Set<string>;
  backlogEnteringTaskIds: Set<string>;
  backlogExitGhosts: BacklogExitGhost[];
  flashTaskId: string | null;
  game: RtGameState;
  locale: Locale;
  onTaskClick: (taskId: string) => void;
  rejectTaskIds: Set<string>;
  selectedTaskId: string | null;
  taskIds: string[];
}

function renderBacklogTaskCards({
  activeTaskDragId,
  attentionTaskIds,
  backlogEnteringTaskIds,
  backlogExitGhosts,
  flashTaskId,
  game,
  locale,
  onTaskClick,
  rejectTaskIds,
  selectedTaskId,
  taskIds,
}: RenderBacklogTaskCardsArgs): ReactNode[] {
  const entries: Array<
    | { kind: "task"; taskId: string }
    | { kind: "ghost"; ghost: BacklogExitGhost }
  > = taskIds.map((taskId) => ({ kind: "task", taskId }));

  for (const ghost of backlogExitGhosts.slice().sort((left, right) => left.index - right.index)) {
    const insertAt = Math.min(Math.max(ghost.index, 0), entries.length);
    entries.splice(insertAt, 0, { kind: "ghost", ghost });
  }

  return entries.map((entry) => {
    const taskId = entry.kind === "task" ? entry.taskId : entry.ghost.taskId;
    const task = game.tasks[taskId];
    if (!task) return null;

    if (entry.kind === "ghost") {
      return (
        <TaskCard
          attention={false}
          entering={false}
          exiting
          flash={false}
          game={game}
          key={`backlog-exit-${taskId}`}
          locale={locale}
          onClick={() => undefined}
          reject={false}
          selected={false}
          task={task}
        />
      );
    }

    return (
      <SortableTaskCard
        activeTaskDragId={activeTaskDragId}
        attention={attentionTaskIds.has(task.id)}
        entering={backlogEnteringTaskIds.has(task.id)}
        flash={flashTaskId === task.id}
        game={game}
        key={task.id}
        locale={locale}
        onClick={() => onTaskClick(task.id)}
        reject={rejectTaskIds.has(task.id)}
        selected={selectedTaskId === task.id}
        task={task}
      />
    );
  });
}

function useBacklogCardLifecycle(game: RtGameState): {
  backlogEnteringTaskIds: Set<string>;
  backlogExitGhosts: BacklogExitGhost[];
} {
  const [backlogEnteringTaskIds, setBacklogEnteringTaskIds] = useState<Set<string>>(() => new Set());
  const [backlogExitGhosts, setBacklogExitGhosts] = useState<BacklogExitGhost[]>([]);
  const previousBacklogIdsRef = useRef<string[] | null>(null);
  const enterTimersRef = useRef<Record<string, number>>({});
  const exitTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      Object.values(enterTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      Object.values(exitTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    const currentBacklogIds = game.board.backlog;
    const previousBacklogIds = previousBacklogIdsRef.current;
    if (!previousBacklogIds) {
      previousBacklogIdsRef.current = [...currentBacklogIds];
      return;
    }

    const previousSet = new Set(previousBacklogIds);
    const currentSet = new Set(currentBacklogIds);

    for (const taskId of currentBacklogIds) {
      if (!previousSet.has(taskId)) {
        animateBacklogEntry(taskId, setBacklogEnteringTaskIds, enterTimersRef);
      }
    }

    previousBacklogIds.forEach((taskId, index) => {
      if (currentSet.has(taskId)) return;
      const task = game.tasks[taskId];
      if (task?.resolution !== "backlog_opportunity_expired") return;
      animateBacklogExit({ taskId, index }, setBacklogExitGhosts, exitTimersRef);
    });

    previousBacklogIdsRef.current = [...currentBacklogIds];
  });

  return {
    backlogEnteringTaskIds,
    backlogExitGhosts,
  };
}

function animateBacklogEntry(
  taskId: string,
  setBacklogEnteringTaskIds: Dispatch<SetStateAction<Set<string>>>,
  enterTimersRef: MutableRefObject<Record<string, number>>,
): void {
  setBacklogEnteringTaskIds((current) => new Set(current).add(taskId));
  if (enterTimersRef.current[taskId]) window.clearTimeout(enterTimersRef.current[taskId]);
  enterTimersRef.current[taskId] = window.setTimeout(() => {
    setBacklogEnteringTaskIds((current) => {
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
    delete enterTimersRef.current[taskId];
  }, 920);
}

function animateBacklogExit(
  ghost: BacklogExitGhost,
  setBacklogExitGhosts: Dispatch<SetStateAction<BacklogExitGhost[]>>,
  exitTimersRef: MutableRefObject<Record<string, number>>,
): void {
  setBacklogExitGhosts((current) => [
    ...current.filter((candidate) => candidate.taskId !== ghost.taskId),
    ghost,
  ]);
  if (exitTimersRef.current[ghost.taskId]) window.clearTimeout(exitTimersRef.current[ghost.taskId]);
  exitTimersRef.current[ghost.taskId] = window.setTimeout(() => {
    setBacklogExitGhosts((current) => current.filter((candidate) => candidate.taskId !== ghost.taskId));
    delete exitTimersRef.current[ghost.taskId];
  }, 680);
}

function archivedUnfinishedTaskIds(game: RtGameState): string[] {
  return Object.values(game.tasks)
    .filter((task) => task.resolved && !task.released && task.resolution !== "backlog_opportunity_expired")
    .sort((left, right) => {
      const dayDelta = (right.resolutionDay ?? 0) - (left.resolutionDay ?? 0);
      if (dayDelta !== 0) return dayDelta;
      return taskIdSequence(right.id) - taskIdSequence(left.id);
    })
    .map((task) => task.id);
}

function taskIdSequence(taskId: string): number {
  return Number(taskId.match(/\d+$/)?.[0] ?? 0);
}
