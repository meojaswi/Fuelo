import { useEffect, useState } from "react";
import { getPump, postPump } from "../api/pump.api";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import Modal from "../components/shared/Modal";
import Pagination from "../components/shared/Pagination";
import { formatCurrency, formatDate, formatQuantity } from "../utils/formatters";

const dateOptions = { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" };
const decimal = (value) => Math.round(Number(value) * 100) / 100;

export default function PumpShiftsPage() {
  const { user } = useAuth();
  const all = user?.permissions?.includes("shifts:read_all");
  const canReopen = user?.permissions?.includes("shifts:reopen");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const [devices, active, history] = await Promise.all([
          getPump("/nozzles"),
          getPump("/shifts", { status: "open", limit: 1 }),
          all
            ? getPump("/shifts", { status: "closed", page })
            : Promise.resolve({ shifts: [], pages: 1 }),
        ]);
        if (current) setData({ nozzles: devices.nozzles, active: active.shifts[0], history });
      } catch (err) {
        if (current) setError(err.response?.data?.error || "Could not load shifts.");
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [all, page, revision]);

  async function save(path, body) {
    setBusy(true);
    setError("");
    try {
      const shift = await postPump(path, body);
      setResult(shift.status === "closed" ? shift : null);
      setWizard(null);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err.response?.data?.error || "Could not update the shift.");
    } finally {
      setBusy(false);
    }
  }

  function openWizard(type, shift) {
    setError("");
    setWizard({ type, shift });
  }

  const active = data?.active;
  return (
    <section className="space-y-6">
      <header>
        <p className="mono-label">Pump operations</p>
        <h2 className="mt-2 text-2xl font-bold">Shifts</h2>
      </header>
      {error && !wizard && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!data && !error && <p className="text-sm text-slate-500">Loading shifts…</p>}
      {data &&
        (active ? (
          <div className="panel space-y-4 p-5">
            <div>
              <p className="mono-label">Open shift</p>
              <Elapsed openedAt={active.openedAt} />
            </div>
            <p>
              Credit sales so far <strong>{formatCurrency(active.creditSalesTotal)}</strong>
            </p>
            <Button type="button" onClick={() => openWizard("close", active)}>Close shift</Button>
          </div>
        ) : (
          <div className="panel space-y-3 p-5">
            <p className="text-sm text-slate-600">
              {data.nozzles.length
                ? "No shift available to close."
                : "Register a nozzle in Tanks & Deliveries to start a shift."}
            </p>
            {data.nozzles.length > 0 && (
              <Button onClick={() => openWizard("open")}>Open shift</Button>
            )}
          </div>
        ))}
      {result && (
        <p role="status" className="panel p-4">
          Shift closed. <Variance amount={result.variance} />
        </p>
      )}
      {all && data?.history.shifts.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold">Closed shifts</h3>
          <ul className="panel divide-y">
            {data.history.shifts.map((shift, index) => (
              <li key={shift._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{formatDate(shift.closedAt, dateOptions)}</p>
                  <p className="text-xs text-slate-500">
                    Expected {formatCurrency(shift.expectedSalesTotal)}
                  </p>
                </div>
                <Variance amount={shift.variance} />
                {canReopen && index === 0 && page === 1 && !active && (
                  <Button variant="secondary" onClick={() => openWizard("reopen", shift)}>
                    Reopen shift
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pages={data.history.pages} onChange={setPage} />
        </div>
      )}
      <Modal
        open={Boolean(wizard)}
        title={
          wizard?.type === "open"
            ? "Open shift"
            : wizard?.type === "close"
              ? "Close shift"
              : "Reopen shift"
        }
        onClose={() => !busy && setWizard(null)}
      >
        {wizard?.type === "open" && (
          <OpenForm
            nozzles={data.nozzles}
            busy={busy}
            error={error}
            save={(body) => save("/shifts/open", body)}
          />
        )}
        {wizard?.type === "close" && (
          <CloseForm
            shift={wizard.shift}
            credit={active?.creditSalesTotal ?? wizard.shift.creditSalesTotal}
            busy={busy}
            error={error}
            save={(body) => save(`/shifts/${wizard.shift._id}/close`, body)}
          />
        )}
        {wizard?.type === "reopen" && (
          <ReasonForm
            label="Reopen shift"
            busy={busy}
            error={error}
            save={(body) => save(`/shifts/${wizard.shift._id}/reopen`, body)}
          />
        )}
      </Modal>
    </section>
  );
}

function Elapsed({ openedAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const minutes = Math.max(0, Math.floor((now - new Date(openedAt)) / 60000));
  return (
    <p className="mt-1 font-semibold">
      {Math.floor(minutes / 60)}h {minutes % 60}m elapsed
    </p>
  );
}

function Variance({ amount }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-semibold ${amount === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-900"}`}
    >
      Variance {formatCurrency(amount)} · {amount === 0 ? "Matches" : "Needs review"}
    </span>
  );
}

function ErrorText({ error }) {
  return (
    error && (
      <p role="alert" className="text-sm text-red-600">
        {error}
      </p>
    )
  );
}
function ReasonForm({ label, save, busy, error }) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save({ reason });
      }}
    >
      <Input
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        minLength={3}
        required
      />
      <ErrorText error={error} />
      <Button loading={busy}>{label}</Button>
    </form>
  );
}

function OpenForm({ nozzles, save, busy, error }) {
  const [meters, setMeters] = useState(() =>
    Object.fromEntries(nozzles.map((row) => [row._id, row.lastMeterReading]))
  );
  const [explanation, setExplanation] = useState("");
  const differs = nozzles.some((row) => decimal(meters[row._id]) !== row.lastMeterReading);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          nozzleReadings: nozzles.map((row) => ({
            nozzleId: row._id,
            openingMeter: decimal(meters[row._id]),
          })),
          ...(differs && { explanation }),
        });
      }}
    >
      {nozzles.map((row) => (
        <Input
          key={row._id}
          label={`${row.label} opening meter (L)`}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={meters[row._id]}
          onChange={(e) => setMeters({ ...meters, [row._id]: e.target.value })}
          required
        />
      ))}
      {differs && (
        <Input
          label="Reason for the different meter"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          minLength={3}
          required
        />
      )}
      <ErrorText error={error} />
      <Button loading={busy}>Start shift</Button>
    </form>
  );
}

