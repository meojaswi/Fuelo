const Tank = require("../models/tank.model");
const StockMovement = require("../models/stockMovement.model");
const DipReading = require("../models/dipReading.model");
const Shift = require("../models/shift.model");
const Delivery = require("../models/delivery.model");
const Transaction = require("../models/transaction.model");
const UserAccount = require("../models/userAccount.model");
const { IST_TIME_ZONE, istDayBoundsUTC } = require("../utils/datetime");
const { roundMoney: round } = require("../utils/money");
const { csvCells } = require("../utils/csv");
const { assertCan } = require("../services/entitlements.service");
const { fail } = require("../services/atomic.service");

function tankTotals() {
  return {
    openingBookStock: 0,
    deliveriesLitres: 0,
    individualSalesLitres: 0,
    meterSalesLitres: 0,
    meterAdditionalLitres: 0,
    adjustmentLitres: 0,
    closingBookStock: 0,
    throughputLitres: 0,
  };
}

async function daily(req, res) {
  const { workspaceId, pumpWorkspace } = req;
  const { date, format = "json" } = req.query;
  if (typeof date !== "string" || !["json", "csv"].includes(format))
    fail(400, "Provide an IST date and a valid report format");
  let bounds;
  try {
    bounds = istDayBoundsUTC(date);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    fail(400, "Date must be valid YYYY-MM-DD");
  }
  if (format === "csv")
    await assertCan(workspaceId, "feature:csvExport", { workspace: pumpWorkspace });
  const { startUTC, endUTC } = bounds;
  const window = { $gte: startUTC, $lt: endUTC };
  const threshold = pumpWorkspace.config?.pumpVariancePercent ?? 0.5;
  const [tanks, opening, posted, shifts, dips] = await Promise.all([
    Tank.find({ workspaceId, createdAt: { $lt: endUTC } })
      .sort({ itemType: 1, name: 1 })
      .lean(),
    StockMovement.aggregate([
      { $match: { workspaceId, createdAt: { $lt: startUTC }, "tankChanges.0": { $exists: true } } },
      { $unwind: "$tankChanges" },
      {
        $group: {
          _id: "$tankChanges.tankId",
          opening: { $sum: { $toDecimal: "$tankChanges.delta" } },
        },
      },
      { $set: { opening: { $toDouble: "$opening" } } },
    ]),
    StockMovement.find({ workspaceId, createdAt: window, "tankChanges.0": { $exists: true } })
      .select("reason tankChanges deliveryId transactionId")
      .lean(),
    Shift.find({ workspaceId, status: "closed", closedAt: window })
      .sort({ closedAt: 1, _id: 1 })
      .lean(),
    DipReading.aggregate([
      { $match: { workspaceId, recordedAt: window } },
      { $sort: { recordedAt: -1, _id: -1 } },
      { $group: { _id: "$tankId", latest: { $first: "$$ROOT" } } },
    ]),
  ]);
  const [voidedDeliveries, voidedSales] = await Promise.all(
    [
      [Delivery, "deliveryId"],
      [Transaction, "transactionId"],
    ].map(async ([model, key]) => {
      const ids = posted.flatMap((entry) => (entry[key] ? [entry[key]] : []));
      if (!ids.length) return new Set();
      const records = await model
        .find({ workspaceId, _id: { $in: ids }, status: "voided" })
        .select("_id")
        .lean();
      return new Set(records.map(({ _id }) => String(_id)));
    })
  );
  const byId = new Map(
    tanks.map((tank) => [
      String(tank._id),
      {
        tankId: tank._id,
        name: tank.name,
        itemType: tank.itemType,
        ...tankTotals(),
        latestDip: null,
      },
    ])
  );
  for (const entry of opening) {
    const row = byId.get(String(entry._id));
    if (row) row.openingBookStock = round(entry.opening);
  }
  for (const { latest } of dips) {
    const row = byId.get(String(latest.tankId));
    if (row) row.latestDip = latest;
  }
  for (const { reason, tankChanges, deliveryId, transactionId } of posted) {
    for (const { tankId, delta } of tankChanges) {
      const row = byId.get(String(tankId));
      if (!row) continue;
      // Keep the dated book postings for voided records in adjustments, outside sales and deliveries.
      if (
        reason === "delivery_void" ||
        reason === "void" ||
        voidedDeliveries.has(String(deliveryId)) ||
        voidedSales.has(String(transactionId))
      ) row.adjustmentLitres += delta;
      else if (reason === "purchase") row.deliveriesLitres += delta;
      else if (reason === "sale") row.individualSalesLitres -= delta;
      else if (reason === "shift_sale" || reason === "shift_reopen")
        row.meterAdditionalLitres -= delta;
      else row.adjustmentLitres += delta;
    }
  }
  const people = await UserAccount.find({
    _id: { $in: shifts.map((shift) => shift.openedBy) },
  }).select("name");
  const names = new Map(people.map(({ _id, name }) => [String(_id), name]));
  const summaries = shifts.map((shift) => {
    let litres = 0;
    for (const reading of shift.nozzleReadings) {
      const row = byId.get(String(reading.tankId));
      if (row) row.meterSalesLitres += reading.litresSold;
      litres += reading.litresSold;
    }
    return {
      shiftId: shift._id,
      openedBy: shift.openedBy,
      openedByName: names.get(String(shift.openedBy)),
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      hours: round((shift.closedAt - shift.openedAt) / 3600000),
      litres: round(litres),
      expectedSalesTotal: shift.expectedSalesTotal,
      declaredCash: shift.declaredCash,
      declaredUpi: shift.declaredUpi,
      declaredCard: shift.declaredCard,
      declaredTotal: round(shift.declaredCash + shift.declaredUpi + shift.declaredCard),
      creditSalesTotal: shift.creditSalesTotal,
      variance: shift.variance,
    };
  });
  const tankRows = [];
  const byItem = new Map();
  for (const row of byId.values()) {
    row.throughputLitres = Math.abs(round(row.individualSalesLitres + row.meterAdditionalLitres));
    row.closingBookStock =
      row.openingBookStock +
      row.deliveriesLitres +
      row.adjustmentLitres -
      row.individualSalesLitres -
      row.meterAdditionalLitres;
    // Decision aid only: a dip is compared with book stock at its recorded time.
    // This report is not a legal measurement or a certification of dispensed fuel.
    row.varianceLitres = row.latestDip?.varianceLitres ?? null;
    row.flagged =
      row.varianceLitres !== null &&
      Math.abs(row.varianceLitres) > (row.throughputLitres * threshold) / 100;
    if (!byItem.has(row.itemType))
      byItem.set(row.itemType, {
        itemType: row.itemType,
        ...tankTotals(),
        dippedTanks: 0,
        varianceLitres: null,
        flagged: false,
      });
    const item = byItem.get(row.itemType);
    for (const key of Object.keys(tankTotals())) {
      row[key] = round(row[key]);
      item[key] = round(item[key] + row[key]);
    }
    if (row.latestDip) {
      item.dippedTanks++;
      item.varianceLitres = round((item.varianceLitres ?? 0) + row.varianceLitres);
    }
    item.flagged ||= row.flagged;
    tankRows.push(row);
  }
  const items = [...byItem.values()];
  if (format === "csv") {
    const header =
      "type,item,tank,opening,deliveries,meterSales,individualSales,meterAdditional,adjustments,closing,dip,varianceLitres,flagged,operator,hours,litres,expected,declared,credit,varianceAmount";
    const rows = [
      ...items.map((row) =>
        csvCells([
          "item",
          row.itemType,
          "",
          row.openingBookStock,
          row.deliveriesLitres,
          row.meterSalesLitres,
          row.individualSalesLitres,
          row.meterAdditionalLitres,
          row.adjustmentLitres,
          row.closingBookStock,
          "",
          row.varianceLitres,
          row.flagged,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ])
      ),
      ...tankRows.map((row) =>
        csvCells([
          "tank",
          row.itemType,
          row.name,
          row.openingBookStock,
          row.deliveriesLitres,
          row.meterSalesLitres,
          row.individualSalesLitres,
          row.meterAdditionalLitres,
          row.adjustmentLitres,
          row.closingBookStock,
          row.latestDip?.readingLitres ?? "",
          row.varianceLitres,
          row.flagged,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ])
      ),
      ...summaries.map((shift) =>
        csvCells([
          "shift",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          shift.openedByName || shift.openedBy,
          shift.hours,
          shift.litres,
          shift.expectedSalesTotal,
          shift.declaredTotal,
          shift.creditSalesTotal,
          shift.variance,
        ])
      ),
    ];
    res.set("Content-Disposition", `attachment; filename="pump-daily-${date}.csv"`);
    return res.type("text/csv").send([header, ...rows, ""].join("\r\n"));
  }
  res.json({
    date,
    timezone: IST_TIME_ZONE,
    varianceThresholdPercent: threshold,
    items,
    tanks: tankRows,
    shifts: summaries,
  });
}

module.exports = { daily };
