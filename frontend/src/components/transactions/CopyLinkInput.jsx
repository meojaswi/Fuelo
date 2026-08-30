import { useState } from "react";
export default function CopyLinkInput({ link }) {
  const [c, setC] = useState(false);
  if (!link) return null;
  return (
    <div className="flex gap-2">
      <input readOnly value={link} className="control min-w-0 flex-1 px-3 py-2 text-xs" />
      <button
        onClick={() => {
          navigator.clipboard.writeText(link);
          setC(true);
        }}
        className="rounded-[8px] border border-slate-200 px-3 text-xs font-semibold"
      >
        {c ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
