const { MAX_MONEY, roundMoney } = require("../utils/money");
const audit = require("../services/audit.service");
const Workspace = require("../models/workspace.model");

async function updateDealer(req, res) {
  const { businessName, itemTypes, allowNegativeStock, language } = req.body;
  const updates = {};

  if (businessName) {
    updates.businessName = businessName;
  }

  // Update item types if provided
  if (itemTypes && Array.isArray(itemTypes)) {
    updates["config.itemTypes"] = itemTypes;
  }

  if (allowNegativeStock !== undefined) {
    if (typeof allowNegativeStock !== "boolean") {
      return res.status(400).json({ error: "allowNegativeStock must be a boolean" });
    }
    updates["config.allowNegativeStock"] = allowNegativeStock;
  }

  if (language !== undefined) {
    if (!["en", "hi"].includes(language))
      return res.status(400).json({ error: "Language must be en or hi" });
    updates.language = language;
  }

  for (const [key, max] of [
    ["shiftVarianceAlertRupees", MAX_MONEY],
    ["pumpVariancePercent", 100],
  ]) {
    const value = req.body[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
      return res.status(400).json({ error: `Invalid ${key}` });
    }
    updates["config." + key] = roundMoney(value);
  }
  if (req.body.attendantsCanDip !== undefined) {
    if (typeof req.body.attendantsCanDip !== "boolean")
      return res.status(400).json({ error: "attendantsCanDip must be a boolean" });
    updates["config.attendantsCanDip"] = req.body.attendantsCanDip;
  }

  if (req.body.allowAdvances !== undefined) {
    if (typeof req.body.allowAdvances !== "boolean")
      return res.status(400).json({ error: "allowAdvances must be a boolean" });
    const workspace = await Workspace.findOne({ workspaceId: req.workspaceId });
    if (workspace?.verticalType !== "timber")
      return res
        .status(400)
        .json({ error: "Customer advances are available in timber workspaces" });
    updates["config.allowAdvances"] = req.body.allowAdvances;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const dealer = await Workspace.findOneAndUpdate(
    { workspaceId: req.workspaceId },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!dealer) {
    return res.status(404).json({ error: "Dealer/workspace not found" });
  }

  await audit.record(req, {
    action: "settings.update",
    entityType: "workspace",
    entityId: dealer.workspaceId,
    summary: "Updated workspace settings",
    meta: { fields: Object.keys(updates) },
  });
  res.json({
    id: dealer._id,
    workspaceId: dealer.workspaceId,
    businessName: dealer.businessName,
    verticalType: dealer.verticalType,
    config: dealer.config,
    language: dealer.language,
  });
}

module.exports = { updateDealer };
