import PillSelector from "../shared/PillSelector";
export default function ItemTypeSelector({
  options = ["Diesel", "Petrol", "CNG"],
  value,
  onChange,
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-600">Item type</p>
      <PillSelector options={options} value={value} onChange={onChange} />
    </div>
  );
}
