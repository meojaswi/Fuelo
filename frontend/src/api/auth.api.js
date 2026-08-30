import client from "./client";

export async function loginRequest(payload) {
  const { data } = await client.post("/auth/login", payload);
  return data;
}

export async function switchWorkspaceRequest(workspaceId) {
  const { data } = await client.post("/auth/switch", { workspaceId });
  return data;
}

export async function createWorkspaceRequest(payload) {
  const { data } = await client.post("/auth/workspaces", payload);
  return data;
}

export async function deleteWorkspaceRequest(workspaceId) {
  const { data } = await client.delete(`/auth/workspaces/${workspaceId}`);
  return data;
}

export async function updatePasswordRequest(payload) {
  const { data } = await client.patch("/auth/password", payload);
  return data;
}
