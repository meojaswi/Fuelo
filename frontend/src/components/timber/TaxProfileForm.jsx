import { useEffect, useState } from "react";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { ErrorNotice } from "./TimberForms";
import { useAuth } from "../../context/AuthContext";
import { timberGet, timberSend, timberError } from "../../api/timber.api";

export default function TaxProfileForm() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    timberGet("/timber/tax-profile")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active) setError(timberError(err, "Could not load tax settings."));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel p-5">
      <h3 className="mb-2 text-lg font-bold">Timber tax profile</h3>
      <p className="mb-4 text-sm text-slate-600">
        Tax settings are set by you. Confirm rates, HSN codes and invoice format with your CA.
      </p>
      <ErrorNotice>{error}</ErrorNotice>
      {data && <TaxFields data={data} />}
    </section>
  );
}

function TaxFields({ data }) {
  const { user, updateSession } = useAuth();
  const [draft, setDraft] = useState({
    taxRegistered: false,
    gstin: "",
    legalName: "",
    address: "",
    invoicePrefix: "INV",
    ...data.profile,
    chargeGstRatePercent: data.profile?.chargeGstRatePercent ?? "",
    pricesIncludeTax: data.pricesIncludeTax,
  });
  const [advances, setAdvances] = useState(data.allowAdvances);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  function field(name, value) {
    setDraft({ ...draft, [name]: value });
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = {
        taxRegistered: draft.taxRegistered,
        pricesIncludeTax: draft.pricesIncludeTax,
        allowAdvances: advances,
        invoicePrefix: draft.invoicePrefix,
        chargeGstRatePercent:
          draft.chargeGstRatePercent === "" ? null : Number(draft.chargeGstRatePercent),
        ...Object.fromEntries(
          ["gstin", "legalName", "address"]
            .filter((key) => draft[key].trim())
            .map((key) => [key, draft[key]])
        ),
      };
      const { profile, config } = await timberSend("put", "/timber/tax-profile", form);
      updateSession({
        dealer: { workspaceId: user.workspaceId, taxRegistered: profile.taxRegistered, config },
      });
      setNotice("Timber settings saved.");
    } catch (err) {
      setError(timberError(err, "Could not save timber settings."));
    } finally {
      setBusy(false);
    }
  }
  const state = data.states[draft.gstin.slice(0, 2)];
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        <input
          type="checkbox"
          checked={draft.taxRegistered}
          onChange={(e) => field("taxRegistered", e.target.checked)}
        />{" "}
        GST registered
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="GSTIN"
          maxLength={15}
          required={draft.taxRegistered}
          value={draft.gstin}
          onChange={(e) => field("gstin", e.target.value.toUpperCase())}
        />
        <Input
          label="Legal name"
          required={draft.taxRegistered}
          value={draft.legalName}
          onChange={(e) => field("legalName", e.target.value)}
        />
        <Input
          label="Registered address"
          required={draft.taxRegistered}
          value={draft.address}
          onChange={(e) => field("address", e.target.value)}
        />
        <Input
          label="Invoice prefix"
          pattern="[A-Za-z0-9\-]{1,4}"
          maxLength={4}
          required
          value={draft.invoicePrefix}
          onChange={(e) => field("invoicePrefix", e.target.value.toUpperCase())}
        />
        <Input
          label="GST rate for taxable charges (%)"
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="0.01"
          value={draft.chargeGstRatePercent}
          onChange={(e) => field("chargeGstRatePercent", e.target.value)}
        />
      </div>
      {state && <p className="text-sm">GSTIN state {state}</p>}
      <label className="block text-sm">
        <input
          type="checkbox"
          checked={draft.pricesIncludeTax}
          onChange={(e) => field("pricesIncludeTax", e.target.checked)}
        />{" "}
        Prices include GST
      </label>
      <label className="block text-sm">
        <input type="checkbox" checked={advances} onChange={(e) => setAdvances(e.target.checked)} />{" "}
        Allow customer advances
      </label>
      <ErrorNotice>{error}</ErrorNotice>
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      <Button loading={busy}>Save timber settings</Button>
    </form>
  );
}
