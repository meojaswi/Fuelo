import { useNavigate } from "react-router-dom";
import TransactionForm from "../components/transactions/TransactionForm";
export default function NewTransactionPage() {
  const n = useNavigate();
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
        <TransactionForm onSaved={(d) => n(`/transactions/${d._id || d.id}`)} />
      </div>
    </div>
  );
}
