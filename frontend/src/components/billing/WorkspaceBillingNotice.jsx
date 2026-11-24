import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { billingEvent } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import Modal from "../shared/Modal";

export default function WorkspaceBillingNotice() {
  const { user } = useAuth();
  return (
    <Notice
      key={user?.workspaceId}
      billing={user?.billing}
      owner={user?.permissions?.includes("billing:manage")}
    />
  );
}

function Notice({ billing, owner }) {
  const [upgrade, setUpgrade] = useState(null);
  const [nearLimit, setNearLimit] = useState(false);
  useEffect(() => {
    const onBilling = ({ detail }) => (detail.warning ? setNearLimit(true) : setUpgrade(detail));
    window.addEventListener(billingEvent, onBilling);
    return () => window.removeEventListener(billingEvent, onBilling);
  }, []);

  const text = billing?.readOnly
    ? "This workspace is read-only."
    : billing?.status === "trialing"
      ? `Trial · ${billing.trialDaysLeft} days left`
      : billing?.status === "past_due"
        ? "Payment is overdue."
        : "";
  return (
    <>
      {(text || nearLimit) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <div>
            {text}
            {nearLimit && (
              <p>80% or more of this month&apos;s transaction allowance has been used.</p>
            )}
          </div>
          {owner && (
            <Link
              className="font-semibold underline"
              to={billing?.readOnly ? "/pricing" : "/settings/billing"}
            >
              {billing?.readOnly ? "Upgrade" : "Manage billing"}
            </Link>
          )}
        </div>
      )}
      <Modal open={Boolean(upgrade)} onClose={() => setUpgrade(null)} title="Plan update needed">
        <div className="space-y-4 text-sm">
          <p>{upgrade?.error}</p>
          {owner ? (
            <Link
              className="font-semibold text-fuelo-coral"
              to="/pricing"
              onClick={() => setUpgrade(null)}
            >
              View plans
            </Link>
          ) : (
            <p>Contact your workspace owner to update the plan.</p>
          )}
        </div>
      </Modal>
    </>
  );
}
