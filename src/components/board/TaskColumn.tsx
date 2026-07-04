import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { t, type Locale } from "../../i18n";
import type { RtColumn } from "../../realtime/simulation";
import { columnDndId, taskDndId } from "../../dnd/ids";
import { COLUMN_DND_TYPE } from "../../dnd/types";
import type { ProdView } from "./types";

interface TaskColumnProps {
  children: ReactNode;
  column: RtColumn;
  locale: Locale;
  onProdViewChange: (view: ProdView) => void;
  prodView: ProdView;
  reject: boolean;
  taskIds: string[];
}

export function TaskColumn({
  children,
  column,
  locale,
  onProdViewChange,
  prodView,
  reject,
  taskIds,
}: TaskColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: columnDndId(column),
    data: {
      type: COLUMN_DND_TYPE,
      column,
    },
  });

  return (
    <div
      className={[
        "column",
        column === "done" ? "done-column" : "",
        column === "released" ? "released-column" : "",
        isOver ? "dnd-drop-target" : "",
        reject ? "reject-shake" : "",
      ].join(" ")}
      data-column={column}
      ref={setNodeRef}
    >
      <div className="column-header">
        <h2>{t(locale, `columns.${column}`)}</h2>
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
      <SortableContext items={taskIds.map(taskDndId)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}
