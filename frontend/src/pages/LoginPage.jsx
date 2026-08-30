import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PhoneInput from "../components/shared/PhoneInput";
import Input from "../components/shared/Input";
import Button from "../components/shared/Button";
export default function LoginPage() {
  const { login, loading } = useAuth(),
    n = useNavigate(),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(phone, password);
      n("/", { replace: true });
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || e.message || "Unable to sign in.");
    }
  }
  return (
    <main className="min-h-screen bg-fuelo-surface p-4 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[8px] bg-white text-fuelo-ink shadow-float md:grid-cols-2">
          <div className="hidden min-h-[620px] flex-col justify-between bg-fuelo-surface p-10 md:flex">
            <div>
              <div className="text-2xl font-black">
                fuelo<span className="text-fuelo-coral">.</span>
              </div>
              <p className="mono-label mt-2 text-white/40">
                ledger infrastructure
              </p>
            </div>
            <div>
              <p className="mono-label text-fuelo-coral">Workspace ledger</p>
              <h1 className="mt-3 max-w-sm text-4xl font-bold leading-tight text-white">
                Keep every transaction in motion.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/45">
                A focused workspace for recording sales, tracking payments and
                keeping customers informed.
              </p>
            </div>
            <span className="font-mono text-[10px] text-white/25">
              FUelo / 01
            </span>
          </div>
          <div className="p-7 sm:p-10">
            <div className="mb-10">
              <p className="mono-label">Welcome back</p>
              <h2 className="mt-2 text-2xl font-bold">Sign in to Fuelo.</h2>
              <p className="mt-2 text-sm text-slate-500">
                Continue to your workspace.
              </p>
            </div>
            <form onSubmit={submit} className="space-y-5">
              <PhoneInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && (
                <p className="rounded-[8px] bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}
              <Button loading={loading} className="w-full">
                Sign in
              </Button>
            </form>
            <p className="mt-8 text-center font-mono text-[10px] text-slate-400">
              Secure workspace access
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
