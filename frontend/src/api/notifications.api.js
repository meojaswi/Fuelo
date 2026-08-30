import client from "./client";
export async function listNotifications(p = {}) {
  const { data } = await client.get("/notifications", { params: p });
  return data;
}
export async function retryNotification(id) {
  const { data } = await client.post(`/notifications/${id}/retry`);
  return data;
}
