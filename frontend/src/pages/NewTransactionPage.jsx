import { lazy } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import TransactionForm from "../components/transactions/TransactionForm";
const TimberSaleForm = lazy(() => import("../components/timber/TimberSaleForm"));

export default function NewTransactionPage() {
  const n = useNavigate();
  const { user } = useAuth();
  const Form = user?.verticalFeatures?.dimensions ? TimberSaleForm : TransactionForm;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-7">
        <p className="mono-label">Ledger entry / New</p>
        <h2 className="mt-2 text-2xl font-bold">Record a transaction.</h2>
        <p className="mt-1 text-sm text-slate-500">
          Capture the sale once. Fuelo handles the notification flow.
        </p>
      </div>
      <div className="panel p-5 sm:p-7">
        <Form key={user?.workspaceId} onSaved={(d) => n(`/transactions/${d._id || d.id}`)} />
      </div>
    </div>
  );
}
