import { Link } from "react-router-dom";
import { formatCurrency, formatDate } from "../../utils/formatters";
export default function TransactionTable({ transactions = [] }) {
  return (
    <div className="panel hidden overflow-hidden md:block">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 font-mono text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="px-5 py-3">Date</th>
            <th className="px-5 py-3">Customer</th>
            <th className="px-5 py-3">Item</th>
            <th className="px-5 py-3">Payment</th>
            <th className="px-5 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t._id || t.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-5 py-4 font-mono text-xs text-slate-400">
                {formatDate(t.createdAt || t.date, { day: "2-digit", month: "short" })}
              </td>
              <td className="px-5 py-4">
                <Link
                  className="font-semibold hover:text-fuelo-coral"
                  to={`/transactions/${t._id || t.id}`}
                >
                  {t.customerName || "Walk-in"}
                </Link>
              </td>
              <td className="px-5 py-4">{t.itemType}</td>
              <td className="px-5 py-4 text-slate-500">{t.paymentMode}</td>
              <td className="px-5 py-4 text-right font-bold">{formatCurrency(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
