export const formatCurrency = (v, { whole = false } = {}) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { maximumFractionDigits: 2 }),
  }).format(Number(v || 0));
export const formatQuantity = (v, maxFractionDigits = 2) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: maxFractionDigits }).format(Number(v || 0));
export const formatDate = (v, o = {}) =>
  v ? new Intl.DateTimeFormat("en-IN", o).format(new Date(v)) : "—";
