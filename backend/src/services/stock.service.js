const Inventory = require("../models/inventory.model");
const StockMovement = require("../models/stockMovement.model");
const { fail } = require("./atomic.service");

async function recordMovement(data, { session, compensate }) {
  const movement = await new StockMovement(data).save({ session });
  compensate(() => StockMovement.deleteOne({ workspaceId: data.workspaceId, _id: movement._id }));
}

// Use decimal arithmetic before storing the result as a Number so fractional
// stock such as 0.3 - 0.2 remains available for a subsequent sale of 0.1.
function stockDelta(delta) {
  return [
    {
      $set: {
        currentStock: {
          $toDouble: { $add: [{ $toDecimal: "$currentStock" }, { $toDecimal: delta.toString() }] },
        },
      },
    },
  ];
}

async function changeStock(
  { filter, delta, reason, transactionId, createdBy, allowNegative },
  context
) {
  const { session, compensate } = context;
  const condition = { ...filter };
  if (delta < 0 && !allowNegative) condition.currentStock = { $gte: -delta };
  const item = await Inventory.findOneAndUpdate(condition, stockDelta(delta), {
    new: true,
    session,
  });
  if (!item) {
    if (reason === "void") fail(409, "The original inventory record is unavailable");
    if (await Inventory.exists(filter).session(session)) {
      fail(409, `Insufficient stock for ${filter.itemType}`);
    }
    return null;
  }

  const scope = { workspaceId: item.workspaceId, _id: item._id };
  compensate(() => Inventory.updateOne(scope, stockDelta(-delta)));
  await recordMovement(
    {
      workspaceId: item.workspaceId,
      itemType: item.itemType,
      delta,
      reason,
      transactionId,
      createdBy,
      balanceAfter: item.currentStock,
    },
    context
  );
  return item;
}

module.exports = { changeStock, recordMovement };
