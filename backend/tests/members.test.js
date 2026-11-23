const assert = require("node:assert/strict");
const { test } = require("node:test");
const { request, phaseWorkspace, account, sale, password, UserAccount } = require("./helpers/api");

test("roles restrict attendant actions and transaction visibility", async () => {
  const owner = await phaseWorkspace("9000000030");
  const { workspaceId } = owner.dealer;
  const Membership = require("../src/models/membership.model");
  const { invalidateAuth } = require("../src/middleware/auth.middleware");
  const { sessionFor } = require("../src/controllers/auth.controller");
  async function staff(phone, role) {
    const account = await UserAccount.create({ phone, name: role });
    await Membership.create({ workspaceId, userId: account._id, role });
    return sessionFor(account, workspaceId);
  }
  const attendant = await staff("9000000031", "attendant");
  const manager = await staff("9000000032", "manager");
  const compare = (session, path, options = {}) =>
    request(path, { token: session.token, ...options });
  const buy = (session) =>
    compare(session, "/api/transactions", {
      method: "POST",
      body: { ...sale, paymentMode: "cash" },
    });
  const own = await buy(attendant);
  const teammate = await buy(owner);
  assert.equal(own.status, 201);
  assert.equal(teammate.status, 201);
  const path = "/api/transactions/" + teammate.data._id;
  assert.equal((await compare(attendant, path)).status, 404);
  assert.equal((await compare(attendant, path + "/receipt.pdf")).status, 404);
  assert.equal((await compare(attendant, "/api/transactions")).data.total, 1);
  assert.equal((await compare(attendant, "/api/dashboard")).data.sales, sale.amount);
  const Transaction = require("../src/models/transaction.model");
  await Transaction.updateOne(
    { workspaceId, _id: own.data._id },
    { $set: { createdAt: new Date(0) } },
    { timestamps: false, overwriteImmutable: true }
  );
  assert.equal((await compare(attendant, "/api/transactions")).data.total, 0);
  for (const [route, options] of [
    [path + "/void", { method: "POST", body: { reason: "test" } }],
    [
      "/api/customers/" + own.data._id + "/payments",
      { method: "POST", body: { amount: 1, paymentMode: "cash" } },
    ],
    ["/api/reports/sales?from=2026-01-01&to=2026-01-02", {}],
    ["/api/inventory", { method: "POST", body: { itemType: "Diesel", unit: "litres" } }],
  ])
    assert.equal((await compare(attendant, route, options)).status, 403);
  assert.equal(
    (await compare(manager, "/api/billing/subscriptions", { method: "POST", body: {} })).status,
    403
  );
  assert.equal(
    (await compare(owner, path + "/void", { method: "POST", body: { reason: "test" } })).status,
    200
  );
  await Membership.updateOne(
    { workspaceId, userId: attendant.account.id },
    { $set: { status: "disabled" } }
  );
  invalidateAuth({ workspaceId, userId: attendant.account.id });
  assert.equal((await compare(attendant, "/api/transactions")).status, 401);
});

test("members can accept a one-time invite and owner actions revoke access", async () => {
  const owner = await phaseWorkspace("9000000033");
  const workspaceId = owner.dealer.workspaceId;
  const foreign = await phaseWorkspace("9000000034");
  const body = { phone: "9000000035", name: "Pump staff", role: "attendant" };
  const invite = await request("/api/members/invite", { method: "POST", token: owner.token, body });
  assert.equal(invite.status, 201);
  assert.equal(invite.data.status, "invited");
  assert.equal(invite.data.inviteTokenHash, undefined);
  const job = await require("../src/models/messageJob.model").findOne({
    workspaceId,
    sensitive: true,
  });
  const token = job.body.split("/invite/")[1];
  const accept = () =>
    request("/api/auth/accept-invite", { method: "POST", body: { token, password } });
  assert.equal((await accept()).status, 200);
  assert.equal((await accept()).status, 400);
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { phone: body.phone, password },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.role, "attendant");
  assert.equal(login.data.dealer.workspaceId, workspaceId);
  assert.equal((await request("/api/members", { token: login.data.token })).status, 403);
  const memberPath = "/api/members/" + invite.data.id;
  assert.equal((await request(memberPath, { method: "DELETE", token: foreign.token })).status, 404);
  assert.equal((await request("/api/transactions", { token: login.data.token })).status, 200);
  assert.equal(
    (
      await request(memberPath, {
        method: "PATCH",
        token: owner.token,
        body: { status: "disabled" },
      })
    ).status,
    200
  );
  assert.equal((await request("/api/transactions", { token: login.data.token })).status, 401);
  assert.equal(
    (
      await request("/api/auth/refresh", {
        method: "POST",
        body: { refreshToken: login.data.refreshToken },
      })
    ).status,
    401
  );
  const self = (await request("/api/members", { token: owner.token })).data.members.find(
    (member) => member.self
  );
  assert.equal(
    (await request("/api/members/" + self.id, { method: "DELETE", token: owner.token })).status,
    409
  );
  assert.equal(
    (
      await request("/api/members/" + self.id, {
        method: "PATCH",
        token: owner.token,
        body: { role: "manager" },
      })
    ).status,
    409
  );

  const Membership = require("../src/models/membership.model");
  const manager = await UserAccount.create({ phone: "9000000036", name: "Manager" });
  await Membership.create({ workspaceId, userId: manager._id, role: "manager" });
  const managerSession = await require("../src/controllers/auth.controller").sessionFor(
    manager,
    workspaceId
  );
  assert.equal((await request("/api/members", { token: managerSession.token })).status, 200);
  assert.equal(
    (await request("/api/members/invite", { method: "POST", token: managerSession.token, body }))
      .status,
    403
  );
});

test("audit entries identify the actor and are scoped and filterable", async () => {
  const owner = await phaseWorkspace("9000000037");
  const foreign = await phaseWorkspace("9000000038");
  const { token } = owner;
  const write = await request("/api/dealer", {
    token,
    method: "PATCH",
    body: { businessName: "Audited Station" },
  });
  assert.equal(write.status, 200);
  const path = "/api/audit?action=settings.update&actor=" + owner.account.id;
  const own = await request(path, { token });
  assert.equal(own.status, 200);
  assert.equal(own.data.events.length, 1);
  assert.equal(own.data.events[0].actorRole, "owner");
  assert.equal(own.data.events[0].workspaceId, owner.dealer.workspaceId);
  assert.deepEqual((await request(path, { token: foreign.token })).data.events, []);
  assert.equal((await request("/api/audit?from=2026-02-30", { token })).status, 400);
});
