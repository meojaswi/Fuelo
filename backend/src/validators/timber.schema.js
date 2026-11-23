const { z } = require("zod");
const { MAX_MONEY, roundMoney } = require("../utils/money");
const { gstinState, states } = require("../utils/gst");
const { pricingUnits } = require("../utils/timber");

const text = z.string().trim().min(1).max(160);
const money = z.number().min(0).max(MAX_MONEY).transform(roundMoney);
const dimension = z.number().positive().max(1000000);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const line = z.object({
  itemType: text,
  pieces: z.number().int().min(1).max(1000000000),
  lengthFt: dimension.optional(),
  widthIn: dimension.optional(),
  thicknessIn: dimension.optional(),
  ratePerUnit: money.optional(),
});
const lines = z.array(line).min(1).max(100);
const charges = z
  .array(
    z.object({
      type: z.enum(["transport", "loading", "unloading", "other"]),
      amount: money,
      taxable: z.boolean().default(false),
    })
  )
  .max(30)
  .default([]);
const stateCode = z
  .string()
  .refine((value) => Object.hasOwn(states, value), "Enter a valid GST state code");
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => !!gstinState(value), "Enter a valid GSTIN with its checksum");
const gstRate = z.number().min(0).max(100).transform(roundMoney);
const timberSale = z.object({
  customerName: text,
  customerPhone: z.string().trim().min(10).max(15),
  customerGstin: gstin.optional(),
  customerState: stateCode.optional(),
  billingAddress: z.string().trim().max(500).optional(),
  placeOfSupply: stateCode.optional(),
  paymentMode: z.enum(["cash", "upi", "credit"]),
  paidAmount: money.optional(),
  lineItems: lines,
  charges,
  notes: z.string().trim().max(500).optional(),
  override: z.boolean().optional(),
});
const item = z.object({
  itemType: text,
  species: text,
  grade: text,
  pricingUnit: z.enum(pricingUnits),
  pricePerUnit: money,
  defaultThicknessIn: dimension.optional().nullable(),
});

const adjustment = reason.extend({
  itemType: text,
  quantity: z.number().min(0).max(MAX_MONEY),
  pieces: z.number().int().min(0).max(1000000000),
});

const optionalText = z.string().trim().max(300).optional();
const supplierFields = z.object({
  name: text,
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/)
    .or(z.literal(""))
    .optional(),
  gstin: z.string().trim().toUpperCase().max(15).optional(),
  address: optionalText,
  state: optionalText,
});
const supplier = supplierFields.extend({ openingBalance: money.default(0) });
const supplierEdit = supplierFields.partial().refine((data) => Object.keys(data).length > 0);
const payment = z.object({
  amount: z.number().min(0.005).max(MAX_MONEY).transform(roundMoney),
  paymentMode: z.enum(["cash", "upi"]),
  advance: z.boolean().default(false),
  note: optionalText,
});
const purchase = z
  .object({
    supplierId: objectId,
    invoiceNumber: text,
    invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lineItems: lines,
    charges,
    paidAmount: money.default(0),
    paymentMode: payment.shape.paymentMode.optional(),
    notes: optionalText,
  })
  .refine((data) => !data.paidAmount || data.paymentMode, {
    path: ["paymentMode"],
    message: "Choose a payment mode",
  });

const taxProfile = z
  .object({
    taxRegistered: z.boolean(),
    gstin: gstin.optional(),
    legalName: text.optional(),
    address: z.string().trim().min(1).max(500).optional(),
    invoicePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{1,4}$/)
      .refine((value) => value !== "CN")
      .default("INV"),
    chargeGstRatePercent: gstRate.nullable().optional(),
    pricesIncludeTax: z.boolean().default(false),
    allowAdvances: z.boolean().optional(),
  })
  .refine(
    (profile) =>
      !profile.taxRegistered || !!(profile.gstin && profile.legalName && profile.address),
    { path: ["gstin"], message: "A registered profile needs GSTIN, legal name and address" }
  );
const itemTax = z.object({
  hsnCode: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/)
    .nullable(),
  gstRatePercent: gstRate.nullable(),
});

module.exports = {
  gstin,
  stateCode,
  taxProfile,
  itemTax,
  text,
  money,
  objectId,
  reason,
  lines,
  charges,
  timberSale,
  item,
  adjustment,
  supplier,
  supplierEdit,
  payment,
  purchase,
};
