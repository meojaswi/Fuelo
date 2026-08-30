import client from "./client";
export async function loginRequest(payload) {
  const { data } = await client.post("/auth/login", payload);
  return data;
}
