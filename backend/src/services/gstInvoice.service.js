const Counter = require("../models/invoiceCounter.model");
const Customer = require("../models/customer.model");
const { fail } = require("./atomic.service");
const { gstTotals, financialYear, gstinState } = require("../utils/gst");
const { roundMoney } = require("../utils/money");

async function allocateNumber(workspaceId, issuedAt, kind, prefix, { session, compensate }) {
  const year = financialYear(issuedAt);
  const scope = { workspaceId, year, kind };
  const row = await Counter.findOneAndUpdate(
    scope,
    { $inc: { sequence: 1 } },
    { upsert: true, new: true, session }
  );
  compensate(() =>
    Counter.updateOne({ ...scope, sequence: row.sequence }, { $inc: { sequence: -1 } })
  );
  const number = [prefix, year, String(row.sequence).padStart(4, "0")].join("/");
  if (number.length > 16) fail(409, "The invoice series is full for this financial year");
  return number;
}

async function quoteTimberSale(workspace, input, lineItems, session) {
  const profile = workspace.taxProfile;
  const buyer = await Customer.findOne({
    workspaceId: workspace.workspaceId,
    phone: input.customerPhone,
  })
    .session(session)
    .lean();
  const gstin = input.customerGstin ?? buyer?.gstin;
  const state = gstin ? gstinState(gstin) : (input.customerState ?? buyer?.state);
  if (gstin && input.customerState && input.customerState !== state)
    fail(400, "Customer state must match the GSTIN");
  const recipient = {
    name: input.customerName,
    phone: input.customerPhone,
    gstin,
    state,
    address: input.billingAddress ?? buyer?.billingAddress,
  };
  const plainTotal = roundMoney(
    lineItems.reduce((sum, line) => sum + line.lineAmount, 0) +
      input.charges.reduce((sum, charge) => sum + charge.amount, 0)
  );
  if (!profile?.taxRegistered) return { amount: plainTotal, recipient, tax: null };
  const placeOfSupply = input.placeOfSupply ?? state ?? profile.state;
  const rows = [
    ...lineItems.map((line) => {
      if (line.gstRatePercent == null)
        fail(400, "Set a GST rate for " + line.itemType + " in Inventory");
      if (!line.hsnCode) fail(400, "Set an HSN code for " + line.itemType + " in Inventory");
      return { ...line, kind: "item", amount: line.lineAmount };
    }),
    ...input.charges.map((charge) => {
      if (charge.taxable && profile.chargeGstRatePercent == null)
        fail(400, "Set a GST rate for taxable charges");
      return {
        ...charge,
        kind: "charge",
        gstRatePercent: charge.taxable ? profile.chargeGstRatePercent : 0,
      };
    }),
  ];
  const tax = gstTotals(
    rows,
    placeOfSupply === profile.state,
    workspace.config?.pricesIncludeTax === true
  );
  return { amount: tax.roundedTotal, recipient, placeOfSupply, seller: profile, tax };
}

module.exports = { allocateNumber, quoteTimberSale };
