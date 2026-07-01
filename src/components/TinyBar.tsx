export type TinyBarTone =
  | "queue"
  | "deadline"
  | "deadline-safe"
  | "deadline-warning"
  | "deadline-urgent"
  | "progress";

interface TinyBarProps {
  label: string;
  ratio: number;
  tone: TinyBarTone;
}

export function TinyBar({ label, ratio, tone }: TinyBarProps) {
  const percent = Math.max(0, Math.min(100, ratio * 100));
  return (
    <div className={`tiny-bar ${tone}`}>
      <span>{label}</span>
      <div className="tiny-track">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
