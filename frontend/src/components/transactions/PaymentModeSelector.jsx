import PillSelector from "../shared/PillSelector";
export default function PaymentModeSelector({ value, onChange }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-600">Payment mode</p>
      <PillSelector options={["Cash", "UPI", "Credit"]} value={value} onChange={onChange} />
    </div>
  );
}
