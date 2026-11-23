import { useId } from "react";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { formatCurrency, formatQuantity } from "../../utils/formatters";
import { linePreview, unitNames } from "./timberFormValues";

export function Select({ label, children, ...props }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600">
        {label}
      </label>
      <select id={id} className="control w-full px-3.5 py-3 text-sm" {...props}>
        {children}
      </select>
    </div>
  );
}

export function ErrorNotice({ children }) {
  return children ? (
    <p className="text-sm text-red-700" role="alert">
      {children}
    </p>
  ) : null;
}

function newLine(id = crypto.randomUUID()) {
  return {
    id,
    itemType: "",
    pieces: "1",
    lengthFt: "",
    widthIn: "",
    thicknessIn: "",
    ratePerUnit: "",
  };
}

export function LineEditor({ lines, setLines, items, purchase = false }) {
  const shown = lines.length ? lines : [newLine("first")];
  function change(id, fields) {
    setLines(shown.map((row) => (row.id === id ? { ...row, ...fields } : row)));
  }
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-bold">Timber lines</legend>
      {shown.map((line, index) => {
        const item = items.find(({ itemType }) => itemType === line.itemType);
        const hasLength = item?.pricingUnit && item.pricingUnit !== "piece";
        const hasWidth = ["cubic_ft", "sq_ft"].includes(item?.pricingUnit);
        const hasThickness = item?.pricingUnit === "cubic_ft";
        const preview = linePreview(line, item);
        return (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3" key={line.id}>
            <Select
              label={"Timber item " + (index + 1)}
              value={line.itemType}
              required
              onChange={(e) =>
                change(line.id, {
                  itemType: e.target.value,
                  lengthFt: "",
                  widthIn: "",
                  thicknessIn: "",
                  ratePerUnit: "",
                })
              }
            >
              <option value="">Choose species and grade</option>
              {items
                .filter((row) => row.pricingUnit)
                .map((row) => (
                  <option key={row._id} value={row.itemType}>
                    {row.species} · {row.grade} · {row.itemType}
                  </option>
                ))}
            </Select>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                label="Pieces"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                required
                value={line.pieces}
                onChange={(e) => change(line.id, { pieces: e.target.value })}
              />
              {hasLength && (
                <Input
                  label="Length (ft)"
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="any"
                  required
                  value={line.lengthFt}
                  onChange={(e) => change(line.id, { lengthFt: e.target.value })}
                />
              )}
              {hasWidth && (
                <Input
                  label="Width (in)"
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="any"
                  required
                  value={line.widthIn}
                  onChange={(e) => change(line.id, { widthIn: e.target.value })}
                />
              )}
              {hasThickness && (
                <Input
                  label="Thickness (in)"
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="any"
                  required={!item.defaultThicknessIn}
                  placeholder={String(item.defaultThicknessIn || "")}
                  value={line.thicknessIn}
                  onChange={(e) => change(line.id, { thicknessIn: e.target.value })}
                />
              )}
              <Input
                label="Rate per unit"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required={purchase}
                placeholder={purchase ? "" : String(item?.pricePerUnit ?? "")}
                value={line.ratePerUnit}
                onChange={(e) => change(line.id, { ratePerUnit: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <p>
                {Number.isFinite(preview.quantity) && (
                  <>
                    {formatQuantity(preview.quantity, 3)} {unitNames[item.pricingUnit]} ·{" "}
                    {Number.isFinite(preview.amount)
                      ? formatCurrency(preview.amount)
                      : "Enter a rate"}
                  </>
                )}
              </p>
              {shown.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setLines(shown.filter((row) => row.id !== line.id))}
                >
                  Remove line
                </Button>
              )}
            </div>
          </div>
        );
      })}
      <Button type="button" variant="secondary" onClick={() => setLines([...shown, newLine()])}>
        Add line
      </Button>
    </fieldset>
  );
}

export function ChargeEditor({ charges, setCharges, tax = false }) {
  function change(id, fields) {
    setCharges(charges.map((row) => (row.id === id ? { ...row, ...fields } : row)));
  }
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-bold">Charges</legend>
      {charges.map((charge) => (
        <div
          className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 p-3"
          key={charge.id}
        >
          <Select
            label="Charge type"
            value={charge.type}
            onChange={(e) => change(charge.id, { type: e.target.value })}
          >
            {["transport", "loading", "unloading", "other"].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </Select>
          <Input
            label="Charge amount (₹)"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            required
            value={charge.amount}
            onChange={(e) => change(charge.id, { amount: e.target.value })}
          />
          {tax && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={charge.taxable}
                onChange={(e) => change(charge.id, { taxable: e.target.checked })}
              />{" "}
              Taxable
            </label>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setCharges(charges.filter((row) => row.id !== charge.id))}
          >
            Remove charge
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          setCharges([
            ...charges,
            { id: crypto.randomUUID(), type: "transport", amount: "", taxable: false },
          ])
        }
      >
        Add charge
      </Button>
    </fieldset>
  );
}
