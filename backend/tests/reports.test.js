const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const {
  request,
  signup,
  phaseWorkspace,
  account,
  sale,
  insertSales,
  UserAccount,
} = require("./helpers/api");

test("attendant daily totals isolate sales by the account that recorded them", async () => {
  const { getDailySummary } = require("../src/services/dashboard.service");
  const station = await phaseWorkspace("9000000063");
  const { workspaceId } = station.dealer;
  const actor = (await UserAccount.create({ phone: "9000000163", name: "A" }))._id;
  const other = (await UserAccount.create({ phone: "9000000164", name: "B" }))._id;
  const createdAt = new Date("2026-11-23T09:00:00Z");
  await insertSales(workspaceId, [
    { ...sale, createdBy: actor, createdAt, amount: 100 },
    { ...sale, createdBy: other, createdAt, amount: 200 },
  ]);

  const [total] = await getDailySummary(workspaceId, createdAt, actor);
  assert.equal(total.count, 1);
  assert.equal(total.totalAmount, 100);
});

test("IST summaries include 00:30 and 23:50 on the same business date", async () => {
  const { getDailySummary } = require("../src/services/dashboard.service");
  const { istDateString } = require("../src/utils/datetime");
  const { data } = await signup(account("9000000010"));
  const { workspaceId } = data.dealer;
  const morning = new Date("2026-11-22T19:00:00Z");
  const evening = new Date("2026-11-23T18:20:00Z");
  const nextMorning = new Date("2026-11-23T19:00:00Z");
  await insertSales(
    workspaceId,
    [morning, evening, nextMorning].map((createdAt) => ({ ...sale, createdAt }))
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

test("sales reports use inclusive IST dates, exclude voids, isolate tenants, and escape CSV", async () => {
  const own = await phaseWorkspace("9000000026");
  const other = await phaseWorkspace("9000000027");
  const sample = (attributes) => ({ ...sale, ...attributes });
  const itemType = 'Timber, "A"\nGrade';
  await insertSales(own.dealer.workspaceId, [
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
  ]);
  await insertSales(other.dealer.workspaceId, [
    sample({ createdAt: new Date("2026-11-23T09:00:00.000Z"), amount: 9999 }),
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
