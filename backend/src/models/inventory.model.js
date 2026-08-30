const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const inventorySchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    itemType: { type: String, required: true },
    currentStock: { type: Number, required: true, default: 0 },
    unit: { type: String, required: true }, // litres, kg, cubic ft, bags, etc.
    pricePerUnit: { type: Number, required: true, default: 0 },
    lastPriceUpdate: { type: Date, default: Date.now },
    priceSource: {
      type: String,
      enum: ["manual", "auto"],
      default: "manual",
    },
  },
  { timestamps: true }
);

// One inventory record per item type per workspace
inventorySchema.index({ workspaceId: 1, itemType: 1 }, { unique: true });

inventorySchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("Inventory", inventorySchema);
