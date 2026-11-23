import { useState } from "react";
import { generateShareLink } from "../../api/links.api";
import GenerateLinkButton from "./GenerateLinkButton";
import CopyLinkInput from "./CopyLinkInput";
export default function ShareLinkSection({ transactionId }) {
  const [l, setL] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function go() {
    setError("");
    setLoading(true);
    try {
      const d = await generateShareLink(transactionId);
      setL(new URL(d.url, window.location.origin).href);
    } catch {
      setError("Could not generate the receipt link.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="panel p-5">
      <p className="mono-label">Customer receipt</p>
      <h3 className="mt-1 font-bold">Share a receipt</h3>
      <p className="mt-1 text-sm text-slate-500">Anyone with the link can open it until it expires.</p>
      <div className="mt-4 space-y-3">
        <GenerateLinkButton onClick={go} loading={loading} />
        <CopyLinkInput link={l} />
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
