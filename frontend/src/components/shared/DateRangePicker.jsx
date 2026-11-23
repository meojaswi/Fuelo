export default function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        type="date"
        aria-label="From date"
        value={from || ""}
        onChange={(e) => onChange({ ...{ from, to }, from: e.target.value })}
        className="control min-h-11 px-3 py-2 text-sm"
      />
      <input
        type="date"
        aria-label="To date"
        value={to || ""}
        onChange={(e) => onChange({ ...{ from, to }, to: e.target.value })}
        className="control min-h-11 px-3 py-2 text-sm"
      />
    </div>
  );
}
