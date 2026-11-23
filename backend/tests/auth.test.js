const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  request,
  signup,
  phaseWorkspace,
  account,
  password,
  Dealer,
  UserAccount,
  hashPassword,
} = require("./helpers/api");

test("health endpoints, security headers, and browser origin allowlist", async () => {
  assert.equal((await request("/health")).status, 200);
  const allowed = await request("/api/health", { origin: "http://localhost:5173" });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
  const disallowed = await request("/api/health", { origin: "https://example.test" });
  assert.equal(disallowed.headers.get("access-control-allow-origin"), null);
});

test("signup creates a session and rejects concurrent duplicate phones", async () => {
  const payload = account("9000000001", "timber");
  const results = await Promise.all([signup(payload), signup(payload)]);
  const created = results.find(({ status }) => status === 201);
  const conflict = results.find(({ status }) => status === 409);
  assert.ok(created?.data.token);
  const Workspace = require("../src/models/workspace.model");
  const Membership = require("../src/models/membership.model");
  assert.ok(await UserAccount.exists({ phone: payload.phone }));
  assert.ok(await Workspace.exists({ workspaceId: created.data.dealer.workspaceId }));
  assert.ok(
    await Membership.exists({
      workspaceId: created.data.dealer.workspaceId,
      userId: created.data.account.id,
      role: "owner",
    })
  );
  assert.match(conflict?.data.error, /already exists/);
  assert.deepEqual(created.data.dealer.config.itemTypes, ["Teak", "Sal", "Pine"]);
  assert.deepEqual(created.data.workspaces, [created.data.dealer]);

  const login = await request("/api/auth/login", { method: "POST", body: payload });
  assert.equal(login.status, 200);
  assert.deepEqual(login.data.dealer, created.data.dealer);
});

test("login checks the matching legacy password and picks the oldest workspace", async () => {
  const phone = "9000000002";
  const olderHash = await hashPassword("old-test-password");
  const newerHash = await hashPassword(password);
  await Dealer.create([
    {
      ...account(phone),
      workspaceId: "ws_older",
      passwordHash: olderHash,
      createdAt: new Date("2020-01-01"),
    },
    {
      ...account(phone),
      workspaceId: "ws_newer",
      passwordHash: newerHash,
      createdAt: new Date("2021-01-01"),
    },
  ]);

  const { migrate } = require("../scripts/migrateToMemberships");
  assert.equal((await migrate({ dryRun: true })).workspaces, 2);
  assert.equal((await migrate()).memberships, 2);
  assert.equal((await migrate()).memberships, 0);
  const login = (candidate) =>
    request("/api/auth/login", {
      method: "POST",
      body: { phone, password: candidate },
    });
  const success = await login(password);
  assert.equal(success.status, 200);
  assert.equal(success.data.dealer.workspaceId, "ws_older");
  assert.equal(success.data.workspaces.length, 2);
  assert.equal((await login("incorrect-password")).status, 401);
});

