const mongoose = require("mongoose");

const userAccountSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    dealerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Dealer" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserAccount", userAccountSchema);
