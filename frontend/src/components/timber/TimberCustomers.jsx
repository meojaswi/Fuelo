import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { autocompleteCustomers } from "../../api/customers.api";
import { timberSend, timberError } from "../../api/timber.api";
import { ErrorNotice } from "./TimberForms";
import Button from "../shared/Button";
import Input from "../shared/Input";

export default function TimberCustomers() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    gstin: "",
    billingAddress: "",
    state: "",
  });
  const [matches, setMatches] = useState([]);
  const [mode, setMode] = useState("find");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "find") {
        const result = await autocompleteCustomers(draft.name);
        setMatches(result.customers);
        if (!result.customers.length) setError("No matching customers.");
      } else {
        const fields = Object.fromEntries(
          Object.entries(draft).filter(([, value]) => value.trim())
        );
        if (/^\d{10}$/.test(fields.phone)) fields.phone = "+91" + fields.phone;
        const customer = await timberSend("post", "/customers", {
          ...fields,
          isCreditCustomer: true,
        });
        navigate("/credit/" + customer._id);
      }
    } catch (err) {
      setError(timberError(err, "Could not open customer account."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel p-4">
      <summary className="cursor-pointer py-3 font-semibold">Find or add a customer account</summary>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setMode("find")}>
          Find customer
        </Button>
        <Button type="button" variant="secondary" onClick={() => setMode("add")}>
          Add customer
        </Button>
      </div>
      <form className="mt-3 space-y-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          {(mode === "find"
            ? [["name", "Customer name"]]
            : [
                ["name", "Customer name"],
                ["phone", "Phone"],
                ["gstin", "GSTIN"],
                ["billingAddress", "Billing address"],
                ["state", "GST state code"],
              ]
          ).map(([key, label]) => (
            <Input
              key={key}
              label={label}
              required={key === "name" || key === "phone"}
              inputMode={key === "phone" ? "tel" : undefined}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          ))}
        </div>
        <Button loading={busy}>{mode === "find" ? "Search" : "Create customer account"}</Button>
        <ErrorNotice>{error}</ErrorNotice>
      </form>
      {mode === "find" && (
        <ul className="mt-2 space-y-1">
          {matches.map((row) => (
            <li key={row._id}>
              <Link className="text-sm font-semibold text-fuelo-coral" to={"/credit/" + row._id}>
                {row.name} · {row.phone}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
