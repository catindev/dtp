import { useDraggable } from "@dnd-kit/core";
import {
  type RtCharacter,
  type RtGameState,
  type RtTask,
} from "../realtime/simulation";
import { t, type Locale } from "../i18n";
import {
  characterDndId,
  outsourceDndId,
} from "../dnd/ids";
import {
  CHARACTER_DND_TYPE,
  OUTSOURCE_DND_TYPE,
} from "../dnd/types";
import { CharacterCardContent, OutsourceCardContent } from "./cards/TeamCardContent";

interface TeamPanelProps {
  game: RtGameState;
  interactionBlocked: boolean;
  isGameScreen: boolean;
  locale: Locale;
  morningReportActive: boolean;
  onCharacterSelect: (characterId: string) => void;
  activeCharacterDragId: string | null;
  activeOutsourceDrag: boolean;
  selectedCharacterId: string | null;
  tutorialFocusCharacterId: string | null;
}

export function TeamPanel({
  game,
  interactionBlocked,
  isGameScreen,
  locale,
  morningReportActive,
  activeCharacterDragId,
  onCharacterSelect,
  activeOutsourceDrag,
  selectedCharacterId,
  tutorialFocusCharacterId,
}: TeamPanelProps) {
  return (
    <aside className="team-panel panel">
      <h2>{t(locale, "team.title")}</h2>
      <div className="team-scroll">
        {Object.values(game.characters).map((character) => {
          const assignedTask = character.assignedTaskId
            ? game.tasks[character.assignedTaskId]
            : null;
          return (
            <DraggableCharacterCard
              assignedTask={assignedTask}
              character={character}
              dragging={activeCharacterDragId === character.id}
              game={game}
              isGameScreen={isGameScreen}
              key={character.id}
              locale={locale}
              morningReportActive={morningReportActive}
              onClick={() => onCharacterSelect(character.id)}
              selected={selectedCharacterId === character.id}
              tutorialFocus={tutorialFocusCharacterId === character.id}
            />
          );
        })}
        <DraggableOutsourceCard
          disabled={interactionBlocked || game.resources.budget <= 0}
          dragging={activeOutsourceDrag}
          game={game}
          isGameScreen={isGameScreen}
          locale={locale}
          morningReportActive={morningReportActive}
        />
      </div>
    </aside>
  );
}

interface DraggableCharacterCardProps {
  assignedTask: RtTask | null;
  character: RtCharacter;
  dragging: boolean;
  game: RtGameState;
  isGameScreen: boolean;
  locale: Locale;
  morningReportActive: boolean;
  onClick: () => void;
  selected: boolean;
  tutorialFocus: boolean;
}

function DraggableCharacterCard({
  assignedTask,
  character,
  dragging,
  game,
  isGameScreen,
  locale,
  morningReportActive,
  onClick,
  selected,
  tutorialFocus,
}: DraggableCharacterCardProps) {
  const dragDisabled =
    !isGameScreen ||
    game.status !== "running" ||
    morningReportActive ||
    Boolean(character.assignedTaskId) ||
    character.exhaustedToday;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: characterDndId(character.id),
    data: {
      type: CHARACTER_DND_TYPE,
      characterId: character.id,
    },
    disabled: dragDisabled,
  });

  return (
    <article
      className={[
        "character",
        character.assignedTaskId ? "busy" : "",
        character.exhaustedToday ? "exhausted" : "",
        selected ? "selected" : "",
        dragging ? "team-drag-placeholder" : "",
        tutorialFocus && !dragging ? "tutorial-focus" : "",
      ].join(" ")}
      onClick={onClick}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
    >
      <CharacterCardContent
        assignedTask={assignedTask}
        character={character}
        locale={locale}
      />
    </article>
  );
}

interface DraggableOutsourceCardProps {
  disabled: boolean;
  dragging: boolean;
  game: RtGameState;
  isGameScreen: boolean;
  locale: Locale;
  morningReportActive: boolean;
}

function DraggableOutsourceCard({
  disabled,
  dragging,
  game,
  isGameScreen,
  locale,
  morningReportActive,
}: DraggableOutsourceCardProps) {
  const dragDisabled =
    !isGameScreen ||
    game.status !== "running" ||
    morningReportActive ||
    game.resources.budget <= 0;
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: outsourceDndId(),
    data: {
      type: OUTSOURCE_DND_TYPE,
    },
    disabled: dragDisabled,
  });

  return (
    <article
      className={[
        "outsourcing-card",
        disabled ? "disabled" : "",
        dragging ? "team-drag-placeholder" : "",
      ].join(" ")}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
    >
      <OutsourceCardContent game={game} locale={locale} />
    </article>
  );
}
