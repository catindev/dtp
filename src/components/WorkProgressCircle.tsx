import type { CSSProperties } from "react";

interface WorkProgressCircleProps {
  label: string;
  value: number;
}

export function WorkProgressCircle({ label, value }: WorkProgressCircleProps) {
  const safeValue = Math.max(0, Math.min(100, value));
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safeValue / 100);
  return (
    <span
      aria-label={`${label}: ${Math.round(safeValue)}%`}
      className="work-progress-circle"
      title={`${label}: ${Math.round(safeValue)}%`}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 18 18">
        <circle className="work-progress-circle-track" cx="9" cy="9" r={radius} />
        <circle
          className="work-progress-circle-progress"
          cx="9"
          cy="9"
          r={radius}
          style={
            {
              strokeDasharray: circumference,
              strokeDashoffset: offset,
            } as CSSProperties
          }
        />
      </svg>
    </span>
  );
}
