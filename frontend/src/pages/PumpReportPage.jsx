import { useState } from "react";
import { exportPump, getPump } from "../api/pump.api";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import { formatCurrency, formatQuantity } from "../utils/formatters";

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" }).format(new Date());
const stockColumns = {
  openingBookStock: "Opening",
  deliveriesLitres: "Deliveries",
  meterSalesLitres: "Meter litres",
  individualSalesLitres: "Individual sales",
  meterAdditionalLitres: "Meter adjustment",
  adjustmentLitres: "Other adjustments",
  closingBookStock: "Closing",
};

export default function PumpReportPage() {
  const [date, setDate] = useState(today);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(csv) {
    setBusy(true);
    setError("");
    try {
      if (csv) await exportPump(date);
      else setReport(await getPump("/reports/pump-daily", { date }));
    } catch (err) {
      setError(err.response?.data?.error || "Could not load the pump report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="mono-label">Pump operations</p>
        <h2 className="mt-2 text-2xl font-bold">Pump Report</h2>
      </header>
      <form
        className="panel flex flex-wrap items-end gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(false);
        }}
      >
        <Input
          label="Date (IST)"
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button loading={busy}>Run report</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!date || busy}
          onClick={() => run(true)}
        >
          Export CSV
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {report && (
        <>
          <p className="text-sm text-slate-500">
            Tank volumes in litres · {report.date} IST · Flag threshold{" "}
            {report.varianceThresholdPercent}% of throughput
          </p>
          <Reconciliation title="By fuel item" rows={report.items} />
          <Reconciliation title="By tank" rows={report.tanks} />
          <div className="space-y-2">
            <h3 className="font-bold">Closed shifts</h3>
            {report.shifts.length ? (
              <div className="panel overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {[
                        "Operator",
                        "Hours",
                        "Litres",
                        "Expected",
                        "Cash / UPI / card",
                        "Credit",
                        "Variance",
                      ].map((title) => (
                        <th key={title} className="p-3">
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.shifts.map((shift) => (
                      <tr
                        key={shift.shiftId}
                        className={shift.variance ? "border-t bg-amber-50" : "border-t"}
                      >
                        {[
                          shift.openedByName || "Staff",
                          shift.hours,
                          shift.litres,
                          formatCurrency(shift.expectedSalesTotal),
                          formatCurrency(shift.declaredTotal),
                          formatCurrency(shift.creditSalesTotal),
                          formatCurrency(shift.variance),
                        ].map((value, i) => (
                          <td key={i} className="whitespace-nowrap p-3">
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No closed shifts for this date.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Reconciliation({ title, rows }) {
  return (
    <section className="space-y-2">
      <h3 className="font-bold">{title}</h3>
      {rows.length ? (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Name", ...Object.values(stockColumns), "Dip", "Variance"].map((label) => (
                  <th key={label} className="whitespace-nowrap p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.tankId || row.itemType}
                  className={row.flagged ? "border-t bg-amber-50" : "border-t"}
                >
                  <th className="whitespace-nowrap p-3">{row.name || row.itemType}</th>
                  {Object.keys(stockColumns).map((key) => (
                    <td key={key} className="p-3">
                      {formatQuantity(row[key])}
                    </td>
                  ))}
                  <td className="p-3">
                    {row.latestDip ? formatQuantity(row.latestDip.readingLitres) : "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    {row.varianceLitres == null ? "—" : formatQuantity(row.varianceLitres)}
                    {row.flagged && " · Flagged"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No tank movements to reconcile.</p>
      )}
    </section>
  );
}
