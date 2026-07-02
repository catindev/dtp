import { type DragEvent } from "react";
import { t, type Locale } from "../i18n";
import { RT_COLUMNS, type RtColumn, type RtGameState, type RtTask } from "../realtime/simulation";
import { TaskCard } from "./TaskCard";

type ProdView = "released" | "unfinished";

interface BoardPanelProps {
  attentionTaskIds: Set<string>;
  flashTaskId: string | null;
  game: RtGameState;
  locale: Locale;
  onAllowDrop: (event: DragEvent<HTMLElement>) => void;
  onColumnDrop: (event: DragEvent<HTMLElement>, column: RtColumn) => void;
  onProdViewChange: (view: ProdView) => void;
  onTaskClick: (taskId: string) => void;
  onTaskDragEnd: () => void;
  onTaskDragStart: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  onTaskDrop: (event: DragEvent<HTMLElement>, task: RtTask) => void;
  prodView: ProdView;
  rejectColumnIds: Set<RtColumn>;
  rejectTaskIds: Set<string>;
  selectedTaskId: string | null;
}

export function BoardPanel({
  attentionTaskIds,
  flashTaskId,
  game,
  locale,
  onAllowDrop,
  onColumnDrop,
  onProdViewChange,
  onTaskClick,
  onTaskDragEnd,
  onTaskDragStart,
  onTaskDrop,
  prodView,
  rejectColumnIds,
  rejectTaskIds,
  selectedTaskId,
}: BoardPanelProps) {
  const prodTaskIds = prodView === "released" ? game.board.released : archivedUnfinishedTaskIds(game);

  return (
    <section className="board">
      {RT_COLUMNS.map((column) => {
        const taskIds = column === "released" ? prodTaskIds : game.board[column];
        return (
          <div
            className={[
              "column",
              column === "done" ? "done-column" : "",
              column === "released" ? "released-column" : "",
              rejectColumnIds.has(column) ? "reject-shake" : "",
            ].join(" ")}
            key={column}
            onDragOver={onAllowDrop}
            onDrop={(event) => onColumnDrop(event, column)}
          >
            <div className="column-header">
              <h2>{columnLabel(locale, column)}</h2>
              {column === "released" ? (
                <div className="prod-view-switch" aria-label={t(locale, "prodView.label")}>
                  {(["released", "unfinished"] as ProdView[]).map((view) => (
                    <button
                      className={prodView === view ? "active" : ""}
                      key={view}
                      onClick={() => onProdViewChange(view)}
                      type="button"
                    >
                      {t(locale, `prodView.${view}`)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {taskIds.map((taskId) => {
              const task = game.tasks[taskId];
              if (!task) return null;
              return (
                <TaskCard
                  attention={attentionTaskIds.has(task.id)}
                  flash={flashTaskId === task.id}
                  game={game}
                  key={task.id}
                  locale={locale}
                  onClick={() => onTaskClick(task.id)}
                  onDragEnd={onTaskDragEnd}
                  onDragStart={onTaskDragStart}
                  onDropCharacter={onTaskDrop}
                  reject={rejectTaskIds.has(task.id)}
                  selected={selectedTaskId === task.id}
                  task={task}
                />
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

function columnLabel(locale: Locale, column: RtColumn): string {
  return t(locale, `columns.${column}`);
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
