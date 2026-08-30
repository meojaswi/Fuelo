import { MessageCircle } from "lucide-react";
export default function NotificationStatusCard({ status = "pending" }) {
  const good = status === "sent",
    bad = status === "failed";
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-slate-50">
          <MessageCircle size={16} />
        </span>
        <div>
          <p className="mono-label">Customer notification</p>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <span
              className={`h-2 w-2 rounded-full ${good ? "bg-emerald-500" : bad ? "bg-red-500" : "bg-amber-400"}`}
            />
            <span className="capitalize">{status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
