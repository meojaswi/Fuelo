import client, { refreshStorageKey } from "./client";

export function logoutRequest(refreshToken) {
  return client.post("/auth/logout", { refreshToken });
}
export function requestPasswordCode(phone) {
  return client.post("/auth/otp/request", { phone });
}
export function verifyPasswordCode(body) {
  return client.post("/auth/otp/verify", body);
}

export async function signupRequest(payload) {
  const { data } = await client.post("/auth/signup", payload);
  return data;
}

export async function loginRequest(payload) {
  const { data } = await client.post("/auth/login", payload);
  return data;
}

export async function switchWorkspaceRequest(workspaceId) {
  const { data } = await client.post("/auth/switch", {
    workspaceId,
    refreshToken: localStorage.getItem(refreshStorageKey),
  });
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
