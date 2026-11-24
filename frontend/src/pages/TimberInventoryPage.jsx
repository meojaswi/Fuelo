import { useEffect, useState } from "react";
import { timberGet, timberSend, timberError } from "../api/timber.api";
import { formatCurrency, formatQuantity } from "../utils/formatters";
import { useAuth } from "../hooks/useAuth";
import Input from "../components/shared/Input";
import Button from "../components/shared/Button";
import { Select, ErrorNotice } from "../components/timber/TimberForms";
import { unitNames } from "../components/timber/timberFormValues";

export default function TimberInventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [editor, setEditor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const canConfigureTax = user?.permissions?.includes("settings:manage");
  useEffect(() => {
    let active = true;
    timberGet("/timber/items")
      .then(({ items }) => {
        if (active) {
          setItems(items);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (active) {
          setError(timberError(err, "Could not load timber stock."));
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [revision]);
  function saved() {
    setEditor(null);
    setSelected(null);
    setRevision((value) => value + 1);
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Timber Inventory</h2>
        <Button type="button" onClick={() => setEditor({})}>
          Add timber item
        </Button>
      </div>
      <ErrorNotice>{error}</ErrorNotice>
      {editor && (
        <ItemEditor
          key={editor._id ?? "new"}
          item={editor}
          onSaved={saved}
          onCancel={() => setEditor(null)}
        />
      )}
      {selected && (
        <StockEditor
          key={selected._id}
          item={selected}
          onSaved={saved}
          onCancel={() => setSelected(null)}
        />
      )}
      {!loaded && <p className="text-sm text-slate-500">Loading timber stock…</p>}
      {loaded && !items.length && !error && (
        <p className="text-sm text-slate-500">
          No timber items yet. Use Add timber item to create the first one.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <article className="panel space-y-3 p-4" key={item._id}>
            <p className="mono-label">
              {item.species ?? item.itemType}
              {item.grade && " · " + item.grade}
            </p>
            <h3 className="font-bold">{item.itemType}</h3>
            <p>
              {formatQuantity(item.currentStock, 3)} {unitNames[item.pricingUnit] ?? item.unit} ·{" "}
              {item.currentPieces ?? 0} pieces
            </p>
            <p className="text-sm text-slate-600">{formatCurrency(item.pricePerUnit)} per {unitNames[item.pricingUnit] ?? item.unit ?? "unit"}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditor(item)}>
                {item.pricingUnit ? "Edit item" : "Configure item"}
              </Button>
              {item.pricingUnit && (
                <Button type="button" variant="ghost" onClick={() => setSelected(item)}>
                  Adjust stock
                </Button>
              )}
            </div>
            {canConfigureTax && item.pricingUnit && <ItemTax key={item._id} item={item} />}
          </article>
        ))}
      </div>
    </div>
  );
}

function ItemEditor({ item, onSaved, onCancel }) {
  const [draft, setDraft] = useState({
    itemType: item.itemType ?? "",
    species: item.species ?? item.itemType ?? "",
    grade: item.grade ?? "",
    pricingUnit: item.pricingUnit ?? "cubic_ft",
    pricePerUnit: item.pricePerUnit ?? "",
    defaultThicknessIn: item.defaultThicknessIn ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function field(key, value) {
    setDraft({ ...draft, [key]: value });
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await timberSend("put", "/timber/items", {
        ...draft,
        pricePerUnit: Number(draft.pricePerUnit),
        defaultThicknessIn:
          draft.defaultThicknessIn === "" ? null : Number(draft.defaultThicknessIn),
      });
      onSaved();
    } catch (err) {
      setError(timberError(err, "Could not save this item."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Item name"
          required
          readOnly={!!item._id}
          value={draft.itemType}
          onChange={(e) => field("itemType", e.target.value)}
        />
        <Input
          label="Species"
          required
          list="timber-species"
          value={draft.species}
          onChange={(e) => field("species", e.target.value)}
        />
        <datalist id="timber-species">
          {["Teak", "Sal", "Pine", "Oak", "Rosewood", "Deodar"].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Input
          label="Grade or quality"
          required
          value={draft.grade}
          onChange={(e) => field("grade", e.target.value)}
        />
        <Select
          label="Pricing unit"
          value={draft.pricingUnit}
          onChange={(e) => field("pricingUnit", e.target.value)}
        >
          {Object.entries(unitNames).map(([key, name]) => (
            <option value={key} key={key}>
              {name}
            </option>
          ))}
        </Select>
        <Input
          label="Price per unit"
          type="number"
          required
          min="0"
          step="0.01"
          value={draft.pricePerUnit}
          onChange={(e) => field("pricePerUnit", e.target.value)}
        />
        <Input
          label="Default thickness (in)"
          type="number"
          min="0.001"
          step="any"
          value={draft.defaultThicknessIn}
          onChange={(e) => field("defaultThicknessIn", e.target.value)}
        />
      </div>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="flex gap-2">
        <Button loading={busy}>Save item</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function StockEditor({ item, onSaved, onCancel }) {
  const [quantity, setQuantity] = useState(item.currentStock);
  const [pieces, setPieces] = useState(item.currentPieces ?? 0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await timberSend("post", "/timber/items/adjustments", {
        itemType: item.itemType,
        quantity: Number(quantity),
        pieces: Number(pieces),
        reason,
      });
      onSaved();
    } catch (err) {
      setError(timberError(err, "Could not adjust stock."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel space-y-4 p-5" onSubmit={submit}>
      <h3 className="font-bold">Adjust {item.itemType}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="New stock quantity"
          type="number"
          required
          min="0"
          step="0.001"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Input
          label="New piece count"
          type="number"
          required
          min="0"
          step="1"
          value={pieces}
          onChange={(e) => setPieces(e.target.value)}
        />
        <Input
          label="Reason"
          required
          minLength={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="flex gap-2">
        <Button loading={busy}>Save stock</Button>
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ItemTax({ item }) {
  const [hsnCode, setHsn] = useState(item.hsnCode ?? "");
  const [gst, setGst] = useState(item.gstRatePercent ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await timberSend("patch", "/timber/items/" + encodeURIComponent(item.itemType) + "/tax", {
        hsnCode: hsnCode || null,
        gstRatePercent: gst === "" ? null : Number(gst),
      });
      setMessage("Tax details saved.");
    } catch (err) {
      setError(timberError(err, "Could not save item tax."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="border-t pt-2">
      <summary className="cursor-pointer py-3 text-sm font-semibold">Item tax settings</summary>
      <form className="mt-2 space-y-2" onSubmit={submit}>
        <Input
          label="HSN code"
          pattern="[0-9]{4,8}"
          value={hsnCode}
          onChange={(e) => setHsn(e.target.value)}
        />
        <Input
          label="GST rate (%)"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={gst}
          onChange={(e) => setGst(e.target.value)}
        />
        <ErrorNotice>{error}</ErrorNotice>
        {message && (
          <p className="text-sm" role="status">
            {message}
          </p>
        )}
        <Button loading={busy}>Save item tax</Button>
      </form>
    </details>
  );
}
