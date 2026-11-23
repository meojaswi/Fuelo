import { useState } from "react";
import { requestPasswordCode, verifyPasswordCode } from "../../api/auth.api";
import Button from "../shared/Button";
import Input from "../shared/Input";
import Modal from "../shared/Modal";
import PhoneInput from "../shared/PhoneInput";

export default function ForgotPassword({ onClose, initialPhone }) {
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [requested, setRequested] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const { data } = await requestPasswordCode(phone);
    setRequested(true);
    setNotice(data.message);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!requested) await send();
      else {
        await verifyPasswordCode({ phone, code, password });
        onClose("Password reset. Sign in with your new password.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Could not complete password reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="Reset password" onClose={() => onClose()}>
      <form className="space-y-4 text-fuelo-ink" onSubmit={submit}>
        <PhoneInput
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={requested}
          required
        />
        {notice && <p className="text-sm text-slate-600">{notice}</p>}
        {requested && (
          <>
            <Input
              label="WhatsApp code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              pattern="[0-9]{6}"
              required
            />
            <Input
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button loading={busy}>{requested ? "Reset password" : "Send WhatsApp code"}</Button>
        {requested && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setError("");
              send().catch((err) =>
                setError(err.response?.data?.error || "Could not resend the code.")
              );
            }}
          >
            Resend code
          </Button>
        )}
      </form>
    </Modal>
  );
}
