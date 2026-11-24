const sales = require("../repositories/sales");
const { MAX_MONEY, roundMoney } = require("../utils/money");
const { fail } = require("./atomic.service");

async function findCreditCustomer({ workspaceId, customerName, customerPhone }, { db }) {
  const existing = await sales.findCustomerByPhone(db, workspaceId, customerPhone, { lock: true });
  if (existing) return existing;
  const created = await sales.insertCustomerIfAbsent(db, workspaceId, {
    phone: customerPhone,
    name: customerName,
    isCreditCustomer: true,
  });
  // Another request created the customer between the lookup and the insert.
  return created ?? sales.findCustomerByPhone(db, workspaceId, customerPhone, { lock: true });
}

// Posts one ledger entry and moves the customer's balance with it. The customer row is locked,
// so concurrent postings for one customer apply in order.
async function postEntry(data, { db }, { override = false, allowAdvance = false } = {}) {
  const { workspaceId, customerId, type, direction, amount } = data;
  const customer = await sales.getCustomer(db, workspaceId, customerId, { lock: true });
  if (!customer) fail(404, "Customer not found");

  const balance = roundMoney(customer.creditBalance ?? 0);
  if (data.affectsBalance === false) {
    const entry = await sales.insertLedgerEntry(db, workspaceId, { ...data, balanceAfter: balance });
    return { entry, customer };
  }
  const balanceAfter = roundMoney(balance + (direction === "debit" ? amount : -amount));
  if (type === "payment" && !allowAdvance && amount > balance) {
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

  const updated = await sales.updateCustomer(db, workspaceId, customerId, {
    creditBalance: balanceAfter,
    ...(type === "credit_sale" && { isCreditCustomer: true }),
  });
  const entry = await sales.insertLedgerEntry(db, workspaceId, { ...data, balanceAfter });
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
  const original = await sales.getLedgerEntryFor(context.db, workspaceId, transactionId, "credit_sale");
  if (!original) return;

  // A sale void can leave customer credit if some of the sale was already paid.
  await postEntry(
    {
      workspaceId,
      customerId: original.customerId,
      type: "void_reversal",
      direction: "credit",
      amount: roundMoney(
        original.amount + (transaction.lineItems?.length ? transaction.paidAmount || 0 : 0)
      ),
      transactionId,
      note: transaction.voidedReason,
      createdBy,
    },
    context
  );
}

module.exports = { postEntry, findCreditCustomer, recordCreditSale, reverseCreditSale };
