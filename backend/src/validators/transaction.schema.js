const { z } = require("zod");

const createTransactionSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().min(10).max(15),
  itemType: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  amount: z.number().positive(),
  paymentMode: z.enum(["cash", "upi", "credit"]),
  upiReference: z.string().optional(),
  notes: z.string().optional(),
});

module.exports = { createTransactionSchema };
