const Inventory = require("../models/inventory.model");
const StockMovement = require("../models/stockMovement.model");
const Tank = require("../models/tank.model");
const { roundMoney: litres } = require("../utils/money");
const { fail } = require("./atomic.service");

async function recordMovement(data, { session, compensate }) {
  const movement = await new StockMovement(data).save({ session });
  compensate(() => StockMovement.deleteOne({ workspaceId: data.workspaceId, _id: movement._id }));
  return movement;
}

// Decimal arithmetic preserves fractional stock on inventory without tanks.
function stockDelta(delta, piecesDelta) {
  return [
    {
      $set: {
        ...(piecesDelta !== undefined && {
          currentPieces: { $add: [{ $ifNull: ["$currentPieces", 0] }, piecesDelta] },
        }),
        currentStock: {
          $toDouble: { $add: [{ $toDecimal: "$currentStock" }, { $toDecimal: delta.toString() }] },
        },
      },
    },
  ];
}

function allocate(tanks, delta, { allowNegative, allowOverflow }) {
  let remaining = Math.abs(delta);
  const changes = [];
  const sign = Math.sign(delta);
  for (const tank of tanks) {
    const capacity = sign < 0 ? tank.bookStock : tank.capacityLitres - tank.bookStock;
    const amount = Math.min(remaining, Math.max(0, capacity));
    if (amount) changes.push({ tankId: tank._id, delta: sign * amount });
    remaining = litres(remaining - amount);
    if (!remaining) return changes;
  }
  if ((sign < 0 && !allowNegative) || (sign > 0 && !allowOverflow)) {
    fail(409, sign < 0 ? "Insufficient stock in the tanks" : "Stock would exceed tank capacity");
  }
  const tankId = tanks.at(-1)._id;
  const last = changes.find((change) => String(change.tankId) === String(tankId));
  if (last) last.delta = litres(last.delta + sign * remaining);
  else changes.push({ tankId, delta: sign * remaining });
  return changes;
}

async function updateTank(tank, delta, { allowNegative, allowOverflow }, { session, compensate }) {
  const bookStock = litres(tank.bookStock + delta);
  if (bookStock < 0 && !allowNegative) fail(409, "Insufficient stock in the selected tank");
  if (bookStock > tank.capacityLitres && !allowOverflow && delta > 0)
    fail(409, "Stock would exceed tank capacity");
  const scope = { workspaceId: tank.workspaceId, _id: tank._id };
  const result = await Tank.updateOne(
    { ...scope, bookStock: tank.bookStock },
    { $set: { bookStock } },
    { session }
  );
  if (!result.matchedCount) fail(409, "Tank stock changed. Refresh and try again.");
  compensate(() =>
    Tank.updateOne({ ...scope, bookStock }, { $set: { bookStock: tank.bookStock } })
  );
  return { tankId: tank._id, delta, balanceAfter: bookStock };
}

async function initializeTank(tank, openingStock, inventory, createdBy, context) {
  if (!openingStock) return tank;
  const change = await updateTank(tank, litres(openingStock), {}, context);
  await recordMovement(
    {
      workspaceId: tank.workspaceId,
      itemType: tank.itemType,
      delta: 0,
      reason: "manual_adjust",
      createdBy,
      balanceAfter: inventory.currentStock,
      tankChanges: [change],
    },
    context
  );
  tank.bookStock = change.balanceAfter;
  return tank;
}

async function changeStock(options, context) {
  const {
    filter,
    reason,
    transactionId,
    deliveryId,
    shiftId,
    purchaseId,
    piecesDelta,
    createdBy,
    allowNegative,
  } = options;
  const { session, compensate } = context;
  const tanks = await Tank.find({
    workspaceId: filter.workspaceId,
    itemType: filter.itemType,
    isActive: true,
  })
    .sort({ _id: 1 })
    .session(session);
  const tracked = tanks.length > 0;
  const delta = tracked ? litres(options.delta) : options.delta;
  if (tracked && options.delta && !delta) fail(400, "Tank quantities must be at least 0.01 litres");
  const requested =
    options.tankChanges ?? (tracked && delta ? allocate(tanks, delta, options) : []);
  if (
    requested.length &&
    litres(requested.reduce((total, change) => total + change.delta, 0)) !== delta
  ) {
    fail(409, "Tank adjustments do not match the inventory change");
  }

  const condition = { ...filter };
  if (delta < 0 && !allowNegative) condition.currentStock = { $gte: -delta };
  if (piecesDelta < 0 && !allowNegative) condition.currentPieces = { $gte: -piecesDelta };
  const item = await Inventory.findOneAndUpdate(condition, stockDelta(delta, piecesDelta), {
    new: true,
    session,
  });
  if (!item) {
    if (reason === "void" || requested.length)
      fail(409, "Stock is unavailable for this adjustment");
    if (await Inventory.exists(filter).session(session))
      fail(409, `Insufficient stock for ${filter.itemType}`);
    return null;
  }

  const scope = { workspaceId: item.workspaceId, _id: item._id };
  compensate(() =>
    Inventory.updateOne(
      scope,
      stockDelta(-delta, piecesDelta === undefined ? undefined : -piecesDelta)
    )
  );
  const tankChanges = [];
  for (const change of requested) {
    const tank = tanks.find((candidate) => String(candidate._id) === String(change.tankId));
    if (!tank) fail(409, "The original tank is unavailable");
    tankChanges.push(await updateTank(tank, litres(change.delta), options, context));
  }
  item.$locals.tankChanges = tankChanges;
  if (delta || piecesDelta || tankChanges.length) {
    const movement = await recordMovement(
      {
        workspaceId: item.workspaceId,
        itemType: item.itemType,
        delta,
        reason,
        transactionId,
        deliveryId,
        purchaseId,
        piecesDelta,
        piecesAfter: piecesDelta === undefined ? undefined : item.currentPieces,
        shiftId,
        createdBy,
        balanceAfter: item.currentStock,
        tankChanges,
      },
      context
    );
    item.$locals.movementId = movement._id;
  }
  return item;
}

module.exports = { changeStock, recordMovement, initializeTank };
