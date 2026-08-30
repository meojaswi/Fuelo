import Input from "../shared/Input";
export default function CustomerSearchInput({ value, onChange }) {
  return (
    <Input
      label="Customer"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search customer..."
    />
  );
}
