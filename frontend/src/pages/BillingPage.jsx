import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cancelBilling, getBilling } from "../api/billing.api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/shared/Button";
import { formatDate } from "../utils/formatters";

export default function BillingPage() {
  const { user } = useAuth();
  return <Billing key={user?.workspaceId} />;
}

function Usage({ label, used, limit }) {
  return (
    <div className="space-y-2">
      <p className="flex justify-between text-sm">
        <span>{label}</span>
        <strong>
          {used} / {limit ?? "Unlimited"}
        </strong>
      </p>
      {limit != null && (
        <progress
          className="w-full accent-fuelo-coral"
          max={Math.max(limit, 1)}
          value={Math.min(limit, used)}
          aria-label={label}
        />
      )}
    </div>
  );
}

function Billing() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getBilling()
      .then((data) => active && setInfo(data))
      .catch(() => active && setError("Could not load billing."));
    return () => {
      active = false;
    };
  }, []);

  async function cancel() {
    if (
      !window.confirm(
        info.canCancel
          ? "Cancel the plan at the end of the current cycle?"
          : "Cancel the pending checkout?"
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await cancelBilling();
      setInfo(await getBilling());
    } catch (err) {
      setError(err.response?.data?.error || "Could not cancel the subscription.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="mono-label">Workspace settings</p>
        <h2 className="mt-2 text-2xl font-bold">Billing</h2>
      </header>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!info && !error && <p className="text-sm text-slate-500">Loading billing…</p>}
      {info && (
        <>
          <div className="panel space-y-5 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="mono-label">Current plan</p>
                <h3 className="mt-1 text-lg font-bold">{info.planName}</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize">
                {info.status.replace("_", " ")}
              </span>
            </div>
            <Usage
              label="Transactions this month"
              used={info.usage.transactions}
              limit={info.limits.monthlyTransactionCap}
            />
            <Usage
              label="Members and pending invites"
              used={info.usage.members}
              limit={info.limits.maxUsers}
            />
            {info.status === "trialing" && (
              <p className="text-sm text-slate-600">{info.trialDaysLeft} trial days left.</p>
            )}
            {info.nextRenewal && (
              <p className="text-sm text-slate-600">
                {info.cancelAtCycleEnd ? "Access ends" : "Current cycle ends"}{" "}
                {formatDate(info.nextRenewal, { dateStyle: "medium", timeZone: "Asia/Kolkata" })}.
              </p>
            )}
            {info.scheduledPlan && (
              <p className="text-sm text-slate-600">
                {info.scheduledPlan.name} ({info.scheduledPlan.billingCycle}) is scheduled for the
                next cycle.
              </p>
            )}
            {info.checkoutPending && (
              <p className="text-sm text-slate-600">
                Checkout is pending. Select the same plan to resume.
              </p>
            )}
            {info.readOnly && (
              <p className="text-sm font-semibold text-amber-800">This workspace is read-only.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <Link
              className="rounded-lg bg-fuelo-ink px-4 py-2.5 text-sm font-semibold text-white"
              to="/pricing"
            >
              View plans
            </Link>
            {((info.canCancel && !info.cancelAtCycleEnd) || info.checkoutPending) && (
              <Button loading={busy} type="button" variant="secondary" onClick={cancel}>
                {info.canCancel ? "Cancel at cycle end" : "Cancel pending checkout"}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
