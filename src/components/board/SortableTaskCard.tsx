import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import type { Locale } from "../../i18n";
import type { RtGameState, RtTask } from "../../realtime/simulation";
import { taskDndId } from "../../dnd/ids";
import { TASK_DND_TYPE } from "../../dnd/types";
import { TaskCard } from "../TaskCard";

interface SortableTaskCardProps {
  activeTaskDragId: string | null;
  attention: boolean;
  entering?: boolean;
  flash: boolean;
  game: RtGameState;
  locale: Locale;
  onClick: () => void;
  reject: boolean;
  selected: boolean;
  task: RtTask;
  tutorialFocus?: boolean;
}

export function SortableTaskCard({
  activeTaskDragId,
  attention,
  entering = false,
  flash,
  game,
  locale,
  onClick,
  reject,
  selected,
  task,
  tutorialFocus = false,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: taskDndId(task.id),
    data: {
      type: TASK_DND_TYPE,
      taskId: task.id,
    },
    disabled: {
      draggable: taskDragHardBlocked(game, task),
      droppable: false,
    },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TaskCard
      attention={attention}
      dropTargetActive={isOver}
      dragHandleProps={{ ...attributes, ...listeners }}
      dragging={isDragging || activeTaskDragId === task.id}
      entering={entering}
      flash={flash}
      game={game}
      locale={locale}
      onClick={onClick}
      ref={setNodeRef}
      reject={reject}
      selected={selected}
      style={style}
      task={task}
      tutorialFocus={tutorialFocus}
    />
  );
}

function taskDragHardBlocked(game: RtGameState, task: RtTask): boolean {
  return (
    Boolean(task.assignedCharacterId) ||
    Boolean(task.outsourcing) ||
    game.status !== "running" ||
    task.resolved ||
    task.released
  );
}
