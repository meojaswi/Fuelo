const Inventory = require("../models/inventory.model");
const StockMovement = require("../models/stockMovement.model");
const { atomic, fail } = require("../services/atomic.service");
const { lockWorkspace } = require("../services/workspaceWrite.service");
const { assertCan } = require("../services/entitlements.service");
const { permissionsFor } = require("../config/permissions");
const { checkTimber } = require("../middleware/timber.middleware");
const audit = require("../services/audit.service");

async function list(req, res) {
  const query = Inventory.find({ workspaceId: req.workspaceId }).sort({ itemType: 1 });
  if (!permissionsFor(req.user.role).includes("inventory:read")) {
    query.where({ pricingUnit: { $type: "string" } });
    query.select("itemType species grade pricingUnit defaultThicknessIn pricePerUnit");
  }
  res.json({ items: await query });
}

async function save(req, res) {
  const { workspaceId } = req;
  const { itemType, ...fields } = req.body;
  const item = await atomic(workspaceId, async (context) => {
    const workspace = await lockWorkspace(workspaceId, context);
    checkTimber(workspace, "dimensions");
    await assertCan(workspaceId, "write", { workspace, session: context.session });
    const scope = { workspaceId, itemType };
    const existing = await Inventory.findOne(scope).session(context.session);
    if (existing && existing.pricingUnit !== fields.pricingUnit) {
      const used = await StockMovement.exists(scope).session(context.session);
      if (existing.currentStock || existing.currentPieces || (existing.pricingUnit && used))
        fail(
          409,
          "Use a new item name to change the pricing unit of an item with stock or timber history"
        );
    }
    return Inventory.findOneAndUpdate(
      scope,
      { $set: { ...fields, unit: fields.pricingUnit } },
      {
        new: true,
        upsert: true,
        runValidators: true,
        session: context.session,
      }
    );
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
  const scope = { workspaceId, itemType };
  const item = await atomic(workspaceId, async (context) => {
    const workspace = await lockWorkspace(workspaceId, context);
    checkTimber(workspace, "dimensions");
    await assertCan(workspaceId, "write", { workspace, session: context.session });
    const previous = await Inventory.findOne(scope).session(context.session);
    if (!previous?.pricingUnit) fail(404, "Timber item not found");
    if (previous.pricingUnit === "piece" && quantity !== pieces)
      fail(400, "Piece-priced stock must have the same quantity and piece count");
    return changeStock(
      {
        filter: scope,
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
