const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  gstinState,
  gstLine,
  gstTotals,
  financialYear,
  amountInWords,
} = require("../src/utils/gst");
const { timberQuantity } = require("../src/utils/timber");
const { request } = require("./helpers/api");

test("timber dimensions convert all units with bounded three-decimal quantities", () => {
  const dimensions = { pieces: 3, lengthFt: 8, widthIn: 6, thicknessIn: 2 };
  assert.equal(timberQuantity(dimensions, "cubic_ft"), 2);
  assert.equal(timberQuantity(dimensions, "sq_ft"), 12);
  assert.equal(timberQuantity(dimensions, "running_ft"), 24);
  assert.equal(timberQuantity({ pieces: 3 }, "piece"), 3);
  assert.equal(
    timberQuantity({ pieces: 1, lengthFt: 1, widthIn: 1, thicknessIn: 1 }, "cubic_ft"),
    0.007
  );
  assert.throws(() => timberQuantity({ ...dimensions, thicknessIn: 0 }, "cubic_ft"), RangeError);
  assert.throws(() => timberQuantity({ ...dimensions, lengthFt: 1e20 }, "cubic_ft"), RangeError);
});

async function timberWorkspace(phone) {
  const result = await request("/api/auth/signup", {
    clientIp: "198.51.100." + Number(phone.slice(-3)),
    method: "POST",
    body: {
      businessName: "Timber Test",
      phone,
      password: "phase-zero-password",
      verticalType: "timber",
    },
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const api = (path, method = "GET", body) =>
    request("/api" + path, { token: result.data.token, method, body });
  return { ...result.data, api };
}

test("GST math validates GSTIN, rounds mixed and inclusive taxes in paise, and changes year at midnight IST", () => {
  assert.equal(gstinState("27AAPFU0939F1ZV"), "27");
  assert.equal(gstinState("27AAPFU0939F1ZX"), undefined);
  assert.equal(gstinState("00AAPFU0939F1ZV"), undefined);
  assert.deepEqual(gstLine(118, 18, true, true), {
    amount: 118,
    gstRatePercent: 18,
    taxableValue: 100,
    cgst: 9,
    sgst: 9,
    igst: 0,
    total: 118,
  });
  assert.deepEqual(gstLine(100, 18, false, false), {
    amount: 100,
    gstRatePercent: 18,
    taxableValue: 100,
    cgst: 0,
    sgst: 0,
    igst: 18,
    total: 118,
  });
  assert.equal(gstLine(0.01, 50, true, false).cgst, 0.01);
  const tax = gstTotals(
    [
      { amount: 100, gstRatePercent: 18 },
      { amount: 10.3, gstRatePercent: 5 },
      { amount: 0.5, gstRatePercent: 0 },
    ],
    true,
    false
  );
  assert.deepEqual(
    [tax.taxableValue, tax.cgst, tax.sgst, tax.total, tax.roundOff, tax.roundedTotal],
    [110.8, 9.26, 9.26, 129.32, -0.32, 129]
  );
  assert.equal(financialYear(new Date("2026-03-31T18:29:59.999Z")), "25-26");
  assert.equal(financialYear(new Date("2026-03-31T18:30:00.000Z")), "26-27");
  assert.equal(
    amountInWords(10203004.05),
    "One Crore Two Lakh Three Thousand Four Rupees and Five Paise Only"
  );
});

const stockItem = {
  itemType: "Teak A",
  species: "Teak",
  grade: "A",
  pricingUnit: "cubic_ft",
  pricePerUnit: 100,
};
const dimensions = { itemType: "Teak A", pieces: 3, lengthFt: 8, widthIn: 6, thicknessIn: 2 };

test("timber sales compute dimensions and charges and void restores volume and pieces", async () => {
  const { api } = await timberWorkspace("9000000080");
  assert.equal((await api("/timber/items", "PUT", stockItem)).status, 200);
  assert.equal(
    (
      await api("/timber/items/adjustments", "POST", {
        itemType: "Teak A",
        quantity: 10,
        pieces: 15,
        reason: "Opening stock",
      })
    ).status,
    200
  );
  const sale = await api("/transactions", "POST", {
    customerName: "Timber Buyer",
    customerPhone: "+919999990001",
    paymentMode: "cash",
    lineItems: [{ ...dimensions, quantity: 0.1, lineAmount: 1 }],
    amount: 1,
    charges: [{ type: "transport", amount: 25 }],
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.data));
  assert.equal(sale.data.amount, 225);
  const stock = async () => {
    const { items } = (await api("/timber/items")).data;
    const item = items.find((row) => row.itemType === "Teak A");
    return [item.currentStock, item.currentPieces];
  };
  assert.deepEqual(await stock(), [8, 12]);
  assert.equal(
    (await api("/transactions/" + sale.data._id + "/void", "POST", { reason: "Cancelled" })).status,
    200
  );
  assert.deepEqual(await stock(), [10, 15]);
});

test("supplier balances and timber purchases remain scoped, and voiding backs out stock and payables", async () => {
  const owner = await timberWorkspace("9000000081");
  const { api } = owner;
  assert.equal((await api("/timber/items", "PUT", stockItem)).status, 200);
  const supplier = await api("/suppliers", "POST", { name: "Saw Mill", openingBalance: 40 });
  assert.equal(supplier.status, 201, JSON.stringify(supplier.data));
  const path = "/suppliers/" + supplier.data._id;
  const input = {
    supplierId: supplier.data._id,
    invoiceNumber: "T-21",
    invoiceDate: "2026-05-23",
    lineItems: [{ ...dimensions, ratePerUnit: 50 }],
    paidAmount: 25,
    paymentMode: "cash",
  };
  const purchase = await api("/purchases", "POST", input);
  assert.equal(purchase.status, 201, JSON.stringify(purchase.data));
  assert.equal((await api(path)).data.balance, 115);
  const item = async () =>
    (await api("/timber/items")).data.items.find((row) => row.itemType === stockItem.itemType);
  assert.deepEqual([(await item()).currentStock, (await item()).currentPieces], [2, 3]);
  assert.equal(
    (await api(path + "/payments", "POST", { amount: 200, paymentMode: "upi" })).data.code,
    "OVERPAYMENT"
  );
  const purchasePath = "/purchases/" + purchase.data._id;
  assert.equal(
    (await api(purchasePath + "/void", "POST", { reason: "Incorrect receipt" })).status,
    200
  );
  assert.deepEqual([(await item()).currentStock, (await item()).currentPieces], [0, 0]);
  assert.equal((await api(path)).data.balance, 15);
  assert.equal(
    (await api(path + "/payments", "POST", { amount: 25, paymentMode: "upi", advance: true })).data
      .supplier.balance,
    -10
  );
  assert.equal((await api(path + "/ledger")).data.entries.length, 5);
  const { inviteUser } = require("./helpers/api");
  const attendant = await inviteUser(owner, "9000000082", "attendant");
  for (const endpoint of ["/purchases", "/suppliers", path + "/ledger", "/suppliers/outstanding"])
    assert.equal((await request("/api" + endpoint, { token: attendant.token })).status, 403);
  const manager = await inviteUser(owner, "9000000083", "manager");
  assert.equal((await request("/api/purchases", { token: manager.token })).status, 200);
  const other = await timberWorkspace("9000000084");
  const foreign = other.api;
  assert.deepEqual((await foreign("/purchases")).data.purchases, []);
  assert.deepEqual((await foreign("/suppliers")).data.suppliers, []);
  assert.deepEqual((await foreign("/suppliers/outstanding")).data.suppliers, []);
  const otherSupplier = await foreign("/suppliers", "POST", {
    workspaceId: owner.dealer.workspaceId,
    name: "Saw Mill",
  });
  assert.equal(otherSupplier.status, 201);
  assert.equal(otherSupplier.data.workspaceId, other.dealer.workspaceId);
  assert.equal((await api("/suppliers/" + otherSupplier.data._id)).status, 404);
  for (const endpoint of [path, path + "/ledger", purchasePath])
    assert.equal((await foreign(endpoint)).status, 404);
  assert.equal((await foreign("/purchases", "POST", input)).status, 404);
  assert.equal(
    (await foreign(purchasePath + "/void", "POST", { reason: "Wrong workspace" })).status,
    404
  );
  assert.equal((await foreign(path, "PATCH", { name: "Other" })).status, 404);
  assert.equal((await foreign(path, "DELETE", { reason: "Wrong workspace" })).status, 404);
  assert.equal(
    (await foreign(path + "/payments", "POST", { amount: 25, paymentMode: "upi", advance: true }))
      .status,
    404
  );
});

test("registered timber invoices number twenty concurrent sales and a credit note reverses stock and dues", async (t) => {
  const owner = await timberWorkspace("9000000086");
  const { api } = owner;
  const profile = {
    taxRegistered: true,
    gstin: "27AAPFU0939F1ZV",
    legalName: "Test Mill",
    address: "Test Road",
    invoicePrefix: "TW",
    chargeGstRatePercent: 5,
  };
  assert.equal(
    (await api("/timber/tax-profile", "PUT", { ...profile, gstin: "27AAPFU0939F1ZX" })).status,
    400
  );
  const saved = await api("/timber/tax-profile", "PUT", profile);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.profile.state, "27");
  assert.equal((await api("/timber/items", "PUT", stockItem)).status, 200);
  assert.equal(
    (
      await api("/timber/items/adjustments", "POST", {
        itemType: "Teak A",
        quantity: 100,
        pieces: 120,
        reason: "Opening stock",
      })
    ).status,
    200
  );
  const input = {
    customerName: "Buyer",
    customerPhone: "+919999990004",
    paymentMode: "cash",
    lineItems: [dimensions],
    charges: [{ type: "transport", amount: 10.3, taxable: true }],
  };
  assert.match((await api("/transactions", "POST", input)).data.error, /GST rate/);
  assert.equal(
    (await api("/timber/items/Teak%20A/tax", "PATCH", { hsnCode: "4407", gstRatePercent: 18 }))
      .status,
    200
  );
  const quote = await api("/timber/sale-quote", "POST", { ...input, placeOfSupply: "29" });
  assert.equal(quote.status, 200, JSON.stringify(quote.data));
  assert.deepEqual([quote.data.tax.cgst, quote.data.tax.igst, quote.data.amount], [0, 36.52, 247]);
  const save = t.mock.method(
    require("../src/repositories/sales"),
    "insertTransaction",
    async (_db, _workspaceId, row) => {
      assert.match(row.invoiceNumber, /\/0001$/);
      throw new Error("Simulated invoice write failure");
    }
  );
  assert.equal((await api("/transactions", "POST", input)).status, 500);
  save.mock.restore();
  const issued = await Promise.all(
    Array.from({ length: 20 }, () => api("/transactions", "POST", input))
  );
  assert.deepEqual(
    issued.map((row) => row.status),
    Array(20).fill(201),
    JSON.stringify(issued.filter((row) => row.status !== 201))
  );
  assert.deepEqual(
    issued.map(({ data }) => data.invoiceNumber.split("/").at(-1)).sort(),
    Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(4, "0"))
  );
  const credit = await api("/transactions", "POST", {
    ...input,
    paidAmount: 100,
    placeOfSupply: "29",
  });
  assert.equal(credit.status, 201, JSON.stringify(credit.data));
  assert.match(credit.data.invoiceNumber, /\/0021$/);
  const salePath = "/transactions/" + credit.data._id;
  const invoicePath = "/invoices/" + credit.data._id;
  assert.equal(
    (await api(salePath + "/void", "POST", { reason: "Buyer returned stock" })).data.code,
    "CREDIT_NOTE_REQUIRED"
  );
  const { inviteUser } = require("./helpers/api");
  const attendant = await inviteUser(owner, "9000000087", "attendant");
  const manager = await inviteUser(owner, "9000000088", "manager");
  const reason = { reason: "Buyer returned stock" };
  assert.equal(
    (
      await request("/api" + invoicePath + "/credit-note", {
        token: attendant.token,
        method: "POST",
        body: reason,
      })
    ).status,
    403
  );
  assert.equal(
    (
      await request("/api" + salePath + "/void", {
        token: attendant.token,
        method: "POST",
        body: reason,
      })
    ).status,
    403
  );
  const note = await request("/api" + invoicePath + "/credit-note", {
    token: manager.token,
    method: "POST",
    body: reason,
  });
  assert.equal(note.status, 201, JSON.stringify(note.data));
  assert.match(note.data.number, /^CN\/\d\d-\d\d\/0001$/);
  assert.equal((await api(invoicePath)).data.invoice.status, "voided");
  assert.equal((await api(invoicePath + "/pdf")).status, 200);
  assert.equal((await api(invoicePath + "/pdf?kind=credit_note")).status, 200);
  const item = (await api("/timber/items")).data.items.find((row) => row.itemType === "Teak A");
  assert.deepEqual([item.currentStock, item.currentPieces], [60, 60]);
  assert.equal((await api("/customers/" + credit.data.customerId)).data.creditBalance, -100);
  const next = await api("/transactions", "POST", input);
  assert.match(next.data.invoiceNumber, /\/0022$/);
  const date = require("../src/utils/datetime").istDateString();
  const report = "/reports/gst-summary?from=" + date + "&to=" + date;
  const rows = (await api(report)).data.rows;
  assert.equal(rows.find((row) => row.hsn === "4407").taxableValue, 4200);
  assert.equal(rows.find((row) => row.hsn === "4407").igst, 0);
  assert.equal((await api(report + "&format=csv")).status, 200);
  const other = await timberWorkspace("9000000089");
  const foreign = other.api;
  assert.equal((await foreign("/timber/tax-profile")).data.profile, undefined);
  const otherProfile = await foreign("/timber/tax-profile", "PUT", {
    workspaceId: owner.dealer.workspaceId,
    taxRegistered: false,
    invoicePrefix: "MILL",
  });
  assert.equal(otherProfile.status, 200);
  assert.equal((await api("/timber/tax-profile")).data.profile.invoicePrefix, "TW");
  assert.deepEqual((await foreign("/timber/items")).data.items, []);
  assert.equal((await foreign("/timber/sale-quote", "POST", input)).status, 400);
  assert.equal((await foreign("/timber/items/Teak%20A/tax", "PATCH", { hsnCode: "4407", gstRatePercent: 0 })).status, 404);
  assert.equal((await foreign("/timber/items/adjustments", "POST", {
    itemType: "Teak A", quantity: 1, pieces: 1, reason: "Other workspace",
  })).status, 404);
  const otherItem = await foreign("/timber/items", "PUT", { ...stockItem, pricePerUnit: 1, workspaceId: owner.dealer.workspaceId });
  assert.equal(otherItem.status, 200);
  assert.equal(otherItem.data.workspaceId, other.dealer.workspaceId);
  assert.equal((await api("/timber/items")).data.items.find((row) => row.itemType === "Teak A").pricePerUnit, 100);
  assert.equal((await request("/api/timber/tax-profile", { token: manager.token })).status, 403);
  assert.equal((await request("/api/invoices", { token: attendant.token })).status, 403);
  assert.deepEqual((await foreign("/invoices")).data.invoices, []);
  assert.deepEqual((await foreign(report)).data.rows, []);
  assert.equal((await foreign(invoicePath)).status, 404);
  assert.equal((await foreign(invoicePath + "/pdf")).status, 404);
  assert.equal((await foreign(invoicePath + "/credit-note", "POST", reason)).status, 404);
});

