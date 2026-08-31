import { useState } from "react";
import { Link } from "react-router-dom";
import MotionWord from "../components/shared/MotionWord";
import HighlightPill from "../components/shared/HighlightPill";
import LoginFooter from "../components/shared/LoginFooter";
import LoginHeader from "../components/shared/LoginHeader";

const PLANS = [
  {
    name: "Starter",
    tagline: "For a single counter",
    monthly: 499,
    yearly: 4990,
    cap: "300 transactions / mo",
    features: [
      "WhatsApp receipts",
      "1 workspace, 1 login",
      "Daily summary message",
      "One-time share links",
    ],
  },
  {
    name: "Growth",
    tagline: "For a busy pump or yard",
    monthly: 999,
    yearly: 9990,
    cap: "1,500 transactions / mo",
    features: [
      "Everything in Starter",
      "PDF receipts",
      "Credit customer tracking",
      "SMS fallback on failure",
    ],
    highlighted: true,
  },
  {
    name: "Business",
    tagline: "For multiple sites",
    monthly: 1999,
    yearly: 19990,
    cap: "Unlimited transactions",
    features: [
      "Everything in Growth",
      "Multiple item verticals",
      "Priority support",
      "Custom message templates",
    ],
  },
];

function formatINR(n) {
  return n.toLocaleString("en-IN");
}

export default function PricingPage() {
  const [cycle, setCycle] = useState("monthly"); // "monthly" | "yearly"

  return (
    <div className="flex min-h-screen flex-col bg-fuelo-surface text-white">
      <LoginHeader />

      <main className="relative flex-1 overflow-hidden">
        {/* Ambient texture, matching login/signup */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 animate-glow-pulse rounded-full bg-fuelo-coral/15 blur-[120px]"
        />

        <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-20">
          {/* Header */}
          <div className="mx-auto max-w-xl text-center">
            <h1 className="mt-3 animate-fade-up text-4xl font-bold leading-tight [animation-delay:150ms] sm:text-5xl">
              One ledger. <MotionWord text="No surprises." className="inline-block" />
            </h1>
            <p className="mt-4 animate-fade-up text-sm leading-6 text-white/45 [animation-delay:240ms]">
              Every plan includes <HighlightPill>WhatsApp receipts</HighlightPill>,{" "}
              <HighlightPill>credit tracking</HighlightPill> and{" "}
              <HighlightPill>daily summaries.</HighlightPill> Pick the transaction volume that fits
              your counter.
            </p>
          </div>

          {/* Billing cycle toggle */}
          <div className="mx-auto mt-10 flex w-fit animate-fade-up items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 [animation-delay:300ms]">
            <button
              onClick={() => setCycle("monthly")}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                cycle === "monthly" ? "bg-white text-fuelo-ink" : "text-white/60 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors ${
                cycle === "yearly" ? "bg-white text-fuelo-ink" : "text-white/60 hover:text-white"
              }`}
            >
              Yearly
              <span className="rounded-full bg-fuelo-coral/20 px-2 py-0.5 text-[10px] text-fuelo-coral">
                2 months free
              </span>
            </button>
          </div>

          {/* Plan cards, styled as receipt stubs */}
          <div className="mx-auto mt-12 grid gap-6 sm:grid-cols-3">
            {PLANS.map((plan, i) => {
              const price = cycle === "monthly" ? plan.monthly : plan.yearly;
              const period = cycle === "monthly" ? "/ month" : "/ year";

              return (
                <div
                  key={plan.name}
                  className={`relative animate-fade-up bg-white text-fuelo-ink [animation-delay:${380 + i * 80}ms] ${
                    plan.highlighted ? "sm:-translate-y-3 sm:shadow-2xl" : "shadow-lg"
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-fuelo-coral px-3 py-1 font-mono text-[10px] text-white">
                      Most picked
                    </div>
                  )}

                  {/* Perforated top edge — receipt motif */}
                  <div className="border-b-2 border-dashed border-slate-200 px-6 pb-5 pt-7">
                    <p className="mono-label text-slate-400">{plan.tagline}</p>
                    <h3 className="mt-1 text-xl font-bold">{plan.name}</h3>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="font-mono text-3xl font-bold">₹{formatINR(price)}</span>
                      <span className="text-sm text-slate-400">{period}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-400">{plan.cap}</p>
                  </div>

                  <div className="px-6 py-6">
                    <ul className="space-y-3">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
                          <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-fuelo-coral" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <Link
                      to="/signup"
                      className="mt-6 block w-full rounded-none border border-fuelo-coral/40 px-2.5 py-1.5 text-center text-sm font-medium text-fuelo-ink transition hover:border-fuelo-coral hover:bg-fuelo-coral/10"
                    >
                      Get started
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mx-auto mt-10 max-w-lg animate-fade-up text-center font-mono text-[11px] text-white/30 [animation-delay:700ms]">
            Prices exclude GST. Message costs beyond your plan's cap are billed at actuals.
          </p>
        </div>
      </main>

      <LoginFooter />
    </div>
  );
}
