const assert = require("node:assert/strict");
const { once } = require("node:events");
const http = require("node:http");
const { after, before, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryServer, MongoMemoryReplSet } = require("mongodb-memory-server");

let mongo;
let server;
let baseUrl;
let proxy;
let proxyUrl;
let Dealer;
let Link;
let UserAccount;
let hashPassword;

const password = "phase-zero-password";
const account = (phone, verticalType = "fuel") => ({
  businessName: "Phase Zero Station",
  phone,
  password,
  verticalType,
});
const sale = {
  customerName: "Fleet Customer",
  customerPhone: "+919000000099",
  itemType: "Diesel",
  quantity: 10,
  unit: "litres",
  amount: 900,
  paymentMode: "credit",
};

before(async () => {
  mongo =
    process.env.FUELO_TEST_STANDALONE === "1"
      ? await MongoMemoryServer.create()
      : await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.NODE_ENV = "test";
  process.env.TRUST_PROXY_HOPS = "1";
  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET = "fuelo-integration-test-secret-only";
  process.env.BCRYPT_SALT_ROUNDS = "4";
  process.env.CORS_ORIGINS = "http://localhost:5173";
  process.env.TWILIO_ACCOUNT_SID = "AC00000000000000000000000000000000";
  process.env.TWILIO_AUTH_TOKEN = "test-only-token";

  const app = require("../src/app");
  Dealer = require("../src/models/dealer.model");
  Link = require("../src/models/link.model");
  UserAccount = require("../src/models/userAccount.model");
  ({ hashPassword } = require("../src/services/auth.service"));
  await mongoose.connect(mongo.getUri());
  await Promise.all([Dealer.init(), Link.init(), UserAccount.init()]);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Model a reverse proxy appending the observed client IP to the forwarding chain.
  // The test supplies synthetic client addresses so both clients can run on loopback.
  proxy = http.createServer((req, res) => {
    const { "x-test-client-ip": clientIp, ...headers } = req.headers;
    headers["x-forwarded-for"] = [headers["x-forwarded-for"], clientIp].filter(Boolean).join(", ");
    const upstream = http.request(
      new URL(req.url, baseUrl),
      { method: req.method, headers },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      }
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
});

after(async () => {
  if (proxy) await new Promise((resolve) => proxy.close(resolve));
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function request(path, { method = "GET", body, token, origin, clientIp, forwardedFor } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  if (clientIp) headers["X-Test-Client-IP"] = clientIp;
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;
  const response = await fetch(`${clientIp ? proxyUrl : baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/pdf")) data = Buffer.from(await response.arrayBuffer());
  else if (contentType.includes("text/csv")) data = await response.text();
  else data = await response.json();
  return { status: response.status, headers: response.headers, data };
}

function signup(body) {
  return request("/api/auth/signup", { method: "POST", body });
}

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

test("workspace isolation, dashboard, PDF, and repeatable public receipts", async () => {
  const { data: a } = await signup(account("9000000004"));
  const { data: b } = await signup(account("9000000005"));
  const created = await request("/api/transactions", {
    method: "POST",
    token: b.token,
    body: sale,
  });
  assert.equal(created.status, 201);
  const path = `/api/transactions/${created.data._id}`;
  assert.equal((await request(path, { token: a.token })).status, 404);
  assert.equal((await request(path, { token: b.token })).status, 200);
  assert.equal(
    (await request(`${path}/share-link`, { method: "POST", token: a.token })).status,
    404
  );
  assert.equal((await request(`${path}/receipt.pdf`, { token: a.token })).status, 404);
  const pdf = await request(`${path}/receipt.pdf`, { token: b.token });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.data.subarray(0, 4).toString(), "%PDF");

  const dashboard = await request("/api/dashboard/daily-summary", { token: b.token });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.sales, sale.amount);
  assert.equal(dashboard.data.items[0].unit, sale.unit);
  const filtered = await request("/api/transactions?customer=Fleet&itemTypes=Diesel&today=true", {
    token: b.token,
  });
  assert.equal(filtered.data.total, 1);

  const share = await request(`${path}/share-link`, { method: "POST", token: b.token });
  assert.equal(share.status, 201);
  const { token, expiresAt, url } = share.data;
  assert.ok(expiresAt);
  assert.equal(url, `/share/${token}`);
  const receiptPath = `/api/public/receipts/${token}`;
  const first = await request(receiptPath);
  const firstViewed = await Link.findOne({ workspaceId: b.dealer.workspaceId, token });
  const more = await Promise.all([request(receiptPath), request(`/links/${token}`)]);
  for (const response of [first, ...more]) {
    assert.equal(response.status, 200);
    assert.equal(response.data.businessName, b.dealer.businessName);
    assert.equal(response.data.transaction._id, created.data._id);
  }

  const filter = { workspaceId: b.dealer.workspaceId, token };
  const link = await Link.findOne(filter);
  assert.equal(link.viewCount, 3);
  assert.ok(firstViewed.firstViewedAt);
  assert.deepEqual(link.firstViewedAt, firstViewed.firstViewedAt);
  await Link.updateOne(filter, { $set: { expiresAt: new Date(0) } });
  const expired = await request(receiptPath);
  assert.equal(expired.status, 410);
  assert.equal(expired.data.code, "EXPIRED");
  assert.equal((await Link.findOne(filter)).viewCount, 3);
});

test("IST summaries include 00:30 and 23:50 on the same business date", async () => {
  const Transaction = require("../src/models/transaction.model");
  const { getDailySummary } = require("../src/services/dashboard.service");
  const { istDateString } = require("../src/utils/datetime");
  const { data } = await signup(account("9000000010"));
  const { workspaceId } = data.dealer;
  const morning = new Date("2026-11-22T19:00:00Z");
  const evening = new Date("2026-11-23T18:20:00Z");
  const nextMorning = new Date("2026-11-23T19:00:00Z");
  await Transaction.create(
    [morning, evening, nextMorning].map((createdAt) => ({
      ...sale,
      workspaceId,
      createdAt,
    }))
  );
  assert.equal(istDateString(morning), "2026-11-23");
  assert.equal(istDateString(evening), "2026-11-23");
  assert.equal((await getDailySummary(workspaceId, morning))[0].count, 2);
  assert.equal((await getDailySummary(workspaceId, nextMorning))[0].count, 1);
  assert.equal((await request("/api/summary?date=2026-02-30", { token: data.token })).status, 400);
  assert.equal(
    (await request("/api/summary?date=2026-11-23", { token: data.token })).data.items[0].count,
    2
  );
});

async function phaseWorkspace(phone) {
  const clientIp = "198.51.100." + Number(phone.slice(-3));
  const response = await request("/api/auth/signup", {
    method: "POST",
    body: account(phone),
    clientIp,
  });
  assert.equal(response.status, 201);
  return response.data;
}

test("tracked sales cannot oversell; void restores stock once and stock changes are logged", async () => {
  const { token, dealer } = await phaseWorkspace("9000000020");
  const stranger = await phaseWorkspace("9000000021");
  const movement = require("../src/models/stockMovement.model");
  const jobs = require("../src/models/messageJob.model");
  const DailySummary = require("../src/models/dailySummary.model");
  const { istDateString } = require("../src/utils/datetime");
  const scope = { workspaceId: dealer.workspaceId };
  const seeded = await request("/api/inventory", {
    method: "POST",
    token,
    body: {
      itemType: "Diesel",
      currentStock: 5,
      unit: "litres",
      pricePerUnit: 100,
    },
  });
  assert.equal(seeded.status, 201);
  const body = { ...sale, paymentMode: "cash", quantity: 1, amount: 100 };
  const responses = await Promise.all(
    Array.from({ length: 10 }, () => request("/api/transactions", { method: "POST", token, body }))
  );
  const posted = responses.filter((r) => r.status === 201);
  assert.equal(
    posted.length,
    5,
    JSON.stringify(responses.map(({ status, data }) => ({ status, error: data.error })))
  );
  assert.ok(
    responses
      .filter((r) => r.status === 409)
      .every((r) => r.data.error.includes("Insufficient stock"))
  );
  assert.equal(responses.filter((r) => r.status === 409).length, 5);
  assert.equal((await request("/api/inventory", { token })).data[0].currentStock, 0);
  assert.equal((await request("/api/transactions", { token })).data.total, 5);
  const voidPath = `/api/transactions/${posted[0].data._id}/void`;
  const voidRequest = (bearer, reason = "Duplicate sale") =>
    request(voidPath, { method: "POST", token: bearer, body: { reason } });
  assert.equal((await voidRequest(stranger.token)).status, 404);
  assert.equal((await voidRequest(token, "x")).status, 400);
  await DailySummary.create({ ...scope, date: istDateString(), grandTotalAmount: 500 });
  const voided = await Promise.all([voidRequest(token), voidRequest(token)]);
  assert.deepEqual(voided.map((r) => r.status).sort(), [200, 409]);
  assert.equal(voided.find((r) => r.status === 200).data.voidedBy, dealer.id);
  assert.equal((await request("/api/inventory", { token })).data[0].currentStock, 1);
  assert.equal(await jobs.countDocuments(scope), 5);
  assert.equal((await request("/api/dashboard/daily-summary", { token })).data.sales, 400);
  assert.equal(
    (await request(`/api/summary?date=${istDateString()}`, { token })).data.grandTotalAmount,
    400
  );
  assert.ok(
    (await request("/api/transactions", { token })).data.transactions.some(
      (r) => r.status === "voided"
    )
  );
  const adjusted = await request("/api/inventory/Diesel", {
    method: "PATCH",
    token,
    body: { currentStock: 3 },
  });
  assert.equal(adjusted.status, 200);
  assert.equal(await movement.countDocuments({ ...scope, reason: "sale" }), 5);
  assert.equal(await movement.countDocuments({ ...scope, reason: "void" }), 1);
  assert.equal(await movement.countDocuments({ ...scope, reason: "manual_adjust" }), 2);
  assert.equal(
    (await movement.findOne({ ...scope, reason: "manual_adjust", delta: 2 })).balanceAfter,
    3
  );

  assert.equal(
    (await request("/api/dealer", { method: "PATCH", token, body: { allowNegativeStock: true } }))
      .status,
    200
  );
  assert.equal(
    (await request("/api/transactions", { method: "POST", token, body: { ...body, quantity: 4 } }))
      .status,
    201
  );
  assert.equal((await request("/api/inventory", { token })).data[0].currentStock, -1);
});

test("list price snapshots, amount warnings and price history preserve discounts and rounding", async () => {
  const { token, dealer } = await phaseWorkspace("9000000022");
  const PriceHistory = require("../src/models/priceHistory.model");
  const body = { itemType: "Diesel", currentStock: 5, unit: "litres", pricePerUnit: 100.125 };
  const seed = await request("/api/inventory", { method: "POST", token, body });
  assert.equal(seed.data.pricePerUnit, 100.13);
  const patch = (pricePerUnit) =>
    request("/api/inventory/Diesel", {
      method: "PATCH",
      token,
      body: { pricePerUnit },
    });
  assert.equal((await patch(102.105)).data.pricePerUnit, 102.11);
  assert.equal((await patch(102.11)).status, 200);
  const history = await PriceHistory.find({ workspaceId: dealer.workspaceId, itemType: "Diesel" });
  assert.equal(history.length, 1);
  assert.equal(history[0].oldPrice, 100.13);
  assert.equal(history[0].newPrice, 102.11);
  assert.equal(String(history[0].changedBy), dealer.id);

  const post = (amount) =>
    request("/api/transactions", {
      method: "POST",
      token,
      body: { ...sale, paymentMode: "cash", quantity: 2, amount },
    });
  const discounted = await post(200.005);
  assert.equal(discounted.status, 201);
  assert.equal(discounted.data.amount, 200.01);
  assert.equal(discounted.data.expectedAmount, 204.22);
  assert.equal(discounted.data.priceMismatch, true);
  assert.equal((await post(203.22)).data.priceMismatch, false);
  assert.equal((await patch(7)).status, 200);
  const fractional = await request("/api/transactions", {
    method: "POST",
    token,
    body: { ...sale, paymentMode: "cash", quantity: 0.075, amount: 0.53 },
  });
  assert.equal(fractional.status, 201);
  assert.equal(fractional.data.expectedAmount, 0.53);
});

test("credit limits, payments, and void reversal keep balances and stock consistent", async () => {
  const { token, dealer } = await phaseWorkspace("9000000023");
  const other = await phaseWorkspace("9000000024");
  const LedgerEntry = require("../src/models/ledgerEntry.model");
  const StockMovement = require("../src/models/stockMovement.model");
  const MessageJob = require("../src/models/messageJob.model");
  const scope = { workspaceId: dealer.workspaceId };
  const withToken = (path, options = {}) => request(path, { ...options, token });
  const sell = (body) =>
    withToken("/api/transactions", { method: "POST", body: { ...sale, ...body } });
  assert.equal(
    (
      await withToken("/api/inventory", {
        method: "POST",
        body: {
          itemType: "Diesel",
          currentStock: 10,
          unit: "litres",
          pricePerUnit: 100,
        },
      })
    ).status,
    201
  );

  const first = await sell({ quantity: 1, amount: 100 });
  assert.equal(first.status, 201);
  const customerPath = `/api/customers/${first.data.customerId}`;
  const firstDue = await withToken(customerPath);
  assert.equal(firstDue.data.creditBalance, 100);
  assert.equal(firstDue.data.isCreditCustomer, true);

  const tune = await withToken(customerPath, {
    method: "PATCH",
    body: { creditLimit: 149.999, creditBalance: 9999 },
  });
  assert.equal(tune.data.creditLimit, 150);
  assert.equal(tune.data.creditBalance, 100);
  const limited = await sell({ quantity: 2, amount: 100 });
  assert.equal(limited.status, 409);
  assert.equal(limited.data.code, "CREDIT_LIMIT_EXCEEDED");
  assert.equal((await withToken("/api/transactions")).data.total, 1);
  assert.equal((await withToken("/api/inventory")).data[0].currentStock, 9);
  assert.equal(await StockMovement.countDocuments({ ...scope, reason: "sale" }), 1);
  assert.equal(await MessageJob.countDocuments(scope), 1);

  const override = await sell({ quantity: 2, amount: 100, override: true });
  assert.equal(override.status, 201);
  assert.equal(override.data.customerId, first.data.customerId);
  assert.equal((await withToken(customerPath)).data.creditBalance, 200);

  const pay = (amount) =>
    withToken(`${customerPath}/payments`, {
      method: "POST",
      body: { amount, paymentMode: "upi", upiReference: "test-reference", note: "Partial" },
    });
  const payment = await pay(40.125);
  assert.equal(payment.status, 201);
  assert.equal(payment.data.entry.amount, 40.13);
  assert.equal(payment.data.entry.direction, "credit");
  assert.equal(payment.data.entry.balanceAfter, 159.87);
  assert.equal(payment.data.customer.creditBalance, 159.87);
  const overpayment = await pay(159.88);
  assert.equal(overpayment.status, 409);
  assert.equal(overpayment.data.code, "OVERPAYMENT");
  const queued = await MessageJob.findOne({ ...scope, transactionId: { $exists: false } });
  assert.match(queued.body, /Payment received.*40\.13/);
  assert.match(queued.body, /Remaining balance.*159\.87/);

  const due = await withToken("/api/customers/outstanding");
  assert.equal(due.data.totalOutstanding, 159.87);
  assert.equal(due.data.customers[0].lastPaymentAt, payment.data.entry.createdAt);
  const paged = await withToken(`${customerPath}/ledger?limit=2`);
  assert.equal(paged.data.entries.length, 2);
  assert.equal(paged.data.total, 3);
  assert.equal(paged.data.pages, 2);

  for (const [path, method, body] of [
    [customerPath, "GET"],
    [`${customerPath}/ledger`, "GET"],
    [customerPath, "PATCH", { name: "Foreign write" }],
    [`${customerPath}/payments`, "POST", { amount: 1, paymentMode: "cash" }],
  ]) {
    assert.equal((await request(path, { method, body, token: other.token })).status, 404);
  }
  assert.deepEqual((await request("/api/customers/outstanding", { token: other.token })).data, {
    customers: [],
    totalOutstanding: 0,
  });

  const voided = await withToken(`/api/transactions/${override.data._id}/void`, {
    method: "POST",
    body: { reason: "Duplicate credit sale" },
  });
  assert.equal(voided.status, 200);
  assert.equal((await withToken("/api/inventory")).data[0].currentStock, 9);
  assert.equal((await withToken(customerPath)).data.creditBalance, 59.87);
  const reversal = await LedgerEntry.findOne({
    ...scope,
    transactionId: override.data._id,
    type: "void_reversal",
  });
  assert.equal(reversal.balanceAfter, 59.87);
  assert.equal(await MessageJob.countDocuments(scope), 3);

  assert.equal(
    (
      await withToken(`/api/transactions/${first.data._id}/void`, {
        method: "POST",
        body: { reason: "Returned original sale" },
      })
    ).status,
    200
  );
  assert.equal((await withToken(customerPath)).data.creditBalance, -40.13);
  assert.equal((await withToken("/api/customers/outstanding")).data.totalOutstanding, 0);
});

test("simultaneous credit sales share one customer and payments cannot overdraw", async () => {
  const { token } = await phaseWorkspace("9000000025");
  const sales = await Promise.all(
    [0.1, 0.2].map((amount) =>
      request("/api/transactions", {
        method: "POST",
        token,
        body: { ...sale, amount },
      })
    )
  );
  assert.deepEqual(
    sales.map(({ status }) => status),
    [201, 201]
  );
  assert.equal(sales[0].data.customerId, sales[1].data.customerId);
  const path = `/api/customers/${sales[0].data.customerId}`;
  assert.equal((await request(path, { token })).data.creditBalance, 0.3);
  const payments = await Promise.all(
    [0.2, 0.2].map((amount) =>
      request(`${path}/payments`, {
        method: "POST",
        token,
        body: { amount, paymentMode: "cash" },
      })
    )
  );
  assert.deepEqual(payments.map(({ status }) => status).sort(), [201, 409]);
  assert.equal((await request(path, { token })).data.creditBalance, 0.1);
});

test("sales reports use inclusive IST dates, exclude voids, isolate tenants, and escape CSV", async () => {
  const own = await phaseWorkspace("9000000026");
  const other = await phaseWorkspace("9000000027");
  const Transaction = require("../src/models/transaction.model");
  const sample = (attributes) => ({ ...sale, workspaceId: own.dealer.workspaceId, ...attributes });
  const itemType = 'Timber, "A"\nGrade';
  await Transaction.create([
    sample({ createdAt: new Date("2026-11-22T18:29:59.999Z"), amount: 9999 }),
    sample({ createdAt: new Date("2026-11-22T18:30:00.000Z"), quantity: 1, amount: 0.1, itemType }),
    sample({
      createdAt: new Date("2026-11-23T18:29:59.999Z"),
      quantity: 2,
      amount: 0.2,
      paymentMode: "cash",
    }),
    sample({
      createdAt: new Date("2026-11-23T18:30:00.000Z"),
      quantity: 3,
      amount: 12,
      itemType: "=1+1",
    }),
    sample({ createdAt: new Date("2026-11-23T18:30:00.000Z"), amount: 9999, status: "voided" }),
    sample({
      createdAt: new Date("2026-11-23T09:00:00.000Z"),
      amount: 9999,
      workspaceId: other.dealer.workspaceId,
    }),
  ]);
  const path = "/api/reports/sales?from=2026-11-23&to=2026-11-24";
  const { token } = own;
  assert.equal((await request(path)).status, 401);
  const day = await request(path + "&workspaceId=" + other.dealer.workspaceId, { token });
  assert.equal(day.status, 200);
  assert.deepEqual(day.data.groups, [
    { group: "2026-11-23", quantity: 3, amount: 0.3, count: 2 },
    { group: "2026-11-24", quantity: 3, amount: 12, count: 1 },
  ]);
  assert.deepEqual(day.data.totals, { quantity: 6, amount: 12.3, count: 3 });
  assert.deepEqual(
    (await request(path + "&groupBy=paymentMode", { token })).data.groups.map((r) => r.group),
    ["cash", "credit"]
  );
  assert.equal((await request(path, { token: other.token })).data.totals.amount, 9999);

  const csv = await request(path + "&groupBy=item&format=csv", { token });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-disposition"), /attachment/);
  assert.ok(csv.data.includes('group,"Timber, ""A""\nGrade",1,0.10,1\r\n'));
  assert.ok(csv.data.includes(`group,"'=1+1",3,12.00,1\r\n`));
  assert.ok(csv.data.endsWith('total,"",6,12.30,3\r\n'));
  assert.equal((await request(path + "&groupBy=unsupported", { token })).status, 400);
  assert.equal(
    (await request("/api/reports/sales?from=2024-01-01&to=2024-12-31", { token })).status,
    200
  );
  assert.equal(
    (await request("/api/reports/sales?from=2024-01-01&to=2025-01-01", { token })).status,
    400
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
