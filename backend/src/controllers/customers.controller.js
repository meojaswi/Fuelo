const Dealer = require("../models/dealer.model");
const LedgerEntry = require("../models/ledgerEntry.model");
const { atomic, fail } = require("../services/atomic.service");
const { postEntry } = require("../services/ledger.service");
const { enqueue } = require("../services/messageQueue.service");
const { buildPaymentReceipt } = require("../services/messageBuilder.service");
const { roundMoney } = require("../utils/money");
const Customer = require("../models/customer.model");

async function create(req, res) {
  const existing = await Customer.findOne({ workspaceId: req.workspaceId, phone: req.body.phone });
  if (existing) return res.status(409).json({ error: "Customer with this phone already exists" });

  const customer = await Customer.create({ ...req.body, workspaceId: req.workspaceId });
  res.status(201).json(customer);
}

async function list(req, res) {
  const { search } = req.query;
  const filter = { workspaceId: req.workspaceId };
  if (search) filter.$text = { $search: search };

  const customers = await Customer.find(filter).sort({ name: 1 }).limit(50);
  res.json({ customers });
}

// Lightweight autocomplete — prefix match on name, capped for UI dropdown use.
async function autocomplete(req, res) {
  const { q } = req.query;
  if (typeof q !== "string" || !q.trim()) return res.json({ customers: [] });

  const prefix = q
    .trim()
    .slice(0, 100)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const customers = await Customer.find({
    workspaceId: req.workspaceId,
    name: { $regex: `^${prefix}`, $options: "i" },
  })
    .select("name phone isCreditCustomer")
    .limit(10);

  res.json({ customers });
}

async function getById(req, res) {
  const customer = await Customer.findOne({ workspaceId: req.workspaceId, _id: req.params.id });
  if (!customer) fail(404, "Customer not found");
  res.json(customer);
}

async function update(req, res) {
  const customer = await Customer.findOneAndUpdate(
    { workspaceId: req.workspaceId, _id: req.params.id },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!customer) fail(404, "Customer not found");
  res.json(customer);
}

async function ledger(req, res) {
  const { workspaceId } = req;
  const customer = await Customer.findOne({ workspaceId, _id: req.params.id });
  if (!customer) fail(404, "Customer not found");
  const page = Math.min(1000000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = { workspaceId, customerId: customer._id };
  const [entries, total] = await Promise.all([
    LedgerEntry.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LedgerEntry.countDocuments(filter),
  ]);
  res.json({ entries, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function recordPayment(req, res) {
  const { workspaceId } = req;
  const dealer = await Dealer.findOne({ workspaceId }).select("businessName");
  if (!dealer) fail(404, "Workspace not found");
  const result = await atomic(workspaceId, async (context) => {
    const { entry, customer } = await postEntry(
      {
        ...req.body,
        workspaceId,
        customerId: req.params.id,
        type: "payment",
        direction: "credit",
        createdBy: req.user.dealerId,
      },
      context
    );
    await enqueue(
      {
        workspaceId,
        channel: "whatsapp",
        toPhone: customer.phone,
        body: buildPaymentReceipt({
          businessName: dealer.businessName,
          amount: entry.amount,
          remainingBalance: entry.balanceAfter,
        }),
      },
      context
    );
    return { entry, customer };
  });
  res.status(201).json(result);
}

async function outstanding(req, res) {
  const { workspaceId } = req;
  const customers = await Customer.aggregate([
    { $match: { workspaceId, creditBalance: { $gt: 0 } } },
    { $sort: { creditBalance: -1, _id: 1 } },
    {
      $lookup: {
        from: LedgerEntry.collection.name,
        localField: "_id",
        foreignField: "customerId",
        as: "payments",
        pipeline: [
          { $match: { workspaceId, type: "payment" } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 1 },
          { $project: { createdAt: 1, _id: 0 } },
        ],
      },
    },
    { $set: { lastPaymentAt: { $ifNull: [{ $first: "$payments.createdAt" }, null] } } },
    { $unset: "payments" },
  ]);
  res.json({
    customers,
    totalOutstanding: roundMoney(
      customers.reduce((total, customer) => total + customer.creditBalance, 0)
    ),
  });
}

module.exports = {
  create,
  list,
  autocomplete,
  getById,
  update,
  ledger,
  recordPayment,
  outstanding,
};
