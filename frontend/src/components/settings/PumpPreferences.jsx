import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { updateDealerRequest } from "../../api/dealer.api";
import Button from "../shared/Button";
import Input from "../shared/Input";

export default function PumpPreferences() {
  const { user, updateSession } = useAuth();
  const pump = user?.verticalFeatures?.shifts;
  const [language, setLanguage] = useState(user?.language ?? "hi");
  const [threshold, setThreshold] = useState(user?.config?.shiftVarianceAlertRupees ?? 500);
  const [percent, setPercent] = useState(user?.config?.pumpVariancePercent ?? 0.5);
  const [attendantsCanDip, setAttendantsCanDip] = useState(user?.config?.attendantsCanDip === true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const dealer = await updateDealerRequest({
        language,
        ...(pump && {
          shiftVarianceAlertRupees: Number(threshold),
          pumpVariancePercent: Number(percent),
          attendantsCanDip,
        }),
      });
      updateSession({ dealer });
      setMessage({ text: "Preferences saved" });
    } catch (err) {
      setMessage({ error: true, text: err.response?.data?.error || "Could not save preferences." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel p-6">
      <h3 className="mb-4 text-lg font-bold">{pump ? "Pump settings" : "Message settings"}</h3>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">Message language</span>
          <select
            className="control min-h-11 w-full px-3 py-2"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="hi">Hinglish</option>
            <option value="en">English</option>
          </select>
        </label>
        {pump && (
          <>
            <Input
              label="Shift variance alert threshold (₹)"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              required
            />
            <Input
              label="Dip variance threshold (% of throughput)"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              required
            />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={attendantsCanDip}
                onChange={(e) => setAttendantsCanDip(e.target.checked)}
              />{" "}
              Allow attendants to record dips
            </label>
          </>
        )}
        {message && (
          <p
            role={message.error ? "alert" : "status"}
            className={message.error ? "text-sm text-red-600" : "text-sm text-emerald-700"}
          >
            {message.text}
          </p>
        )}
        <Button loading={busy}>Save preferences</Button>
      </form>
    </section>
  );
}
