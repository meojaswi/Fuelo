import { useEffect, useState } from "react";
import { getPump, postPump } from "../api/pump.api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import Modal from "../components/shared/Modal";
import Pagination from "../components/shared/Pagination";
import { formatCurrency, formatDate, formatQuantity } from "../utils/formatters";

const dateOptions = { dateStyle: "medium", timeZone: "Asia/Kolkata" };
const labels = {
  tank: "Add tank",
  nozzle: "Add nozzle",
  delivery: "Record delivery",
  dip: "Record dip",
  void: "Void delivery",
};
const fields = {
  tank: [
    ["name", "Tank name"],
    ["itemType", "Fuel item"],
    ["capacityLitres", "Capacity (L)", true],
  ],
  nozzle: [
    ["label", "Nozzle label"],
    ["lastMeterReading", "Last meter reading (L)", true],
  ],
  delivery: [
    ["supplierName", "Supplier"],
    ["invoiceNumber", "Invoice number", false, true],
    ["vehicleNumber", "Vehicle number", false, true],
    ["quantityLitres", "Quantity (L)", true],
    ["ratePerLitre", "Rate per litre (₹)", true],
  ],
  dip: [
    ["readingLitres", "Measured stock (L)", true],
    ["note", "Note", false, true],
  ],
  void: [["reason", "Reason"]],
};

