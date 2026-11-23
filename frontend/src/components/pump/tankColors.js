import { formatQuantity } from "../../utils/formatters";

// Tank colors identify the fuel type. They are categorical, so they avoid the
// red, amber and green used for status. The fuel name is always written next to
// the color, so color is never the only signal.
const COLORS = {
  sky: { fill: "fill-sky-500", dot: "bg-sky-500" },
  violet: { fill: "fill-violet-500", dot: "bg-violet-500" },
  teal: { fill: "fill-teal-500", dot: "bg-teal-500" },
  indigo: { fill: "fill-indigo-500", dot: "bg-indigo-500" },
  fuchsia: { fill: "fill-fuchsia-500", dot: "bg-fuchsia-500" },
  cyan: { fill: "fill-cyan-500", dot: "bg-cyan-500" },
  slate: { fill: "fill-slate-500", dot: "bg-slate-500" },
};
const OTHER = ["indigo", "fuchsia", "cyan", "slate"];

export function fuelColor(itemType = "") {
  const name = String(itemType).toLowerCase();
  if (name.includes("petrol")) return COLORS.sky;
  if (name.includes("diesel")) return COLORS.violet;
  if (name.includes("cng")) return COLORS.teal;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return COLORS[OTHER[hash % OTHER.length]];
}

export const LOW_LEVEL_PERCENT = 20;

export function tankLevel(tank) {
  const capacity = Number(tank.capacityLitres) || 0;
  const stock = Number(tank.bookStock) || 0;
  const percent = capacity > 0 ? (stock / capacity) * 100 : 0;
  let status = null;
  if (stock <= 0) status = "Empty";
  else if (stock > capacity) status = "Over capacity";
  else if (percent <= LOW_LEVEL_PERCENT) status = "Low";
  return { percent, fraction: Math.min(1, Math.max(0, percent / 100)), status };
}

export function levelText(tank) {
  const { percent } = tankLevel(tank);
  return `${Math.round(percent)}% · ${formatQuantity(tank.bookStock)} L of ${formatQuantity(tank.capacityLitres)} L`;
}
