import client from "./client";

export async function fetchInventory() {
  const { data } = await client.get("/inventory");
  return data;
}

export async function createInventoryItem(payload) {
  const { data } = await client.post("/inventory", payload);
  return data;
}

export async function updateInventoryItem(itemType, payload) {
  const { data } = await client.patch(`/inventory/${encodeURIComponent(itemType)}`, payload);
  return data;
}

export async function deleteInventoryItem(itemType) {
  const { data } = await client.delete(`/inventory/${encodeURIComponent(itemType)}`);
  return data;
}
