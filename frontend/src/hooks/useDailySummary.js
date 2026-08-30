import { useEffect, useState } from "react";
import { getDailySummary } from "../api/dashboard.api";
export function useDailySummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getDailySummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);
  return { summary, loading };
}
