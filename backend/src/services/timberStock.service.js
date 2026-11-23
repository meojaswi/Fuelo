const Inventory = require("../models/inventory.model");
const { timberQuantity, timberAmount } = require("../utils/timber");
const { changeStock } = require("./stock.service");
const { fail } = require("./atomic.service");

async function calculateLines(workspaceId, input, session, purchase = false) {
  const items = await Inventory.find({
    workspaceId,
    itemType: { $in: input.map(({ itemType }) => itemType) },
  })
    .session(session)
    .lean();
  const byType = new Map(items.map((item) => [item.itemType, item]));
  return input.map((line) => {
    const item = byType.get(line.itemType);
    if (!item?.pricingUnit) fail(400, "Configure a timber item for " + line.itemType);
    if (purchase && line.ratePerUnit === undefined)
      fail(400, "Enter a purchase rate for " + line.itemType);
    const thicknessIn = line.thicknessIn ?? item.defaultThicknessIn ?? undefined;
    const ratePerUnit = line.ratePerUnit ?? item.pricePerUnit;
    try {
      const quantity = timberQuantity({ ...line, thicknessIn }, item.pricingUnit);
      return {
        ...line,
        inventoryId: item._id,
        thicknessIn,
        quantity,
        ratePerUnit,
        lineAmount: timberAmount(ratePerUnit, quantity),
        unit: item.pricingUnit,
        species: item.species,
        grade: item.grade,
        hsnCode: item.hsnCode,
        gstRatePercent: item.gstRatePercent,
      };
    } catch (err) {
      if (err instanceof RangeError) fail(400, line.itemType + ": " + err.message);
      throw err;
    }
  });
}

async function moveLines(record, direction, options, context) {
  for (const line of record.lineItems) {
    const item = await changeStock(
      {
        ...options,
        filter: { workspaceId: record.workspaceId, itemType: line.itemType, _id: line.inventoryId },
        delta: direction * line.quantity,
        piecesDelta: direction * line.pieces,
      },
      context
    );
    if (!item) fail(409, "Inventory item is unavailable: " + line.itemType);
  }
}

module.exports = { calculateLines, moveLines };
