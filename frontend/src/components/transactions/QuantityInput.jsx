import Input from "../shared/Input";
export default function QuantityInput({ value, onChange, unit = "litres" }) {
  return (
    <Input
      label={`Quantity · ${unit}`}
      type="number"
      min="0"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0.00"
    />
  );
}
