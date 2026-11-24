const salesRepo = require("../repositories/sales");
const timber = require("../repositories/timber");
const { unpaidCharges } = require("../services/fleetCredit.service");
const { assertCan } = require("../services/entitlements.service");
const { roundMoney } = require("../utils/money");
const { roundQuantity } = require("../utils/timber");
const { istDayBoundsUTC } = require("../utils/datetime");
const { csvCells } = require("../utils/csv");
const { fail } = require("../services/atomic.service");
const { range } = require("./gstReports.controller");

async function stock({ workspaceId }) {
  const items = (await salesRepo.listInventory(workspaceId, { timberOnly: true })).sort(
    (a, b) =>
      (a.species ?? "").localeCompare(b.species ?? "") ||
      (a.grade ?? "").localeCompare(b.grade ?? "") ||
      a.itemType.localeCompare(b.itemType)
  );
  return items.map((row) => ({
    item: row.itemType,
    species: row.species,
    grade: row.grade,
    unit: row.pricingUnit,
    quantity: row.currentStock,
    pieces: row.currentPieces,
    rate: row.pricePerUnit,
    value: roundMoney(row.currentStock * row.pricePerUnit),
  }));
}

function salesLines({ workspaceId, query }) {
  return salesRepo.timberSaleLines(workspaceId, range(query));
}

function groupedSales(lines, field) {
  const totals = new Map();
  for (const line of lines) {
    const key = JSON.stringify([line[field], line.unit]);
    const row = totals.get(key) ?? {
      [field]: line[field],
      unit: line.unit,
      quantity: 0,
      pieces: 0,
      sales: 0,
    };
    row.quantity = roundQuantity(row.quantity + line.quantity);
    row.pieces += line.pieces;
    row.sales = roundMoney(row.sales + (line.taxableValue ?? line.lineAmount));
    totals.set(key, row);
  }
  return [...totals.values()];
}

async function sales(req) {
  return groupedSales(await salesLines(req), "species");
}

async function aging({ workspaceId }, suppliers) {
  const [party, reference] = suppliers ? ["supplierId", "purchaseId"] : ["customerId", "transactionId"];
  const parties = await timber.partiesWithBalance(workspaceId, suppliers ? "suppliers" : "customers");
  const ids = parties.map((row) => row.id);
  const entries = suppliers
    ? await timber.entriesForAging(workspaceId, ids)
    : await salesRepo.ledgerForAging(workspaceId, ids);
  const byParty = new Map();
  for (const entry of entries) {
    const key = entry[party];
    if (!byParty.has(key)) byParty.set(key, []);
    byParty.get(key).push(entry.effectiveAt ? { ...entry, createdAt: entry.effectiveAt } : entry);
  }
  const today = +istDayBoundsUTC(new Date()).startUTC;
  return parties.map((row) => {
    const buckets = { days0to30: 0, days31to60: 0, days61to90: 0, days91Plus: 0 };
    const entries = byParty.get(row.id) ?? [];
    if (suppliers) entries.sort((a, b) => +a.createdAt - +b.createdAt);
    for (const unpaid of unpaidCharges(entries, reference)) {
      const days = (today - +istDayBoundsUTC(unpaid.date).startUTC) / 86400000;
      const key =
        days <= 30
          ? "days0to30"
          : days <= 60
            ? "days31to60"
            : days <= 90
              ? "days61to90"
              : "days91Plus";
      buckets[key] += unpaid.cents;
    }
    for (const key of Object.keys(buckets)) buckets[key] /= 100;
    return {
      name: row.name,
      balance: row.balance,
      advance: Math.max(0, -row.balance),
      ...buckets,
    };
  });
}

async function profit(req) {
  const [lines, purchases] = await Promise.all([
    salesLines(req),
    timber.activePurchaseLines(req.workspaceId, req.query.to),
  ]);
  const costs = new Map();
  for (const { lineItems } of purchases) {
    for (const line of lineItems) {
      const key = JSON.stringify([line.itemType, line.unit]);
      const cost = costs.get(key) ?? { quantity: 0, amount: 0 };
      cost.quantity = roundQuantity(cost.quantity + line.quantity);
      cost.amount = roundMoney(cost.amount + line.lineAmount);
      costs.set(key, cost);
    }
  }
  return groupedSales(lines, "itemType").map((row) => {
    const cost = costs.get(JSON.stringify([row.itemType, row.unit]));
    const estimatedCost = cost?.quantity
      ? roundMoney((row.quantity * cost.amount) / cost.quantity)
      : null;
    return {
      ...row,
      weightedAverageRate: cost?.quantity ? roundMoney(cost.amount / cost.quantity) : null,
      estimatedCost,
      estimatedProfit: estimatedCost === null ? null : roundMoney(row.sales - estimatedCost),
    };
  });
}

const ageColumns = [
  "name",
  "balance",
  "advance",
  "days0to30",
  "days31to60",
  "days61to90",
  "days91Plus",
];
const reports = new Map([
  [
    "stock",
    {
      run: stock,
      columns: ["item", "species", "grade", "unit", "quantity", "pieces", "rate", "value"],
    },
  ],
  ["sales-by-species", { run: sales, columns: ["species", "unit", "quantity", "pieces", "sales"] }],
  ["receivables-aging", { run: (req) => aging(req, false), columns: ageColumns }],
  ["payables-aging", { run: (req) => aging(req, true), columns: ageColumns }],
  [
    "profit-lite",
    {
      run: profit,
      columns: [
        "itemType",
        "unit",
        "quantity",
        "pieces",
        "sales",
        "weightedAverageRate",
        "estimatedCost",
        "estimatedProfit",
      ],
      notice:
        "Estimate using weighted-average purchase rates. It excludes transport, other charges, expenses and items without recorded cost.",
    },
  ],
]);

async function run(req, res) {
  const kind = req.params.kind;
  const report = reports.get(kind);
  if (!report) fail(404, "Timber report not found");
  const csv = req.query.format === "csv";
  if (csv)
    await assertCan(req.workspaceId, "feature:csvExport", { workspace: req.timberWorkspace });
  const rows = await report.run(req);
  if (!csv) return res.json({ rows, columns: report.columns, notice: report.notice });
  res.set("Content-Disposition", `attachment; filename="timber-${kind}.csv"`);
  return res
    .type("text/csv")
    .send(
      [
        csvCells(report.columns),
        ...rows.map((row) => csvCells(report.columns.map((field) => row[field]))),
      ].join("\r\n") + "\r\n"
    );
}

module.exports = { run };