function CloseForm({ shift, credit, save, busy, error }) {
  const [meters, setMeters] = useState(() =>
    Object.fromEntries(
      shift.nozzleReadings.map((row) => [
        row.nozzleId,
        { closingMeter: row.openingMeter, testLitres: 0 },
      ])
    )
  );
  const [payments, setPayments] = useState({ declaredCash: 0, declaredUpi: 0, declaredCard: 0 });
  const prices = new Map(shift.pricesSnapshot.map((row) => [row.itemType, row.pricePerUnit]));
  function update(id, key, value) {
    setMeters((previous) => ({ ...previous, [id]: { ...previous[id], [key]: value } }));
  }
  const expected = shift.nozzleReadings.reduce((sum, row) => {
    const entry = meters[row.nozzleId];
    const net = Math.max(0, decimal(entry.closingMeter - row.openingMeter - entry.testLitres));
    return sum + decimal(net * prices.get(row.itemType));
  }, 0);
  const variance = decimal(
    Object.values(payments).reduce((sum, value) => sum + Number(value), 0) +
      Number(credit || 0) -
      expected
  );
  return (
    <form
      className="max-h-[65vh] space-y-4 overflow-auto px-1"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          ...Object.fromEntries(
            Object.entries(payments).map(([key, value]) => [key, decimal(value)])
          ),
          nozzleReadings: Object.entries(meters).map(([nozzleId, entry]) => ({
            nozzleId,
            closingMeter: decimal(entry.closingMeter),
            testLitres: decimal(entry.testLitres),
          })),
        });
      }}
    >
      {shift.nozzleReadings.map((row) => (
        <fieldset className="space-y-2 rounded-lg border p-3" key={row.nozzleId}>
          <legend className="text-sm font-semibold">{row.label}</legend>
          <Input
            label="Closing meter (L)"
            type="number"
            inputMode="decimal"
            min={row.openingMeter}
            step="0.01"
            value={meters[row.nozzleId].closingMeter}
            onChange={(e) => update(row.nozzleId, "closingMeter", e.target.value)}
            required
          />
          <Input
            label="Test litres"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={meters[row.nozzleId].testLitres}
            onChange={(e) => update(row.nozzleId, "testLitres", e.target.value)}
          />
        </fieldset>
      ))}
      {Object.entries({ declaredCash: "Cash", declaredUpi: "UPI", declaredCard: "Card" }).map(
        ([key, label]) => (
          <Input
            key={key}
            label={`Declared ${label} (₹)`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={payments[key]}
            onChange={(e) => setPayments({ ...payments, [key]: e.target.value })}
            required
          />
        )
      )}
      <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
        <p>Expected {formatCurrency(expected)}</p>
        <p>Linked credit {formatCurrency(credit || 0)}</p>
        <p>
          Net litres{" "}
          {formatQuantity(
            shift.nozzleReadings.reduce(
              (sum, row) =>
                sum +
                Math.max(
                  0,
                  decimal(
                    meters[row.nozzleId].closingMeter -
                      row.openingMeter -
                      meters[row.nozzleId].testLitres
                  )
                ),
              0
            )
          )}
        </p>
        <Variance amount={variance} />
      </div>
      <ErrorText error={error} />
      <Button loading={busy}>Confirm close</Button>
    </form>
  );
}
