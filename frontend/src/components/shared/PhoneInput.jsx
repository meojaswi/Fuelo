export default function PhoneInput(p) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">Phone</span>
      <div className="control flex overflow-hidden">
        <span className="grid place-items-center border-r border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
          +91
        </span>
        <input
          inputMode="tel"
          {...p}
          className="min-w-0 flex-1 bg-white px-3.5 py-3 text-sm outline-none"
          maxLength={10}
        />
      </div>
    </label>
  );
}
