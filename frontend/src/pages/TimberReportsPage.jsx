import { useState } from "react";
import { timberGet, timberError, downloadTimber } from "../api/timber.api";
import { formatCurrency } from "../utils/formatters";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import { Select, ErrorNotice } from "../components/timber/TimberForms";

const choices = {
  stock: "Stock",
  "sales-by-species": "Sales by species",
  "receivables-aging": "Receivables aging",
  "payables-aging": "Payables aging",
  "profit-lite": "Profit estimate",
  "gst-summary": "GST summary",
};
const headings = {
  days0to30: "0–30 days",
  days31to60: "31–60 days",
  days61to90: "61–90 days",
  days91Plus: "91+ days",
  itemType: "Item",
  rate: "Rate",
  hsn: "HSN",
};
const dated = new Set(["sales-by-species", "profit-lite", "gst-summary"]);
const gstMoney = new Set(["taxableValue", "cgst", "sgst", "igst"]);
const gstColumns = ["month", "hsn", "rate", "taxableValue", "cgst", "sgst", "igst"];
const title = (key) => headings[key] ?? key.replace(/[A-Z]/g, (part) => " " + part.toLowerCase());

export default function TimberReportsPage() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const [kind, setKind] = useState("stock");
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const path = kind === "gst-summary" ? "/reports/gst-summary" : "/reports/timber/" + kind;
  const dates = dated.has(kind) ? { from, to } : {};
  async function load(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResult({ ...(await timberGet(path, dates)), kind });
    } catch (err) {
      setError(timberError(err, "Could not load report."));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setDownloading(true);
    setError("");
    try {
      await downloadTimber(path, kind + ".csv", { ...dates, format: "csv" });
    } catch (err) {
      setError(timberError(err, "Could not download CSV."));
    } finally {
      setDownloading(false);
    }
  }
  const data = result?.kind === kind ? result : null;
  const columns = data?.columns ?? gstColumns;
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-bold">Timber Reports</h2>
      <form
        className="panel grid items-end gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={load}
      >
        <Select
          label="Report"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setError("");
          }}
        >
          {Object.entries(choices).map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </Select>
        {dated.has(kind) && (
          <>
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
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        )}
        <Button loading={busy}>Run report</Button>
      </form>
      {kind === "gst-summary" && (
        <p className="text-sm text-slate-600">
          Working summary for your accountant. This does not file a GST return.
        </p>
      )}
      {data?.notice && kind !== "gst-summary" && (
        <p className="text-sm text-slate-600">{data.notice}</p>
      )}
      <ErrorNotice>{error}</ErrorNotice>
      {data && (
        <div className="space-y-3">
          <Button type="button" variant="secondary" loading={downloading} onClick={download}>
            Download CSV
          </Button>
          <div className="panel overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  {columns.map((key) => (
                    <th className="whitespace-nowrap p-3 capitalize" key={key}>
                      {title(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr className="border-b" key={index}>
                    {columns.map((key) => (
                      <td className="whitespace-nowrap p-3" key={key}>
                        {kind === "gst-summary" && gstMoney.has(key) && typeof row[key] === "number"
                          ? formatCurrency(row[key])
                          : (row[key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.rows.length && <p className="p-4">No rows for this report.</p>}
          </div>
        </div>
      )}
    </section>
  );
}
