import client from "./client";
export async function autocompleteCustomers(q) {
  const { data } = await client.get("/customers/autocomplete", { params: { q } });
  return data;
}
