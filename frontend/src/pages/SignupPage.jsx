import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PhoneInput from "../components/shared/PhoneInput";
import Input from "../components/shared/Input";
import Button from "../components/shared/Button";
import MotionWord from "../components/shared/MotionWord";
import HighlightPill from "../components/shared/HighlightPill";
import LoginFooter from "../components/shared/LoginFooter";
import LoginHeader from "../components/shared/LoginHeader";

const ONBOARDING_TICKS = [
  "Workspace created · Fuelo",
  "WhatsApp linked",
  "First item type added",
  "Credit tracking on",
  "First receipt sent",
  "Daily summary scheduled",
];

const VERTICALS = [
  { value: "fuel", label: "Fuel" },
  { value: "timber", label: "Timber" },
  { value: "construction", label: "Construction" },
  { value: "kirana", label: "Kirana" },
  { value: "other", label: "Other" },
];

export default function SignupPage() {
  const { signup, loading } = useAuth(),
    n = useNavigate(),
    [businessName, setBusinessName] = useState(""),
    [phone, setPhone] = useState(""),
    [verticalType, setVerticalType] = useState("fuel"),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    try {
      await signup({ businessName, phone, verticalType, password });
      n("/", { replace: true });
    } catch (e) {
      setError(
        e.response?.data?.error ||
          e.response?.data?.message ||
          e.message ||
          "Unable to create workspace."
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-fuelo-surface text-white">
      <LoginHeader />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-center">
          <div className="grid w-full overflow-hidden rounded-none bg-white text-fuelo-ink shadow-2xl md:grid-cols-2">
            {/* Left panel */}
            <div className="relative hidden min-h-[680px] flex-col justify-between overflow-hidden bg-fuelo-surface p-10 md:flex">
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

              <div className="relative animate-fade-up" />

              <div className="relative">
                <p className="mono-label animate-fade-up text-fuelo-coral [animation-delay:80ms]">
                  New workspace
                </p>
                <h1 className="mt-3 max-w-sm animate-fade-up text-4xl font-bold leading-tight text-white [animation-delay:150ms]">
                  Set up your ledger in <MotionWord text="minutes" className="inline-block" />.
                </h1>
                <p className="mt-4 max-w-sm animate-fade-up text-sm leading-6 text-white/45 [animation-delay:240ms]">
                  One place for <HighlightPill>every sale</HighlightPill>,{" "}
                  <HighlightPill>every credit</HighlightPill> and{" "}
                  <HighlightPill>every WhatsApp receipt.</HighlightPill>
                </p>

                <div className="relative mt-8 animate-fade-up overflow-hidden [animation-delay:340ms]">
                  <div className="flex w-max animate-marquee gap-6 whitespace-nowrap">
                    {[...ONBOARDING_TICKS, ...ONBOARDING_TICKS].map((tick, i) => (
                      <span key={i} className="font-mono text-[11px] text-emerald-400/60">
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
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-[0.035]"
                style={{
                  backgroundImage: "radial-gradient(#0f172a 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                }}
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-fuelo-coral/[0.06] blur-[80px]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-6 top-6 h-4 w-4 border-r-2 border-t-2 border-fuelo-coral/25"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-6 left-6 h-4 w-4 border-b-2 border-l-2 border-fuelo-coral/25"
              />

              <div className="relative mb-8 animate-[fade-in-up_600ms_cubic-bezier(0.22,1,0.36,1)_200ms_both] bg-fuelo-coral/35 p-6 text-center">
                <div className="mb-3 h-[2px] w-8 bg-fuelo-coral/60" />
                <p className="mono-label">Start free</p>
                <h2 className="mt-2 text-2xl font-bold">
                  Create your workspace<span className="text-fuelo-coral">.</span>
                </h2>
                <p className="mt-2 text-sm text-slate-500">A ledger built for your business.</p>
              </div>

              <form
                onSubmit={submit}
                className="relative animate-fade-up space-y-4 [animation-delay:100ms]"
              >
                <Input
                  label="Business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />

                <PhoneInput value={phone} onChange={(e) => setPhone(e.target.value)} required />

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Business type
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {VERTICALS.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => setVerticalType(v.value)}
                        className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                          verticalType === v.value
                            ? "border-fuelo-coral bg-fuelo-coral/10 text-fuelo-coral"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Input
                  label="Confirm password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                  Create workspace
                </Button>
              </form>

              <p className="relative mt-6 text-center text-sm text-slate-500">
                Already have a workspace?{" "}
                <Link to="/login" className="font-medium text-fuelo-coral hover:underline">
                  Sign in
                </Link>
              </p>

              <p className="relative mt-6 animate-fade-up text-center font-mono text-[10px] text-slate-400 [animation-delay:180ms]">
                Secure workspace access
              </p>
            </div>
          </div>
        </div>
      </main>

      <LoginFooter />
    </div>
  );
}
