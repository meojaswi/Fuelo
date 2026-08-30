import { useEffect, useState } from "react";
import { autocompleteCustomers } from "../api/customers.api";
export function useCustomerAutocomplete(q) {
  const [data, setData] = useState([]);
  useEffect(() => {
    if (!q || q.length < 2) return setData([]);
    const t = setTimeout(
      () =>
        autocompleteCustomers(q)
          .then((d) => setData(d.items || d.customers || []))
          .catch(() => setData([])),
      250
    );
    return () => clearTimeout(t);
  }, [q]);
  return data;
}
