import client from "./client";

export async function listMembers() {
  return (await client.get("/members")).data.members;
}

export async function inviteMember(body) {
  return (await client.post("/members/invite", body)).data;
}

export async function updateMember(id, body) {
  return (await client.patch(`/members/${id}`, body)).data;
}

export async function removeMember(id) {
  return (await client.delete(`/members/${id}`)).data;
}

export async function acceptInvite(body) {
  return (await client.post("/auth/accept-invite", body)).data;
}
