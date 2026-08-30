import { useCallback, useEffect, useState } from "react";
import { createTransaction, getTransaction, listTransactions } from "../api/transactions.api";
export function useTransactions(params = {}) {
  const [data, setData] = useState({ items: [], pages: 1, page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await listTransactions(params);
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
  }, [JSON.stringify(params)]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { ...data, loading, error, refresh };
}
export function useTransaction(id) {
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getTransaction(id)
      .then(setTransaction)
      .finally(() => setLoading(false));
  }, [id]);
  return { transaction, loading };
}
export { createTransaction };