export default function PumpTanksPage() {
  const { user } = useAuth();
  const manage = user?.permissions?.includes("tanks:manage");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dips, setDips] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [tanks, nozzles, deliveries] = await Promise.all([
          getPump(manage ? "/tanks" : "/tanks/dip-targets"),
          manage ? getPump("/nozzles") : Promise.resolve({ nozzles: [] }),
          manage ? getPump("/deliveries", { page }) : Promise.resolve({ deliveries: [], pages: 1 }),
        ]);
        if (active) setData({ tanks: tanks.tanks, nozzles: nozzles.nozzles, ...deliveries });
      } catch (err) {
        if (active) setError(err.response?.data?.error || "Could not load tanks.");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [manage, page, revision]);

  function edit(type, id) {
    setError("");
    setNotice("");
    setDialog({ type, id });
  }

  async function save(body) {
    const { type, id } = dialog;
    const routes = {
      tank: "/tanks",
      nozzle: "/nozzles",
      delivery: "/deliveries",
      dip: `/tanks/${id}/dips`,
      void: `/deliveries/${id}/void`,
    };
    setBusy(true);
    setError("");
    try {
      const result = await postPump(routes[type], body);
      setDialog(null);
      setNotice(
        type === "dip"
          ? `Dip recorded. Variance ${formatQuantity(result.varianceLitres)} L.`
          : type === "void"
            ? "Delivery voided."
            : "Saved."
      );
      setPage(1);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save this change.");
    } finally {
      setBusy(false);
    }
  }

  async function viewDips(tank) {
    setError("");
    try {
      const data = await getPump(`/tanks/${tank._id}/dips`);
      setDips({ name: tank.name, rows: data.dips });
    } catch (err) {
      setError(err.response?.data?.error || "Could not load readings.");
    }
  }

  const activeTanks = data?.tanks.filter((tank) => tank.isActive !== false) ?? [];
  return (
    <section className="space-y-6">
      <header>
        <p className="mono-label">Pump operations</p>
        <h2 className="mt-2 text-2xl font-bold">{manage ? "Tanks & Deliveries" : "Tank dips"}</h2>
      </header>
      {error && !dialog && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {!data && !error && <p className="text-sm text-slate-500">Loading tanks…</p>}
      {manage && data && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => edit("tank")}>Add tank</Button>
          <Button variant="secondary" disabled={!activeTanks.length} onClick={() => edit("nozzle")}>
            Add nozzle
          </Button>
          <Button
            variant="secondary"
            disabled={!activeTanks.length}
            onClick={() => edit("delivery")}
          >
            Record delivery
          </Button>
        </div>
      )}
      {data && !data.tanks.length && (
        <p className="text-sm text-slate-500">Register a tank to start tracking stock.</p>
      )}
      {data?.tanks.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.tanks.map((tank) => (
            <article key={tank._id} className="panel space-y-3 p-4">
              <p className="mono-label">
                {tank.itemType}
                {tank.isActive === false && " · Inactive"}
              </p>
              <h3 className="font-bold">{tank.name}</h3>
              {manage && (
                <>
                  <p className="text-sm">
                    Book stock{" "}
                    <strong>
                      {formatQuantity(tank.bookStock)} / {formatQuantity(tank.capacityLitres)} L
                    </strong>
                  </p>
                  <progress
                    aria-label={`${tank.name} fill level`}
                    className="w-full accent-fuelo-coral"
                    max={tank.capacityLitres}
                    value={Math.max(0, Math.min(tank.capacityLitres, tank.bookStock))}
                  />
                  {data.nozzles
                    .filter((row) => row.tankId === tank._id)
                    .map((row) => (
                      <p key={row._id} className="text-xs text-slate-500">
                        {row.label} · Meter {formatQuantity(row.lastMeterReading)} L
                      </p>
                    ))}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {tank.isActive !== false && (
                  <Button variant="secondary" onClick={() => edit("dip", tank._id)}>
                    Record dip
                  </Button>
                )}
                <Button variant="ghost" onClick={() => viewDips(tank)}>
                  Dip history
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {manage && data && (
        <section className="space-y-3">
          <h3 className="font-bold">Delivery history</h3>
          {data.deliveries.length ? (
            <ul className="panel divide-y">
              {data.deliveries.map((row) => (
                <li key={row._id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">
                      {row.supplierName} · {row.itemType}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(row.receivedAt, dateOptions)} ·{" "}
                      {formatQuantity(row.quantityLitres)} L · {formatCurrency(row.totalAmount)}
                    </p>
                  </div>
                  {row.status === "voided" ? (
                    <p className="text-xs font-semibold text-slate-500">Voided</p>
                  ) : (
                    <Button variant="ghost" onClick={() => edit("void", row._id)}>
                      Void delivery
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No deliveries recorded.</p>
          )}
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </section>
      )}
      <Modal
        open={Boolean(dialog)}
        title={labels[dialog?.type]}
        onClose={() => !busy && setDialog(null)}
      >
        {dialog && (
          <TankForm
            type={dialog.type}
            tanks={activeTanks}
            submit={save}
            busy={busy}
            error={error}
          />
        )}
      </Modal>
      <Modal open={Boolean(dips)} title={dips?.name + " dip history"} onClose={() => setDips(null)}>
        {dips?.rows.length ? (
          <ul className="max-h-[55vh] divide-y overflow-auto">
            {dips.rows.map((row) => (
              <li key={row._id} className="py-3 text-sm">
                {formatDate(row.recordedAt, dateOptions)} · {formatQuantity(row.readingLitres)} L ·
                Variance {formatQuantity(row.varianceLitres)} L
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No readings recorded.</p>
        )}
      </Modal>
    </section>
  );
}

function TankForm({ type, initialTank, tanks, submit, busy, error }) {
  const [tankId, setTankId] = useState(initialTank || tanks[0]?._id || "");
  const [input, setInput] = useState({});
  const [override, setOverride] = useState(false);
  const chooseTank = type === "delivery" || type === "nozzle";
  return (
    <form
      className="max-h-[65vh] space-y-4 overflow-auto px-1"
      onSubmit={(event) => {
        event.preventDefault();
        const body = {};
        for (const [key, , numeric, optional] of fields[type]) {
          if (optional && !input[key]?.trim()) continue;
          body[key] = numeric ? Number(input[key]) : input[key];
        }
        if (chooseTank) body.tankId = tankId;
        if (type === "delivery") body.override = override;
        submit(body);
      }}
    >
      {chooseTank && (
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">Tank</span>
          <select
            className="control min-h-11 w-full px-3 py-2"
            value={tankId}
            onChange={(event) => setTankId(event.target.value)}
            required
          >
            {tanks.map((tank) => (
              <option key={tank._id} value={tank._id}>
                {tank.name} · {tank.itemType}
              </option>
            ))}
          </select>
        </label>
      )}
      {fields[type].map(([key, label, numeric, optional]) => (
        <Input
          key={key}
          label={label}
          type={numeric ? "number" : "text"}
          inputMode={numeric ? "decimal" : undefined}
          min={
            numeric
              ? ["capacityLitres", "quantityLitres"].includes(key)
                ? "0.01"
                : "0"
              : undefined
          }
          step={numeric ? "0.01" : undefined}
          value={input[key] ?? ""}
          minLength={key === "reason" ? 3 : undefined}
          onChange={(e) => setInput({ ...input, [key]: e.target.value })}
          required={!optional}
        />
      ))}
      {type === "delivery" && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />{" "}
          Allow this delivery to exceed capacity
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <Button loading={busy}>{labels[type]}</Button>
    </form>
  );
}