test("timber reports use purchase weights and FIFO balances and exclude other workspaces", async () => {
  const { api, dealer } = await timberWorkspace("9000000090");
  const item = await api("/timber/items", "PUT", stockItem);
  assert.equal(item.status, 200);
  const supplier = await api("/suppliers", "POST", {
    name: "Wood supplier",
    phone: "+919999990008",
  });
  assert.equal(supplier.status, 201);
  const { istDateString } = require("../src/utils/datetime");
  const today = istDateString();
  const olderInvoiceDate = istDateString(new Date(Date.now() - 45 * 86400000));
  for (const [invoiceNumber, ratePerUnit, pieces] of [
    ["ONE", 40, 3],
    ["TWO", 70, 6],
  ]) {
    const purchase = await api("/purchases", "POST", {
      supplierId: supplier.data._id,
      invoiceNumber,
      invoiceDate: invoiceNumber === "ONE" ? olderInvoiceDate : today,
      lineItems: [{ ...dimensions, pieces, ratePerUnit }],
    });
    assert.equal(purchase.status, 201, JSON.stringify(purchase.data));
  }
  const sale = await api("/transactions", "POST", {
    customerName: "Buyer",
    customerPhone: "+919999990007",
    paymentMode: "credit",
    lineItems: [dimensions],
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.data));
  const paths = "/reports/timber/";
  const dates = "?from=" + today + "&to=" + today;
  const stock = (await api(paths + "stock")).data.rows[0];
  assert.deepEqual([stock.quantity, stock.pieces, stock.value], [4, 6, 400]);
  const species = (await api(paths + "sales-by-species" + dates)).data.rows[0];
  assert.deepEqual([species.species, species.pieces, species.sales], ["Teak", 3, 200]);
  const profit = (await api(paths + "profit-lite" + dates)).data.rows[0];
  assert.deepEqual(
    [profit.weightedAverageRate, profit.estimatedCost, profit.estimatedProfit],
    [60, 120, 80]
  );
  assert.equal((await api(paths + "receivables-aging")).data.rows[0].days0to30, 200);
  const payableAge = (await api(paths + "payables-aging")).data.rows[0];
  assert.deepEqual([payableAge.days0to30, payableAge.days31to60], [280, 80]);
  assert.equal((await api("/customers/" + sale.data.customerId + "/reminder", "POST")).status, 202);
  const { rows } = require("./helpers/api");
  const matching = async (pattern) =>
    (
      await rows(
        "SELECT count(*)::int AS total FROM message_jobs WHERE workspace_id = $1 AND body ~ $2",
        [dealer.workspaceId, pattern]
      )
    )[0].total;
  assert.equal(await matching("lakdi mil gayi"), 2);
  assert.equal(await matching("8 ft.*6 in.*2 in"), 1);
  const foreign = (await timberWorkspace("9000000091")).api;
  for (const [kind, window] of [
    ["stock", ""],
    ["sales-by-species", dates],
    ["receivables-aging", ""],
    ["payables-aging", ""],
    ["profit-lite", dates],
  ]) {
    const csv = await api(paths + kind + window + (window ? "&" : "?") + "format=csv");
    assert.equal(csv.status, 200);
    assert.equal(typeof csv.data, "string");
    assert.deepEqual((await foreign(paths + kind + window)).data.rows, []);
  }
  const { patchWorkspace } = require("./helpers/api");
  const { plans } = require("../src/config/plans");
  for (const endpoint of [
    "/timber/items",
    "/purchases",
    "/suppliers",
    "/invoices",
    paths + "stock",
  ]) {
    await patchWorkspace(dealer.workspaceId, { planLimits: plans[0].limits });
    const starter = await api(endpoint);
    assert.equal(starter.status, 402);
    assert.equal(starter.data.code, "FEATURE_NOT_IN_PLAN");
  }
  await patchWorkspace(dealer.workspaceId, { planLimits: plans[1].limits });
  assert.equal((await api(paths + "stock")).status, 200);
});

