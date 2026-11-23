import { useState } from "react";
import client from "../api/client";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import { formatCurrency, formatQuantity } from "../utils/formatters";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export default function ReportsPage() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState("day");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(format = "json") {
    setBusy(true);
    setError("");
    try {
      const { data } = await client.get("/reports/sales", {
        params: { from, to, groupBy, format },
        responseType: format === "csv" ? "text" : "json",
      });
      if (format === "json") setReport(data);
      else {
        const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
        const download = document.createElement("a");
        download.href = url;
        download.download = `sales-${from}-to-${to}.csv`;
        download.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Could not load the sales report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="mono-label">Workspace reports</p>
        <h2 className="mt-2 text-2xl font-bold">Sales report</h2>
      </header>
      <form
        className="panel flex flex-wrap items-end gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Input
          label="From (IST)"
          type="date"
          required
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          label="To (IST)"
          type="date"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">Group by</span>
          <select
            className="control min-h-11 px-3 py-2"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
          >
            <option value="day">Day</option>
            <option value="item">Item</option>
            <option value="paymentMode">Payment mode</option>
          </select>
        </label>
        <Button loading={busy}>Run report</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !from || !to}
          onClick={() => run("csv")}
        >
          Export CSV
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {report && !report.groups.length && (
        <p className="text-sm text-slate-500">No sales in this date range.</p>
      )}
      {report && (
        <div className="panel overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                {["Group", "Quantity", "Amount", "Sales"].map((label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...report.groups, { ...report.totals, group: "Total" }].map((row, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="p-3">{row.group}</td>
                  <td className="p-3">{formatQuantity(row.quantity)}</td>
                  <td className="p-3">{formatCurrency(row.amount)}</td>
                  <td className="p-3">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
