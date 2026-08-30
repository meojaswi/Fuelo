import { MessageCircle, ArrowUpRight } from "lucide-react";
export default function NotificationBanner({ sent = 0, failed = 0 }) {
  return (
    <div
      className={`flex items-center gap-4 rounded-[8px] border p-4 ${failed ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
    >
      <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-white">
        <MessageCircle size={16} />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold">WhatsApp delivery</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {sent} sent · {failed} failed
        </p>
      </div>
      <ArrowUpRight size={16} className="text-slate-400" />
    </div>
  );
}
