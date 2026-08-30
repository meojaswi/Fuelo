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
  const { q = "" } = req.query;
  const customers = await Customer.find({
    workspaceId: req.workspaceId,
    name: { $regex: `^${q}`, $options: "i" },
  })
    .select("name phone isCreditCustomer")
    .limit(10);

  res.json({ customers });
}

module.exports = { create, list, autocomplete };
