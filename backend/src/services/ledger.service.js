const Customer = require("../models/customer.model");
const LedgerEntry = require("../models/ledgerEntry.model");
const { MAX_MONEY, roundMoney } = require("../utils/money");
const { fail } = require("./atomic.service");

async function findCreditCustomer(
  { workspaceId, customerName, customerPhone },
  { session, compensate }
) {
  const filter = { workspaceId, phone: customerPhone };
  const existing = await Customer.findOne(filter).session(session);
  if (existing) return existing;

  let customer;
  try {
    customer = await new Customer({ ...filter, name: customerName, isCreditCustomer: true }).save({
      session,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    if (!session) return Customer.findOne(filter).orFail();
    err.retryCustomerInsert = true;
    throw err;
  }
  compensate(() => Customer.deleteOne({ ...filter, _id: customer._id, creditBalance: 0 }));
  return customer;
}

async function postEntry(data, { session, compensate }, { override = false } = {}) {
  const { workspaceId, customerId, type, direction, amount } = data;
  const scope = { workspaceId, _id: customerId };
  const customer = await Customer.findOne(scope).session(session).lean();
  if (!customer) fail(404, "Customer not found");

  const rawBalance = customer.creditBalance ?? 0;
  const balance = roundMoney(rawBalance);
  const balanceAfter = roundMoney(balance + (direction === "debit" ? amount : -amount));
  if (type === "payment" && amount > balance) {
    fail(409, "Payment exceeds the outstanding balance", "OVERPAYMENT");
  }
  if (
    type === "credit_sale" &&
    !override &&
    customer.creditLimit != null &&
    balanceAfter > customer.creditLimit
  ) {
    fail(409, "This sale exceeds the customer credit limit", "CREDIT_LIMIT_EXCEEDED");
  }
  if (Math.abs(balanceAfter) > MAX_MONEY) fail(409, "Balance exceeds the supported range");

  const filter = { ...scope, creditBalance: customer.creditBalance ?? { $exists: false } };
  if (type === "credit_sale" && !override) filter.creditLimit = customer.creditLimit ?? null;
  const update = { $inc: { creditBalance: balanceAfter - rawBalance } };
  if (type === "credit_sale") update.$set = { isCreditCustomer: true };
  const updated = await Customer.findOneAndUpdate(filter, update, { new: true, session });
  if (!updated) fail(409, "Customer balance changed. Refresh and try again.");

  let appliedBalance = updated.creditBalance;
  compensate(() =>
    Customer.updateOne(
      { ...scope, creditBalance: appliedBalance },
      {
        $set: {
          creditBalance: rawBalance,
          ...(update.$set ? { isCreditCustomer: customer.isCreditCustomer ?? false } : {}),
        },
      }
    )
  );
  // Floating-point $inc can leave a sub-paise residue, e.g. 59.870000000000005.
  // Normalize within the transaction (or the serialized standalone write).
  if (appliedBalance !== balanceAfter) {
    const normalized = await Customer.updateOne(
      { ...scope, creditBalance: appliedBalance },
      { $set: { creditBalance: balanceAfter } },
      { session }
    );
    if (!normalized.matchedCount) fail(409, "Customer balance changed. Refresh and try again.");
    appliedBalance = balanceAfter;
    updated.creditBalance = balanceAfter;
  }
  const entry = await new LedgerEntry({ ...data, balanceAfter }).save({ session });
  compensate(() => LedgerEntry.deleteOne({ workspaceId, _id: entry._id }));
  return { entry, customer: updated };
}

async function recordCreditSale(transaction, createdBy, override, context) {
  const { workspaceId, _id, amount } = transaction;
  const customer = await findCreditCustomer(transaction, context);
  await postEntry(
    {
      workspaceId,
      customerId: customer._id,
      type: "credit_sale",
      direction: "debit",
      transactionId: _id,
      amount,
      paymentMode: "credit",
      createdBy,
    },
    context,
    { override }
  );
  return customer._id;
}

async function reverseCreditSale(transaction, createdBy, context) {
  const { workspaceId, _id: transactionId } = transaction;
  const original = await LedgerEntry.findOne({
    workspaceId,
    transactionId,
    type: "credit_sale",
  }).session(context.session);
  if (!original) return;

  // A sale void can leave customer credit if some of the sale was already paid.
  await postEntry(
    {
      workspaceId,
      customerId: original.customerId,
      type: "void_reversal",
      direction: "credit",
      amount: original.amount,
      transactionId,
      note: transaction.voidedReason,
      createdBy,
    },
    context
  );
}

module.exports = { postEntry, recordCreditSale, reverseCreditSale };
