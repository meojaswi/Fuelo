import { useEffect, useState } from "react";
import { MessageSquare, RefreshCcw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { listNotifications, retryNotification } from "../api/notifications.api";
import Pagination from "../components/shared/Pagination";
import EmptyState from "../components/shared/EmptyState";
import Button from "../components/shared/Button";
import { useAuth } from "../context/AuthContext";

export default function MessagesPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ notifications: [], total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);

  const fetchMessages = async (p = 1) => {
    setLoading(true);
    try {
      const res = await listNotifications({ page: p });
      setData(res);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages(page);
  }, [page, user?.workspaceId]);

  const handleRetry = async (id) => {
    setRetryingId(id);
    try {
      await retryNotification(id);
      await fetchMessages(page);
    } catch (error) {
      console.error("Failed to retry notification:", error);
    } finally {
      setRetryingId(null);
    }
  };

  const pages = Math.ceil(data.total / data.limit);

  return (
    <div className="space-y-6">
      <div>
        <p className="mono-label">Communication</p>
        <h2 className="mt-2 text-2xl font-bold">Messages.</h2>
        <p className="mt-1 text-sm text-slate-500">History and queue for WhatsApp & SMS.</p>
      </div>

      <div className="panel overflow-hidden">
        {loading && data.notifications.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading messages...</div>
        ) : data.notifications.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="px-4 py-3 font-medium">Channel</th>
                    <th className="px-4 py-3 font-medium">Message</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.notifications.map((msg) => (
                    <tr key={msg._id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 capitalize">
                        <div className="flex items-center gap-2 font-medium">
                          <MessageSquare size={14} className="text-slate-400" />
                          {msg.channel}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="max-w-[300px] truncate text-slate-600"
                          title={msg.messageBody}
                        >
                          {msg.messageBody || "No content"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {msg.status === "sent" && (
                            <CheckCircle2 size={14} className="text-emerald-500" />
                          )}
                          {msg.status === "failed" && (
                            <XCircle size={14} className="text-red-500" />
                          )}
                          {msg.status === "pending" && (
                            <Clock size={14} className="text-amber-500" />
                          )}
                          <span
                            className={`text-xs font-semibold uppercase tracking-wider ${
                              msg.status === "sent"
                                ? "text-emerald-600"
                                : msg.status === "failed"
                                  ? "text-red-600"
                                  : "text-amber-600"
                            }`}
                          >
                            {msg.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(msg.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {msg.status === "failed" && (
                          <button
                            onClick={() => handleRetry(msg._id)}
                            disabled={retryingId === msg._id}
                            className="inline-flex items-center gap-1.5 rounded-[6px] bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
                          >
                            <RefreshCcw
                              size={12}
                              className={retryingId === msg._id ? "animate-spin" : ""}
                            />
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pages={pages} onChange={setPage} />
          </>
        ) : (
          <div className="p-4">
            <EmptyState
              title="No messages yet"
              description="Messages sent via WhatsApp or SMS will appear here."
            />
          </div>
        )}
      </div>
    </div>
  );
}
