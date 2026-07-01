import { t, type Locale } from "../i18n";
import { type RtGameState, type RtTask } from "../realtime/simulation";
import { LossReport } from "./LossReport";
import { TaskInspector } from "./TaskInspector";

interface SidePanelProps {
  canCancelWork: boolean;
  cancelDisabled: boolean;
  game: RtGameState;
  locale: Locale;
  onCancelWork: () => void;
  onOpenLinkedTask: (taskId: string) => void;
  selectedTask: RtTask | null;
}

export function SidePanel({
  canCancelWork,
  cancelDisabled,
  game,
  locale,
  onCancelWork,
  onOpenLinkedTask,
  selectedTask,
}: SidePanelProps) {
  const assigned = selectedTask?.assignedCharacterId
    ? game.characters[selectedTask.assignedCharacterId]
    : null;

  return (
    <aside className="side-stack">
      <section className="panel inspector">
        <h2>{t(locale, "inspector.title")}</h2>
        {selectedTask ? (
          <TaskInspector
            assigned={assigned}
            canCancelWork={canCancelWork}
            cancelDisabled={cancelDisabled}
            game={game}
            locale={locale}
            onCancelWork={onCancelWork}
            onOpenLinkedTask={onOpenLinkedTask}
            task={selectedTask}
          />
        ) : (
          <p className="empty">{t(locale, "inspector.empty")}</p>
        )}
      </section>

      {game.lossReport ? <LossReport locale={locale} report={game.lossReport} /> : null}
    </aside>
  );
}
