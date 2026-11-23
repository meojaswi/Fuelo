import { useCallback, useEffect, useState } from "react";
import { fetchInventory } from "../api/inventory.api";
import { listMembers } from "../api/members.api";
import { getPump } from "../api/pump.api";
import { timberGet } from "../api/timber.api";
import { listTransactions } from "../api/transactions.api";
import { useAuth } from "../context/AuthContext";

// Each step: where to go, who can do it, and how to tell it is done from real data.
const STEPS = [
  {
    id: "items",
    title: "Set up your items and prices",
    hint: "Add what you sell, with its unit and price.",
    to: "/inventory",
    permission: "inventory:write",
    check: async (user) =>
      user.verticalFeatures?.dimensions
        ? (await timberGet("/timber/items")).items.some((item) => item.pricingUnit)
        : (await fetchInventory()).some((item) => Number(item.pricePerUnit) > 0),
  },
  {
    id: "tank",
    title: "Add a tank and a nozzle",
    hint: "Needed before you can open a shift.",
    to: "/pump/tanks",
    permission: "tanks:manage",
    feature: "tanks",
    check: async () => {
      const [tanks, nozzles] = await Promise.all([getPump("/tanks"), getPump("/nozzles")]);
      return tanks.tanks.length > 0 && nozzles.nozzles.length > 0;
    },
  },
  {
    id: "supplier",
    title: "Add a supplier",
    hint: "Who you buy timber from.",
    to: "/timber/suppliers",
    permission: "suppliers:manage",
    feature: "suppliers",
    check: async () => (await timberGet("/suppliers")).suppliers.length > 0,
  },
  {
    id: "purchase",
    title: "Record a purchase",
    hint: "Receive stock so you can sell it.",
    to: "/timber/purchases",
    permission: "purchases:create",
    feature: "purchases",
    check: async () => (await timberGet("/purchases", { limit: 1 })).purchases.length > 0,
  },
  {
    id: "sale",
    title: "Record your first sale",
    hint: "Fuelo sends the receipt to your customer.",
    to: "/transactions/new",
    permission: "transactions:create",
    check: async () => {
      const result = await listTransactions({ limit: 1 });
      return (result.total || (result.items || result.transactions || []).length) > 0;
    },
  },
  {
    id: "team",
    title: "Invite a team member",
    hint: "Optional. Give your staff their own login.",
    to: "/members",
    permission: "members:manage",
    optional: true,
    check: async () => (await listMembers()).length > 1,
  },
];

const hiddenKey = (workspaceId) => `fuelo_onboarding_hidden_${workspaceId}`;
function readHidden(workspaceId) {
  try {
    return localStorage.getItem(hiddenKey(workspaceId)) === "1";
  } catch {
    return false;
  }
}

export function useOnboarding() {
  const { user } = useAuth();
  const workspaceId = user?.workspaceId;
  const [result, setResult] = useState(null);
  const [hiddenFor, setHiddenFor] = useState(null);

  const visible = STEPS.filter(
    (step) =>
      user?.permissions?.includes(step.permission) &&
      (!step.feature || user?.verticalFeatures?.[step.feature])
  );
  const stepKey = visible.map((step) => step.id).join(",");
  const hidden = hiddenFor === workspaceId || readHidden(workspaceId);

  useEffect(() => {
    if (!workspaceId || hidden) return undefined;
    let active = true;
    Promise.allSettled(visible.map((step) => step.check(user))).then((outcomes) => {
      if (!active) return;
      setResult({
        workspaceId,
        steps: visible.map((step, index) => ({
          ...step,
          done: outcomes[index].status === "fulfilled" && outcomes[index].value === true,
        })),
      });
    });
    return () => {
      active = false;
    };
    // visible and user are derived from workspaceId and stepKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, stepKey, hidden]);

  const hide = useCallback(() => {
    try {
      localStorage.setItem(hiddenKey(workspaceId), "1");
    } catch {
      /* The card still hides for this visit. */
    }
    setHiddenFor(workspaceId);
  }, [workspaceId]);

  const steps = result?.workspaceId === workspaceId ? result.steps : null;
  return { steps, hidden, hide };
}
