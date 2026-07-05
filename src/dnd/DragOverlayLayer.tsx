import {
  DragOverlay,
  type DropAnimation,
} from "@dnd-kit/core";
import type { Locale } from "../i18n";
import type { RtGameState } from "../realtime/simulation";
import { CharacterCardContent, OutsourceCardContent } from "../components/cards/TeamCardContent";
import { TaskCard } from "../components/TaskCard";
import type { CharacterDropAnimation } from "../hooks/useGameDragAndDrop";

interface DragOverlayLayerProps {
  activeCharacterDragId: string | null;
  activeOutsourceDrag: boolean;
  activeTaskDragId: string | null;
  characterDropAnimation: CharacterDropAnimation | null;
  game: RtGameState;
  locale: Locale;
  selectedTaskId: string | null;
}

export function DragOverlayLayer({
  activeCharacterDragId,
  activeOutsourceDrag,
  activeTaskDragId,
  characterDropAnimation,
  game,
  locale,
  selectedTaskId,
}: DragOverlayLayerProps) {
  const activeTask = activeTaskDragId ? game.tasks[activeTaskDragId] : null;
  const activeCharacter = activeCharacterDragId ? game.characters[activeCharacterDragId] : null;
  const activeCharacterTask = activeCharacter?.assignedTaskId
    ? game.tasks[activeCharacter.assignedTaskId]
    : null;
  const dropAnimation = characterDropAnimation
    ? characterAbsorbDropAnimation(characterDropAnimation.targetRect)
    : dndDropAnimation;

  return (
    <DragOverlay dropAnimation={dropAnimation}>
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
        <div
          className={[
            "team-dnd-overlay-card",
            characterDropAnimation ? "character-absorb-overlay" : "",
          ].join(" ")}
        >
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

function characterAbsorbDropAnimation(
  targetRect: CharacterDropAnimation["targetRect"],
): DropAnimation {
  return {
    duration: 320,
    easing: "cubic-bezier(0.16, 0.9, 0.22, 1)",
    keyframes: ({ dragOverlay, transform }) => {
      const targetLeft = targetRect.left + targetRect.width / 2 - dragOverlay.rect.width / 2;
      const targetTop = targetRect.top + targetRect.height / 2 - dragOverlay.rect.height / 2;
      const finalTransform = {
        x: transform.initial.x - (dragOverlay.rect.left - targetLeft),
        y: transform.initial.y - (dragOverlay.rect.top - targetTop),
        scaleX: 0.18,
        scaleY: 0.18,
      };
      const midTransform = {
        ...finalTransform,
        scaleX: 0.52,
        scaleY: 0.52,
      };

      return [
        {
          filter: "blur(0px)",
          opacity: 1,
          transform: transformToCss(transform.initial),
        },
        {
          filter: "blur(0.2px)",
          offset: 0.68,
          opacity: 0.78,
          transform: transformToCss(midTransform),
        },
        {
          filter: "blur(2px)",
          opacity: 0,
          transform: transformToCss(finalTransform),
        },
      ];
    },
    sideEffects: ({ active }) => {
      const previousOpacity = active.node.style.opacity;
      active.node.style.opacity = "0";
      return () => {
        active.node.style.opacity = previousOpacity;
      };
    },
  };
}

function transformToCss(transform: {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}): string {
  return `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`;
}
