const assert = require("node:assert/strict");
const { test } = require("node:test");
const { request, signup, phaseWorkspace, account, sale, rows } = require("./helpers/api");

const count = async (sql, params) => (await rows(sql, params))[0].total;

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
  const [firstViewed] = await rows("SELECT first_viewed_at FROM links WHERE token = $1", [token]);
  const more = await Promise.all([request(receiptPath), request(`/links/${token}`)]);
  for (const response of [first, ...more]) {
    assert.equal(response.status, 200);
    assert.equal(response.data.businessName, b.dealer.businessName);
    assert.equal(response.data.transaction._id, created.data._id);
  }

  const views = () =>
    rows("SELECT view_count, first_viewed_at FROM links WHERE token = $1", [token]);
  const [link] = await views();
  assert.equal(Number(link.view_count), 3);
  assert.ok(firstViewed.first_viewed_at);
  assert.deepEqual(link.first_viewed_at, firstViewed.first_viewed_at);
  await rows("UPDATE links SET expires_at = $2 WHERE token = $1", [token, new Date(0)]);
  const expired = await request(receiptPath);
  assert.equal(expired.status, 410);
  assert.equal(expired.data.code, "EXPIRED");
  assert.equal(Number((await views())[0].view_count), 3);
});

test("tracked sales cannot oversell; void restores stock once and stock changes are logged", async () => {
  const { token, dealer, account: actor } = await phaseWorkspace("9000000020");
  const stranger = await phaseWorkspace("9000000021");
  const { istDateString } = require("../src/utils/datetime");
  const workspaceId = dealer.workspaceId;
  const movements = (reason) =>
    count(
      "SELECT count(*)::int AS total FROM stock_movements WHERE workspace_id = $1 AND reason = $2",
      [workspaceId, reason]
    );
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
  await rows(
    "INSERT INTO daily_summaries (workspace_id, date, grand_total_amount) VALUES ($1, $2, 500)",
    [workspaceId, istDateString()]
  );
  const voided = await Promise.all([voidRequest(token), voidRequest(token)]);
  assert.deepEqual(voided.map((r) => r.status).sort(), [200, 409]);
  assert.equal(voided.find((r) => r.status === 200).data.voidedBy, actor.id);
  assert.equal((await request("/api/inventory", { token })).data[0].currentStock, 1);
  assert.equal(
    await count("SELECT count(*)::int AS total FROM message_jobs WHERE workspace_id = $1", [
      workspaceId,
    ]),
    5
  );
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
  assert.equal(await movements("sale"), 5);
  assert.equal(await movements("void"), 1);
  assert.equal(await movements("manual_adjust"), 2);
  assert.equal(
    (
      await rows(
        "SELECT balance_after FROM stock_movements WHERE workspace_id = $1 AND reason = 'manual_adjust' AND delta = 2",
        [workspaceId]
      )
    )[0].balance_after,
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
  const { token, dealer, account: actor } = await phaseWorkspace("9000000022");
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
  const history = (
    await rows("SELECT * FROM price_history WHERE workspace_id = $1 AND item_type = 'Diesel'", [
      dealer.workspaceId,
    ])
  ).map((row) => ({
    oldPrice: row.old_price,
    newPrice: row.new_price,
    changedBy: row.changed_by,
  }));
  assert.equal(history.length, 1);
  assert.equal(history[0].oldPrice, 100.13);
  assert.equal(history[0].newPrice, 102.11);
  assert.equal(String(history[0].changedBy), actor.id);

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
