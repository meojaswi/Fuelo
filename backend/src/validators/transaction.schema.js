const { z } = require("zod");
const { MAX_MONEY, roundMoney } = require("../utils/money");

const createTransactionSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(10).max(15),
  itemType: z.string().min(1),
  quantity: z.number().finite().positive(),
  unit: z.string().min(1),
  amount: z.number().min(0.005).max(MAX_MONEY).transform(roundMoney),
  paymentMode: z.enum(["cash", "upi", "credit"]),
  upiReference: z.string().optional(),
  notes: z.string().optional(),
  override: z.boolean().optional(),
});

const voidTransactionSchema = z.object({ reason: z.string().trim().min(3).max(500) });

module.exports = { createTransactionSchema, voidTransactionSchema };
