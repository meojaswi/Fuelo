export const formatCurrency = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
export const formatQuantity = (v) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(v || 0));
export const formatDate = (v, o = {}) =>
  v ? new Intl.DateTimeFormat("en-IN", o).format(new Date(v)) : "—";
