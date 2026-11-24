import { useEffect, useState } from "react";
import { timberGet } from "../api/timber.api";
import { useAuth } from "./useAuth";

// Item names for filters and selectors. Same source as the sale forms:
// timber workspaces use their configured timber items, other workspaces use
// config.itemTypes, and fuel workspaces without config fall back to the fuel set.
export function useItemTypeOptions() {
  const { user } = useAuth();
  const timber = Boolean(user?.verticalFeatures?.dimensions);
  const workspaceId = user?.workspaceId;
  const [timberItems, setTimberItems] = useState(null);

  useEffect(() => {
    if (!timber) return undefined;
    let active = true;
    timberGet("/timber/items")
      .then(({ items }) => {
        if (active)
          setTimberItems({
            workspaceId,
            names: items.filter((item) => item.pricingUnit).map((item) => item.itemType),
          });
      })
      .catch(() => {
        if (active) setTimberItems({ workspaceId, names: [] });
      });
    return () => {
      active = false;
    };
  }, [timber, workspaceId]);

  const configured =
    user?.config?.itemTypes ?? (user?.verticalType === "fuel" ? ["Diesel", "Petrol", "CNG"] : []);
  if (timber) {
    const names = timberItems?.workspaceId === workspaceId ? timberItems.names : [];
    return names.length ? names : configured;
  }
  return configured;
}
