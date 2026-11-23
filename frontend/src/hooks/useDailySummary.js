import { useEffect, useState } from "react";
import { getDailySummary } from "../api/dashboard.api";
import { useAuth } from "../context/AuthContext";

export function useDailySummary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Keep the loading indicator in sync with workspace changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    getDailySummary()
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => {
        if (active) setSummary(null);
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
