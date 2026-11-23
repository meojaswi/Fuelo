const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

// Deprecated legacy source for the membership migration and historical IDs.
const dealerSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true, unique: true },
    businessName: { type: String, required: true },
    verticalType: {
      type: String,
      enum: ["fuel", "timber", "construction", "kirana", "other"],
      required: true,
    },
    phone: { type: String, required: true },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },

    // Drives dynamic transaction fields / dashboard groupings / message
    // templates without hardcoded per-vertical branches in route code.
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

dealerSchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("Dealer", dealerSchema);