test("signup, login, and transaction validation report field errors", async () => {
  const invalid = await signup({
    businessName: "x",
    phone: "not-a-phone",
    verticalType: "unknown",
    password: "x",
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(
    new Set(invalid.data.issues.map(({ path }) => path)),
    new Set(["businessName", "phone", "verticalType", "password"])
  );
  const login = await request("/api/auth/login", { method: "POST", body: {} });
  assert.equal(login.status, 400);

  const { data } = await signup(account("9000000003"));
  const transaction = await request("/api/transactions", {
    method: "POST",
    token: data.token,
    body: {},
  });
  assert.equal(transaction.status, 400);
  assert.ok(transaction.data.issues.some(({ path }) => path === "customerPhone"));
});

test("refresh rotation, reuse revocation and logout-all invalidate sessions", async () => {
  const user = await phaseWorkspace("9000000028");
  const refresh = (refreshToken) =>
    request("/api/auth/refresh", { method: "POST", body: { refreshToken } });
  const rotated = await refresh(user.refreshToken);
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.data.refreshToken, user.refreshToken);
  assert.equal((await refresh(user.refreshToken)).status, 401);
  assert.equal((await refresh(rotated.data.refreshToken)).status, 401);
  assert.equal((await request("/api/inventory", { token: rotated.data.token })).status, 200);
  assert.equal(
    (await request("/api/auth/logout-all", { method: "POST", token: rotated.data.token })).status,
    200
  );
  assert.equal((await request("/api/inventory", { token: rotated.data.token })).status, 401);
});

test("OTP recovery is generic, rate-limited per challenge, and resets the password once", async () => {
  const phone = "9000000029";
  const user = await phaseWorkspace(phone);
  const jobs = require("../src/models/messageJob.model");
  const ask = (candidate) =>
    request("/api/auth/otp/request", { method: "POST", body: { phone: candidate } });
  const response = await ask(phone);
  assert.equal(response.status, 202);
  assert.deepEqual(response.data, (await ask("9000000999")).data);
  await ask(phone);
  assert.equal(await jobs.countDocuments({ workspaceId: user.dealer.workspaceId }), 1);
  const job = await jobs.findOne({ workspaceId: user.dealer.workspaceId });
  const code = job.body.match(/\b\d{6}\b/)[0];
  const verify = (candidate) =>
    request("/api/auth/otp/verify", {
      method: "POST",
      body: { phone, code: candidate, password: "new-test-password" },
    });
  assert.equal((await verify(code === "111111" ? "000000" : "111111")).status, 400);
  assert.equal((await verify(code)).status, 200);
  assert.equal((await verify(code)).status, 400);
  assert.equal((await request("/api/inventory", { token: user.token })).status, 401);
});

test("session flags and receipt language follow the workspace", async () => {
  const { phaseWorkspace, sale } = require("./helpers/api");
  const { token, dealer } = await phaseWorkspace("9000000061");
  assert.equal(dealer.language, "hi");
  assert.equal(
    (await request("/api/auth/session", { token })).data.dealer.verticalFeatures.shifts,
    true
  );
  const Job = require("../src/models/messageJob.model");
  const send = () =>
    request("/api/transactions", { token, method: "POST", body: { ...sale, paymentMode: "cash" } });
  const hi = await send();
  assert.equal(hi.status, 201);
  assert.match(
    (await Job.findOne({ workspaceId: dealer.workspaceId, transactionId: hi.data._id })).body,
    /aapka/
  );
  assert.equal(
    (await request("/api/dealer", { token, method: "PATCH", body: { language: "en" } })).status,
    200
  );
  const en = await send();
  assert.match(
    (await Job.findOne({ workspaceId: dealer.workspaceId, transactionId: en.data._id })).body,
    /here is your/
  );
});

test("a trusted proxy separates clients and successful logins leave the login budget available", async () => {
  const staffIp = "192.0.2.11";
  const otherIp = "192.0.2.12";
  const payload = account("9000000006");
  const staffSignup = () =>
    request("/api/auth/signup", { method: "POST", body: payload, clientIp: staffIp });
  const login = (clientIp, candidate = password, forwardedFor) =>
    request("/api/auth/login", {
      method: "POST",
      body: { phone: payload.phone, password: candidate },
      clientIp,
      forwardedFor,
    });

  assert.equal((await staffSignup()).status, 201);
  for (let i = 0; i < 35; i++) {
    assert.equal((await login(staffIp)).status, 200);
  }
  for (let i = 0; i < 30; i++) {
    assert.equal((await login(staffIp, "wrong-password")).status, 401);
  }
  const blocked = await login(staffIp, password, otherIp);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get("retry-after"));
  assert.equal((await login(otherIp)).status, 200);

  for (let i = 0; i < 9; i++) {
    assert.equal((await staffSignup()).status, 409);
  }
  assert.equal((await staffSignup()).status, 429);
  assert.equal((await login(otherIp)).status, 200);
});
