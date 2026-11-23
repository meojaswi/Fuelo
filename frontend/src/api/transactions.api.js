import client from "./client";
export async function createTransaction(p) {
  const { data } = await client.post("/transactions", p);
  return data;
}
export async function listTransactions(p = {}) {
  const { data } = await client.get("/transactions", { params: p });
  return data;
}
export async function voidTransaction(id, reason) {
  const { data } = await client.post(`/transactions/${id}/void`, { reason });
  return data;
}
export async function getReceiptPdf(id) {
  const { data } = await client.get(`/transactions/${id}/receipt.pdf`, { responseType: "blob" });
  return data;
}
export async function getTransaction(id) {
  const { data } = await client.get(`/transactions/${id}`);
  return data;
}
