import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PhoneInput from "../components/shared/PhoneInput";
import Input from "../components/shared/Input";
import Button from "../components/shared/Button";
import MotionWord from "../components/shared/MotionWord";
import HighlightPill from "../components/shared/HighlightPill";

const LEDGER_TICKS = [
  "+₹2,400 · Sharma Traders",
  "-₹860 · Fuel restock",
  "+₹1,120 · Credit cleared",
  "+₹3,050 · Rao & Sons",
  "-₹430 · Refund",
  "+₹960 · Verma Motors",
];

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
      setError(
        e.response?.data?.error || e.response?.data?.message || e.message || "Unable to sign in."
      );
    }
  }

  return (
    <main className="min-h-screen bg-fuelo-surface p-4 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-none bg-white text-fuelo-ink shadow-2xl md:grid-cols-2">
          {/* Left panel */}
          <div className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-fuelo-surface p-10 md:flex">
            {/* Ambient grid texture */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 animate-glow-pulse rounded-full bg-fuelo-coral/20 blur-[100px]"
            />

            <div className="relative animate-fade-up">
              <div className="text-2xl text-white/25">
                fuelo<span className="text-fuelo-coral">.</span>
              </div>
              <p className="mono-label mt-2 text-white/40">ledger infrastructure</p>
            </div>

            <div className="relative">
              <p className="mono-label animate-fade-up text-fuelo-coral [animation-delay:80ms]">
                Workspace ledger
              </p>
              <h1 className="mt-3 max-w-sm animate-fade-up text-4xl font-bold leading-tight text-white [animation-delay:150ms]">
                Keep every transaction in <MotionWord text="motion" className="inline-block" />.
              </h1>
              <p className="mt-4 max-w-sm animate-fade-up text-sm leading-6 text-white/45 [animation-delay:240ms]">
                A focused workspace for <HighlightPill>recording sales</HighlightPill>,{" "}
                <HighlightPill>tracking payments</HighlightPill> and keeping{" "}
                <HighlightPill>customers informed.</HighlightPill>
              </p>

              {/* Live ledger ticker */}
              <div className="relative mt-8 animate-fade-up overflow-hidden [animation-delay:340ms]">
                <div className="flex w-max animate-marquee gap-6 whitespace-nowrap">
                  {[...LEDGER_TICKS, ...LEDGER_TICKS].map((tick, i) => (
                    <span
                      key={i}
                      className={`font-mono text-[11px] ${
                        tick.startsWith("+") ? "text-emerald-400/60" : "text-fuelo-coral/60"
                      }`}
                    >
                      {tick}
                    </span>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-fuelo-surface to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-fuelo-surface to-transparent" />
              </div>
            </div>

            <span className="relative font-mono text-[10px] text-white/25">Fuelo v1.0.0</span>
          </div>

          {/* Right panel */}
          <div className="relative overflow-hidden bg-white p-7 sm:p-10">
            {/* Faint dot texture */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.035]"
              style={{
                backgroundImage: "radial-gradient(#0f172a 1px, transparent 1px)",
                backgroundSize: "18px 18px",
              }}
            />
            {/* Soft coral wash, top-right */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-fuelo-coral/[0.06] blur-[80px]"
            />

            {/* Corner brackets — ledger/stamp motif */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-6 top-6 h-4 w-4 border-r-2 border-t-2 border-fuelo-coral/25"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-6 left-6 h-4 w-4 border-b-2 border-l-2 border-fuelo-coral/25"
            />

            <div className="relative mb-10 animate-fade-up [animation-delay:20ms] bg-fuelo-coral/20 p-4 text-center">
              <div className="relative mb-10 animate-fade-up">
                <div className="mb-3 h-[2px] w-8 bg-fuelo-coral/60" />
                <p className="mono-label">Welcome back</p>
                <h2 className="mt-2 text-2xl font-bold">
                  Sign in to fuelo<span className="text-fuelo-coral ">.</span>
                </h2>
                <p className="mt-2 text-sm text-slate-500">Continue to your workspace.</p>
              </div>
            </div>

            <form
              onSubmit={submit}
              className="relative animate-fade-up space-y-5 [animation-delay:100ms]"
            >
              <PhoneInput value={phone} onChange={(e) => setPhone(e.target.value)} required />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && (
                <p className="animate-fade-up rounded-[8px] bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}
              <Button
                loading={loading}
                className="w-full transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]"
              >
                Sign in
              </Button>
            </form>

            <p className="relative mt-8 animate-fade-up text-center font-mono text-[10px] text-slate-400 [animation-delay:180ms]">
              Secure workspace access
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
