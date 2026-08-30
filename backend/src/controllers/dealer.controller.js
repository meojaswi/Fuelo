const Dealer = require("../models/dealer.model");

async function updateDealer(req, res) {
  const { businessName, itemTypes } = req.body;
  const updates = {};

  if (businessName) {
    updates.businessName = businessName;
  }

  // Update item types if provided
  if (itemTypes && Array.isArray(itemTypes)) {
    updates["config.itemTypes"] = itemTypes;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const dealer = await Dealer.findOneAndUpdate(
    { workspaceId: req.workspaceId },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!dealer) {
    return res.status(404).json({ error: "Dealer/workspace not found" });
  }

  res.json({
    id: dealer._id,
    workspaceId: dealer.workspaceId,
    businessName: dealer.businessName,
    verticalType: dealer.verticalType,
    config: dealer.config,
  });
}

module.exports = { updateDealer };
