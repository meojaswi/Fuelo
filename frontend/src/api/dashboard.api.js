import client from "./client";
export async function getDailySummary() {
  const { data } = await client.get("/dashboard/daily-summary");
  return data;
}
