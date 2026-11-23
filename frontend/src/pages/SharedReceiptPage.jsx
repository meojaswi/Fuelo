import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { resolveShareLink } from "../api/links.api";
import ReceiptView from "../components/receipt/ReceiptView";
import ExpiredLinkState from "../components/receipt/ExpiredLinkState";

export default function SharedReceiptPage() {
  const { token } = useParams();
  return <SharedReceipt key={token} token={token} />;
}

function SharedReceipt({ token }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let active = true;
    resolveShareLink(token)
      .then((receipt) => {
        if (active) setState(receipt);
      })
      .catch((err) => {
        if (active) setState({ expired: err.response?.data?.code === "EXPIRED" });
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-slate-50 p-4 py-10">
      {state.loading ? (
        <div className="grid place-items-center text-sm text-slate-400">Opening receipt…</div>
      ) : state.transaction ? (
        <ReceiptView transaction={state.transaction} businessName={state.businessName} />
      ) : state.expired ? (
        <ExpiredLinkState />
      ) : (
        <p role="alert" className="text-center text-sm text-slate-500">
          This receipt is unavailable.
        </p>
      )}
    </main>
  );
}
