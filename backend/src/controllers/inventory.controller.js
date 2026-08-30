const Inventory = require("../models/inventory.model");

async function getAll(req, res) {
  const items = await Inventory.find({ workspaceId: req.workspaceId }).sort({ itemType: 1 });
  res.json(items);
}

async function create(req, res) {
  const { itemType, currentStock, unit, pricePerUnit } = req.body;

  if (!itemType || !unit) {
    return res.status(400).json({ error: "itemType and unit are required" });
  }

  const existing = await Inventory.findOne({ workspaceId: req.workspaceId, itemType });
  if (existing) {
    return res.status(409).json({ error: `Inventory entry for "${itemType}" already exists` });
  }

  const item = await Inventory.create({
    workspaceId: req.workspaceId,
    itemType,
    currentStock: currentStock || 0,
    unit,
    pricePerUnit: pricePerUnit || 0,
    lastPriceUpdate: new Date(),
    priceSource: "manual",
  });

  res.status(201).json(item);
}

async function update(req, res) {
  const { itemType } = req.params;
  const { currentStock, pricePerUnit } = req.body;

  const updates = {};
  if (currentStock !== undefined) updates.currentStock = currentStock;
  if (pricePerUnit !== undefined) {
    updates.pricePerUnit = pricePerUnit;
    updates.lastPriceUpdate = new Date();
    updates.priceSource = "manual";
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const item = await Inventory.findOneAndUpdate(
    { workspaceId: req.workspaceId, itemType },
    { $set: updates },
    { new: true }
  );

  if (!item) {
    return res.status(404).json({ error: `Inventory item "${itemType}" not found` });
  }

  res.json(item);
}

async function remove(req, res) {
  const { itemType } = req.params;

  const item = await Inventory.findOneAndDelete({
    workspaceId: req.workspaceId,
    itemType,
  });

  if (!item) {
    return res.status(404).json({ error: `Inventory item "${itemType}" not found` });
  }

  res.json({ ok: true });
}

module.exports = { getAll, create, update, remove };
