const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const linkSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    firstViewedAt: { type: Date },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

linkSchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("Link", linkSchema);
