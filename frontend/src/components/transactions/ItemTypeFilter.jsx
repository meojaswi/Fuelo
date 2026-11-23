import PillSelector from "../shared/PillSelector";
import { useItemTypeOptions } from "../../hooks/useItemTypeOptions";
export default function ItemTypeFilter({ value, onChange }) {
  const options = useItemTypeOptions();
  if (!options.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-600">Item</p>
      <PillSelector multiple options={options} value={value || []} onChange={onChange} />
    </div>
  );
}
