export default function Input({ label, error, className = "", ...p }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input
        className={`control w-full px-3.5 py-3 text-sm placeholder:text-slate-300 ${className}`}
        {...p}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}
