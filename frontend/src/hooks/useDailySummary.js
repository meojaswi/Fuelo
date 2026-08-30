import { useEffect, useState } from "react";
import { getDailySummary } from "../api/dashboard.api";
import { useAuth } from "../context/AuthContext";

export function useDailySummary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getDailySummary()
      .then((data) => {
        if (active) setSummary(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.workspaceId]);

  return { summary, loading };
}
