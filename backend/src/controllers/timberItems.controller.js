const sales = require("../repositories/sales");
const { atomic, fail } = require("../services/atomic.service");
const { lockWorkspace } = require("../services/workspaceWrite.service");
const { assertCan } = require("../services/entitlements.service");
const { permissionsFor } = require("../config/permissions");
const { checkTimber } = require("../middleware/timber.middleware");
const audit = require("../services/audit.service");

async function list(req, res) {
  const canReadAll = permissionsFor(req.user.role).includes("inventory:read");
  const items = await sales.listInventory(req.workspaceId, { timberOnly: !canReadAll });
  res.json({
    items: canReadAll
      ? items
      : items.map(
          ({ _id, itemType, species, grade, pricingUnit, defaultThicknessIn, pricePerUnit }) => ({
            _id,
            itemType,
            species,
            grade,
            pricingUnit,
            defaultThicknessIn,
            pricePerUnit,
          })
        ),
  });
}

async function save(req, res) {
  const { workspaceId } = req;
  const { itemType, ...fields } = req.body;
  const item = await atomic(workspaceId, async (context) => {
    const { db } = context;
    const workspace = await lockWorkspace(workspaceId, context);
    checkTimber(workspace, "dimensions");
    await assertCan(workspaceId, "write", { workspace, db });
    const existing = await sales.getInventoryItem(db, workspaceId, itemType, { lock: true });
    if (existing && existing.pricingUnit !== fields.pricingUnit) {
      const used = await sales.movementExistsFor(db, workspaceId, itemType);
      if (existing.currentStock || existing.currentPieces || (existing.pricingUnit && used))
        fail(
          409,
          "Use a new item name to change the pricing unit of an item with stock or timber history"
        );
    }
    return sales.upsertTimberItem(db, workspaceId, itemType, { ...fields, unit: fields.pricingUnit });
  });
  await audit.record(req, {
    action: "timber.item.save",
    entityType: "inventory",
    entityId: item._id,
    summary: "Saved timber item",
  });
  res.json(item);
}

async function adjust(req, res) {
  const { workspaceId } = req;
  const { itemType, quantity, pieces, reason } = req.body;
  const { changeStock } = require("../services/stock.service");
  const { roundQuantity } = require("../utils/timber");
  const item = await atomic(workspaceId, async (context) => {
    const { db } = context;
    const workspace = await lockWorkspace(workspaceId, context);
    checkTimber(workspace, "dimensions");
    await assertCan(workspaceId, "write", { workspace, db });
    const previous = await sales.getInventoryItem(db, workspaceId, itemType, { lock: true });
    if (!previous?.pricingUnit) fail(404, "Timber item not found");
    if (previous.pricingUnit === "piece" && quantity !== pieces)
      fail(400, "Piece-priced stock must have the same quantity and piece count");
    return changeStock(
      {
        filter: { workspaceId, itemType },
        delta: roundQuantity(quantity - previous.currentStock),
        piecesDelta: pieces - (previous.currentPieces ?? 0),
        reason: "manual_adjust",
        createdBy: req.user.userId,
      },
      context
    );
  });
  await audit.record(req, {
    action: "stock.adjust",
    entityType: "inventory",
    entityId: item._id,
    summary: "Adjusted timber stock",
    meta: { reason, quantity, pieces },
  });
  res.json(item);
}

module.exports = { list, save, adjust };
