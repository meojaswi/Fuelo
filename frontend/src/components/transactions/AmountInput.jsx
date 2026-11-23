import Input from "../shared/Input";
import { formatCurrency } from "../../utils/formatters";
export default function AmountInput({ value, onChange, quantity, rate }) {
  return (
    <div>
      <Input
        label="Amount"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
      />
      {rate && (
        <p className="mt-1 font-mono text-[10px] text-slate-400">
          Auto: {formatCurrency(Number(quantity || 0) * Number(rate))}
        </p>
      )}
    </div>
  );
}
