const { randomUUID } = require("node:crypto");
const sales = require("../repositories/sales");
const { assertCan } = require("./entitlements.service");
const { checkTimber } = require("../middleware/timber.middleware");
const { fail } = require("./atomic.service");
const { calculateLines, moveLines } = require("./timberStock.service");
const { postEntry, findCreditCustomer, reverseCreditSale } = require("./ledger.service");
const { enqueue } = require("./messageQueue.service");
const { buildTransactionReceipt } = require("./messageBuilder.service");
const { allocateNumber, quoteTimberSale } = require("./gstInvoice.service");
const { MAX_MONEY, roundMoney } = require("../utils/money");

async function createTimberSale(req, workspace, input, override, context) {
  checkTimber(workspace, "dimensions");
  const { workspaceId } = req;
  const { db } = context;
  const actor = req.user.userId;
  const options = { workspace, db };
  const lineItems = await calculateLines(workspaceId, input.lineItems, db);
  const { amount, ...snapshot } = await quoteTimberSale(workspace, input, lineItems, db);
  if (amount <= 0 || amount > MAX_MONEY) fail(400, "Sale total is outside the supported range");
  const paidAmount = input.paidAmount ?? (input.paymentMode === "credit" ? 0 : amount);
  if (paidAmount > amount || (paidAmount && input.paymentMode === "credit"))
    fail(400, "Use cash or UPI for a payment no larger than the sale total");
  const creditAmount = roundMoney(amount - paidAmount);
  const first = lineItems[0];
  // Created up front: stock and ledger rows reference it before the sale row is inserted.
  const tx = {
    ...input,
    _id: randomUUID(),
    lineItems,
    workspaceId,
    createdBy: actor,
    amount,
    itemType: first.itemType,
    unit: first.unit,
    quantity: first.quantity,
    paidAmount,
    creditAmount,
    paymentMode: creditAmount ? "credit" : input.paymentMode,
  };
  await moveLines(tx, -1, { reason: "sale", transactionId: tx._id, createdBy: actor }, context);
  if (tx.creditAmount) {
    await assertCan(workspaceId, "feature:creditLedger", options);
    const customer = await findCreditCustomer(tx, context);
    tx.customerId = customer._id;
    tx.advanceApplied = Math.min(creditAmount, Math.max(0, -customer.creditBalance));
    const ledger = {
      workspaceId,
      customerId: customer._id,
      transactionId: tx._id,
      createdBy: actor,
    };
    if (paidAmount) {
      await postEntry(
        {
          ...ledger,
          type: "payment",
          direction: "credit",
          amount: paidAmount,
          paymentMode: input.paymentMode,
          affectsBalance: false,
          note: "Paid at sale. Only the unpaid amount was posted to dues.",
        },
        context
      );
    }
    await postEntry(
      {
        ...ledger,
        type: "credit_sale",
        direction: "debit",
        amount: creditAmount,
        paymentMode: "credit",
        note: tx.advanceApplied
          ? "Customer credit applied: ₹" + tx.advanceApplied.toFixed(2)
          : undefined,
      },
      context,
      { override }
    );
  }
  const issuedAt = new Date();
  tx.invoiceNumber = await allocateNumber(
    workspaceId,
    issuedAt,
    "invoice",
    workspace.taxProfile?.invoicePrefix ?? "INV",
    context
  );
  tx.invoice = { ...snapshot, issuedAt, type: snapshot.tax ? "tax_invoice" : "bill_of_supply" };
  const saved = await sales.insertTransaction(db, workspaceId, tx);
  await enqueue(
    {
      workspaceId,
      transactionId: saved._id,
      channel: "whatsapp",
      toPhone: saved.customerPhone,
      body: buildTransactionReceipt(saved, workspace),
    },
    context
  );
  return saved;
}

async function reverseTimberSale(tx, actor, context) {
  await moveLines(tx, 1, { reason: "void", transactionId: tx._id, createdBy: actor }, context);
  if (tx.creditAmount) await reverseCreditSale(tx, actor, context);
}

module.exports = { createTimberSale, reverseTimberSale };
