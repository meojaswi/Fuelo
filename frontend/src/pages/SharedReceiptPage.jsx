import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { resolveShareLink } from "../api/links.api";
import ReceiptView from "../components/receipt/ReceiptView";
import ExpiredLinkState from "../components/receipt/ExpiredLinkState";
import UsedLinkState from "../components/receipt/UsedLinkState";
export default function SharedReceiptPage() {
  const { token } = useParams(),
    [s, setS] = useState({ loading: true });
  useEffect(() => {
    resolveShareLink(token)
      .then((d) => setS({ transaction: d.transaction || d }))
      .catch((e) => {
        const c = e.response?.data?.code;
        setS({ expired: c === "EXPIRED", used: c === "USED" });
      });
  }, [token]);
  return (
    <main className="min-h-screen bg-slate-50 p-4 py-10">
      {s.loading ? (
        <div className="grid place-items-center text-sm text-slate-400">
          Opening receipt…
        </div>
      ) : s.transaction ? (
        <ReceiptView transaction={s.transaction} />
      ) : s.expired ? (
        <ExpiredLinkState />
      ) : (
        <UsedLinkState />
      )}
    </main>
  );
}
