import { useId } from "react";
import { AlertTriangle } from "lucide-react";
import { formatQuantity } from "../../utils/formatters";
import { fuelColor, LOW_LEVEL_PERCENT, tankLevel } from "./tankColors";

// A vertical tank with a fill level. The figures are always shown as text too.
export function TankGraphic({ tank, width = 56 }) {
  const clipId = useId();
  const { percent, fraction } = tankLevel(tank);
  const color = fuelColor(tank.itemType);
  const top = 4;
  const height = 112;
  return (
    <svg
      viewBox="0 0 56 120"
      width={width}
      height={(width * 120) / 56}
      role="img"
      aria-label={`${tank.name}: ${Math.round(percent)}% full, ${formatQuantity(tank.bookStock)} L of ${formatQuantity(tank.capacityLitres)} L`}
      className="shrink-0"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="4" y={top} width="48" height={height} rx="10" />
        </clipPath>
      </defs>
      <rect
        x="4"
        y={top}
        width="48"
        height={height}
        rx="10"
        className="fill-white stroke-slate-300"
        strokeWidth="2"
      />
      <g clipPath={`url(#${clipId})`}>
        <rect
          x="4"
          y={top}
          width="48"
          height={height}
          className={`${color.fill} origin-bottom [transform-box:fill-box] transition-transform duration-500 motion-reduce:transition-none`}
          style={{ transform: `scaleY(${fraction})` }}
        />
      </g>
      <line
        x1="4"
        x2="52"
        y1={top + height * (1 - LOW_LEVEL_PERCENT / 100)}
        y2={top + height * (1 - LOW_LEVEL_PERCENT / 100)}
        className="stroke-slate-500"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

export function FuelLabel({ itemType }) {
  const color = fuelColor(itemType);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
      {itemType}
    </span>
  );
}

export function LevelBadge({ tank }) {
  const { status } = tankLevel(tank);
  if (!status) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
      <AlertTriangle size={12} aria-hidden="true" />
      {status}
    </span>
  );
}
