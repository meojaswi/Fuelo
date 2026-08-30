import client from "./client";

export async function updateDealerRequest(payload) {
  const { data } = await client.patch("/dealer", payload);
  return data;
}
