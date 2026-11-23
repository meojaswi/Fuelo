import client from "./client";
export async function autocompleteCustomers(q) {
  const { data } = await client.get("/customers/autocomplete", { params: { q } });
  return data;
}

export async function getOutstanding() {
  const { data } = await client.get("/customers/outstanding");
  return data;
}

export async function getCustomer(id) {
  const { data } = await client.get(`/customers/${id}`);
  return data;
}

export async function getCustomerLedger(id, page) {
  const { data } = await client.get(`/customers/${id}/ledger`, { params: { page } });
  return data;
}

export async function recordCustomerPayment(id, body) {
  const { data } = await client.post(`/customers/${id}/payments`, body);
  return data;
}
