import { useEffect, useState } from "react";
import client from "../api/client";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import Pagination from "../components/shared/Pagination";
import { useAuth } from "../hooks/useAuth";
import { formatDate } from "../utils/formatters";

export default function ActivityPage() {
  const { user } = useAuth();
  return <Activity key={user?.workspaceId} />;
}

const empty = { action: "", actor: "", from: "", to: "" };
function Activity() {
  const [draft, setDraft] = useState(empty);
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  useEffect(() => {
    const abort = new AbortController();
    const params = {
      page,
      ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    };
    client
      .get("/audit", { params, signal: abort.signal })
      .then(({ data }) => {
        setResult({ data, filters, page });
      })
      .catch((err) => {
        if (!abort.signal.aborted)
          setResult({
            error: err.response?.data?.error || "Could not load activity",
            filters,
            page,
          });
      });
    return () => abort.abort();
  }, [filters, page]);
  const current = result?.filters === filters && result.page === page ? result : null;

  return (
    <section className="space-y-6">
      <header>
        <p className="mono-label">Workspace history</p>
        <h2 className="mt-2 text-2xl font-bold">Activity log</h2>
      </header>
      <form
        className="panel grid items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setFilters({ ...draft });
        }}
      >
        {Object.entries({ action: "Action", actor: "Actor ID", from: "From", to: "To" }).map(
          ([key, label]) => (
            <Input
              key={key}
              label={label}
              type={["from", "to"].includes(key) ? "date" : "text"}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          )
        )}
        <Button>Apply filters</Button>
      </form>
      {!current && <p className="text-sm text-slate-500">Loading activity…</p>}
      {current?.error && (
        <p role="alert" className="text-sm text-red-600">
          {current.error}
        </p>
      )}
      {current?.data && (
        <>
          {current.data.events.length ? (
            <ul className="panel divide-y divide-slate-100">
              {current.data.events.map((event) => (
                <li key={event._id} className="flex flex-wrap justify-between gap-3 p-4">
                  <div className="min-w-0 break-words">
                    <p className="font-semibold">{event.summary || event.action}</p>
                    <p className="text-xs text-slate-500">
                      {event.actorName || event.actorUserId || "Account not verified"}
                      {event.actorRole && ` · ${event.actorRole}`}
                    </p>
                    <p className="break-all text-xs text-slate-400">{event.action}</p>
                  </div>
                  <time className="text-xs text-slate-500" dateTime={event.createdAt}>
                    {formatDate(event.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Kolkata",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No activity matches these filters.</p>
          )}
          <Pagination page={page} pages={current.data.pages} onChange={setPage} />
        </>
      )}
    </section>
  );
}
