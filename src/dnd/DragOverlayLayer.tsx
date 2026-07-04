import { DragOverlay } from "@dnd-kit/core";
import type { Locale } from "../i18n";
import type { RtGameState } from "../realtime/simulation";
import { CharacterCardContent, OutsourceCardContent } from "../components/cards/TeamCardContent";
import { TaskCard } from "../components/TaskCard";

interface DragOverlayLayerProps {
  activeCharacterDragId: string | null;
  activeOutsourceDrag: boolean;
  activeTaskDragId: string | null;
  game: RtGameState;
  locale: Locale;
  selectedTaskId: string | null;
}

export function DragOverlayLayer({
  activeCharacterDragId,
  activeOutsourceDrag,
  activeTaskDragId,
  game,
  locale,
  selectedTaskId,
}: DragOverlayLayerProps) {
  const activeTask = activeTaskDragId ? game.tasks[activeTaskDragId] : null;
  const activeCharacter = activeCharacterDragId ? game.characters[activeCharacterDragId] : null;
  const activeCharacterTask = activeCharacter?.assignedTaskId
    ? game.tasks[activeCharacter.assignedTaskId]
    : null;

  return (
    <DragOverlay dropAnimation={dndDropAnimation}>
      {activeTask ? (
        <div className="task-dnd-overlay-card">
          <TaskCard
            attention={false}
            flash={false}
            game={game}
            locale={locale}
            onClick={() => undefined}
            reject={false}
            selected={selectedTaskId === activeTask.id}
            task={activeTask}
          />
        </div>
      ) : activeCharacter ? (
        <div className="team-dnd-overlay-card">
          <article className="character">
            <CharacterCardContent
              assignedTask={activeCharacterTask}
              character={activeCharacter}
              locale={locale}
            />
          </article>
        </div>
      ) : activeOutsourceDrag ? (
        <div className="team-dnd-overlay-card">
          <article className="outsourcing-card">
            <OutsourceCardContent game={game} locale={locale} />
          </article>
        </div>
      ) : null}
    </DragOverlay>
  );
}

const dndDropAnimation = {
  duration: 240,
  easing: "cubic-bezier(0.16, 0.9, 0.22, 1)",
};
