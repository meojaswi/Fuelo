const Supplier = require("../models/supplier.model");
const Entry = require("../models/supplierLedgerEntry.model");
const { MAX_MONEY, roundMoney } = require("../utils/money");
const { fail } = require("./atomic.service");

async function postSupplierEntry(data, { session, compensate }, { advance = false } = {}) {
  const { workspaceId, supplierId, amount, direction, type } = data;
  const scope = { workspaceId, _id: supplierId };
  const supplier = await Supplier.findOne(scope).session(session);
  if (!supplier) fail(404, "Supplier not found");
  if (type === "payment" && !advance && amount > supplier.balance)
    fail(
      409,
      "Payment exceeds the supplier balance. Mark it as an advance to continue.",
      "OVERPAYMENT"
    );
  const balanceAfter = roundMoney(supplier.balance + (direction === "debit" ? amount : -amount));
  if (Math.abs(balanceAfter) > MAX_MONEY) fail(409, "Supplier balance exceeds the supported range");
  const updated = await Supplier.findOneAndUpdate(
    { ...scope, balance: supplier.balance },
    { $set: { balance: balanceAfter } },
    { new: true, session }
  );
  if (!updated) fail(409, "Supplier balance changed. Refresh and try again.");
  compensate(() =>
    Supplier.updateOne({ ...scope, balance: balanceAfter }, { $set: { balance: supplier.balance } })
  );
  const entry = await new Entry({ ...data, balanceAfter }).save({ session });
  compensate(() => Entry.deleteOne({ workspaceId, _id: entry._id }));
  return { entry, supplier: updated };
}

module.exports = { postSupplierEntry };
