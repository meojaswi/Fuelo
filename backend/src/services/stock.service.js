const sales = require("../repositories/sales");
const pump = require("../repositories/pump");
const { roundMoney: litres } = require("../utils/money");
const { fail } = require("./atomic.service");

function recordMovement(data, { db }) {
  return sales.insertMovement(db, data.workspaceId, data);
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
  const last = changes.find((change) => change.tankId === tankId);
  if (last) last.delta = litres(last.delta + sign * remaining);
  else changes.push({ tankId, delta: sign * remaining });
  return changes;
}

async function updateTank(tank, delta, { allowNegative, allowOverflow }, { db }) {
  const bookStock = litres(tank.bookStock + delta);
  if (bookStock < 0 && !allowNegative) fail(409, "Insufficient stock in the selected tank");
  if (bookStock > tank.capacityLitres && !allowOverflow && delta > 0)
    fail(409, "Stock would exceed tank capacity");
  const result = await pump.updateTank(db, tank.workspaceId, tank._id, { bookStock }, {
    bookStock: tank.bookStock,
  });
  if (!result) fail(409, "Tank stock changed. Refresh and try again.");
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
  return { ...tank, bookStock: change.balanceAfter };
}

// Changes one item's stock (and its tanks') and records the movement. Returns the updated item
// with `tankChanges` and `movementId`, or null when an untracked item does not exist.
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
  const { db } = context;
  const { workspaceId, itemType, _id: itemId } = filter;
  const tanks = await pump.activeTanksForItem(db, workspaceId, itemType);
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

  const item = await sales.adjustInventory(
    db,
    { workspaceId, itemType, id: itemId },
    { delta, piecesDelta, allowNegative }
  );
  if (!item) {
    if (reason === "void" || requested.length)
      fail(409, "Stock is unavailable for this adjustment");
    if (await sales.inventoryExists(db, workspaceId, itemType, itemId))
      fail(409, `Insufficient stock for ${itemType}`);
    return null;
  }

  const tankChanges = [];
  for (const change of requested) {
    const tank = tanks.find((candidate) => candidate._id === change.tankId);
    if (!tank) fail(409, "The original tank is unavailable");
    tankChanges.push(await updateTank(tank, litres(change.delta), options, context));
  }
  let movementId;
  if (delta || piecesDelta || tankChanges.length) {
    const movement = await recordMovement(
      {
        workspaceId,
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
    movementId = movement._id;
  }
  // Hidden from JSON so the item can be returned to clients as it is.
  return Object.defineProperties(
    { ...item },
    {
      tankChanges: { value: tankChanges, enumerable: false },
      movementId: { value: movementId, enumerable: false },
    }
  );
}

module.exports = { changeStock, recordMovement, initializeTank };
