import PillSelector from "../shared/PillSelector";
import { useItemTypeOptions } from "../../hooks/useItemTypeOptions";
export default function ItemTypeSelector({ options, value, onChange }) {
  const fallback = useItemTypeOptions();
  const list = options ?? fallback;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-600">Item type</p>
      <PillSelector options={list} value={value} onChange={onChange} />
    </div>
  );
}
