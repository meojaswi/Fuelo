import { useState } from "react";
import Input from "../shared/Input";
import { useCustomerAutocomplete } from "../../hooks/useCustomerAutocomplete";
export default function CustomerNameInput({ value, onChange }) {
  const [f, setF] = useState(false),
    s = useCustomerAutocomplete(value);
  return (
    <div className="relative">
      <Input
        label="Customer"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setF(true)}
        onBlur={() => setTimeout(() => setF(false), 150)}
        placeholder="Search or enter customer name"
      />
      {f && s.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-[8px] border bg-white p-1 shadow-float">
          {s.map((c) => (
            <button
              type="button"
              key={c._id || c.id}
              onClick={() => onChange(c.name)}
              className="block w-full rounded-[8px] px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              {c.name}
              <span className="ml-2 font-mono text-[10px] text-slate-400">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
