const assert = require("node:assert/strict");
const { test } = require("node:test");
const { request, phaseWorkspace, sale } = require("./helpers/api");

test("credit limits, payments, and part-paid voids preserve collected money as customer credit", async () => {
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
  const finalLedger = (await withToken(customerPath + "/ledger")).data.entries;
  assert.equal(finalLedger[0].type, "void_reversal");
  assert.equal(finalLedger[0].balanceAfter, -40.13);
  assert.equal((await withToken("/api/customers/outstanding")).data.totalOutstanding, 0);
});

test("fleet aging uses FIFO and a reminder is queued only once per 24 hours", async () => {
  const { inviteUser } = require("./helpers/api");
  const owner = await phaseWorkspace("9000000073");
  const { workspaceId } = owner.dealer;
  const serve = (path, method = "GET", body) =>
    request("/api" + path, { token: owner.token, method, body });
  const older = await serve("/transactions", "POST", { ...sale, amount: 100 });
  const newer = await serve("/transactions", "POST", { ...sale, amount: 50 });
  const id = older.data.customerId;
  const path = "/customers/" + id;
  const LedgerEntry = require("../src/models/ledgerEntry.model");
  for (const [posted, days] of [
    [older, 10],
    [newer, 6],
  ]) {
    await LedgerEntry.updateOne(
      { workspaceId, transactionId: posted.data._id },
      { $set: { createdAt: new Date(Date.now() - days * 86400000) } },
      { timestamps: false, overwriteImmutable: true }
    );
  }
  assert.equal(
    (
      await serve(path, "PATCH", {
        creditDays: 3,
        vehicles: [{ number: "ka 01 ab 1234", label: "Truck" }],
      })
    ).status,
    200
  );
  assert.equal((await serve("/customers/outstanding")).data.customers[0].oldestUnpaidSaleDays, 10);
  assert.equal(
    (await serve(path + "/payments", "POST", { amount: 100, paymentMode: "cash" })).status,
    201
  );
  const due = (await serve("/customers/outstanding?minDaysOverdue=3")).data.customers[0];
  assert.equal(due.oldestUnpaidSaleDays, 6);
  assert.equal(due.daysOverdue, 3);
  assert.equal(due.vehicles[0].number, "KA01AB1234");
  assert.equal((await serve("/customers/outstanding?minDaysOverdue=4")).data.customers.length, 0);
  const reminder = path + "/reminder";
  const attempts = await Promise.all([serve(reminder, "POST"), serve(reminder, "POST")]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [202, 429]);
  const Job = require("../src/models/messageJob.model");
  const reminders = await Job.find({ workspaceId, body: /baaki/ });
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].contentSid, "HX" + "1".repeat(32));
  assert.deepEqual(reminders[0].contentVariables, {
    1: "Phase Zero Station",
    2: "Fleet Customer",
    3: "50.00",
  });
  const attendant = await inviteUser(owner, "9000000074", "attendant");
  assert.equal(
    (await request("/api" + reminder, { token: attendant.token, method: "POST" })).status,
    403
  );
  const foreign = await phaseWorkspace("9000000075");
  assert.equal(
    (await request("/api" + reminder, { token: foreign.token, method: "POST" })).status,
    404
  );
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