test("timber part payment is recorded once and a customer advance applies to the next sale", async () => {
  const { api } = await timberWorkspace("9000000085");
  assert.equal(
    (await api("/timber/items", "PUT", { ...stockItem, pricePerUnit: 5000 })).status,
    200
  );
  assert.equal(
    (
      await api("/timber/items/adjustments", "POST", {
        itemType: "Teak A",
        quantity: 20,
        pieces: 20,
        reason: "Opening stock",
      })
    ).status,
    200
  );
  const input = {
    customerName: "Timber Buyer",
    customerPhone: "+919999990003",
    paymentMode: "cash",
    lineItems: [dimensions],
    paidAmount: 4000,
  };
  const sale = await api("/transactions", "POST", input);
  assert.equal(sale.status, 201, JSON.stringify(sale.data));
  assert.equal(sale.data.amount, 10000);
  const path = "/customers/" + sale.data.customerId;
  let ledger = (await api(path + "/ledger")).data.entries;
  assert.equal(ledger.find((row) => row.type === "payment").amount, 4000);
  assert.equal(ledger.find((row) => row.type === "credit_sale").amount, 6000);
  assert.equal((await api(path)).data.creditBalance, 6000);
  const payment = { amount: 7000, paymentMode: "cash" };
  assert.equal((await api(path + "/payments", "POST", payment)).status, 409);
  assert.equal((await api("/dealer", "PATCH", { allowAdvances: true })).status, 200);
  assert.equal((await api(path + "/payments", "POST", payment)).status, 201);
  assert.equal((await api(path)).data.creditBalance, -1000);
  const next = await api("/transactions", "POST", { ...input, paidAmount: 8000 });
  assert.equal(next.data.advanceApplied, 1000);
  assert.equal((await api(path)).data.creditBalance, 1000);
  ledger = (await api(path + "/ledger")).data.entries;
  assert.match(
    ledger.find((row) => row.transactionId === next.data._id && row.type === "credit_sale").note,
    /1000/
  );
  assert.equal(
    (await api("/transactions/" + next.data._id + "/void", "POST", { reason: "Return" })).status,
    200
  );
  assert.equal((await api(path)).data.creditBalance, -9000);
});
