import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { acceptInvite } from "../api/members.api";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";

export default function AcceptInvitePage() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await acceptInvite({ token, ...(password ? { password } : {}), ...(name ? { name } : {}) });
      setAccepted(true);
    } catch (err) {
      setError(err.response?.data?.error || "Could not accept this invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <div className="panel w-full max-w-md space-y-5 p-6">
        <div>
          <p className="mono-label">Fuelo workspace</p>
          <h1 className="mt-2 text-2xl font-bold">Accept invitation</h1>
        </div>
        {accepted ? (
          <div className="space-y-3">
            <p>Invitation accepted.</p>
            <Link to="/login" className="font-semibold text-fuelo-coral">
              Sign in to Fuelo
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">
              New to Fuelo? Set a password here. If you have an account, accept the invite and sign
              in with your current password.
            </p>
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <Button loading={busy}>Accept invitation</Button>
          </form>
        )}
      </div>
    </main>
  );
}
