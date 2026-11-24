import { useCallback, useEffect, useState } from "react";
import { createTransaction, getTransaction, listTransactions } from "../api/transactions.api";
import { useAuth } from "./useAuth";

export function useTransactions(params = {}) {
  const { user } = useAuth();
  const [data, setData] = useState({ items: [], pages: 1, page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = JSON.stringify(params);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await listTransactions(JSON.parse(query));
      setData({
        items: d.items || d.transactions || [],
        pages: d.pages || 1,
        page: d.page || 1,
        total: d.total || 0,
      });
      setError("");
    } catch (e) {
      setError(e.response?.data?.message || "Unable to load transactions");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh, user?.workspaceId]);

  return { ...data, loading, error, refresh };
}

export function useTransaction(id) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    getTransaction(id)
      .then((transaction) => {
        if (active) setResult({ id, attempt, transaction });
      })
      .catch((err) => {
        if (active)
          setResult({ id, attempt, transaction: null, notFound: err.response?.status === 404 });
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  const current = result?.id === id && result.attempt === attempt ? result : null;
  return {
    transaction: current?.transaction ?? null,
    loading: !current,
    notFound: Boolean(current?.notFound),
    reload: () => setAttempt((value) => value + 1),
  };
}
export { createTransaction };
