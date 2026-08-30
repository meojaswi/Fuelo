import client from "./client";
export async function generateShareLink(id) {
  const { data } = await client.post(`/transactions/${id}/share-link`);
  return data;
}
export async function resolveShareLink(token) {
  const { data } = await client.get(`/public/receipts/${token}`);
  return data;
}
