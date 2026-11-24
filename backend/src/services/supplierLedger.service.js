const timber = require("../repositories/timber");
const { MAX_MONEY, roundMoney } = require("../utils/money");
const { fail } = require("./atomic.service");

async function postSupplierEntry(data, { db }, { advance = false } = {}) {
  const { workspaceId, supplierId, amount, direction, type } = data;
  const supplier = await timber.getSupplier(db, workspaceId, supplierId, { lock: true });
  if (!supplier) fail(404, "Supplier not found");
  if (type === "payment" && !advance && amount > supplier.balance)
    fail(
      409,
      "Payment exceeds the supplier balance. Mark it as an advance to continue.",
      "OVERPAYMENT"
    );
  const balanceAfter = roundMoney(supplier.balance + (direction === "debit" ? amount : -amount));
  if (Math.abs(balanceAfter) > MAX_MONEY) fail(409, "Supplier balance exceeds the supported range");
  const updated = await timber.updateSupplier(db, workspaceId, supplierId, { balance: balanceAfter });
  const entry = await timber.insertEntry(db, workspaceId, { ...data, balanceAfter });
  return { entry, supplier: updated };
}

module.exports = { postSupplierEntry };
