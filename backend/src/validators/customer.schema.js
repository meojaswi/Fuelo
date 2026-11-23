const { z } = require("zod");
const { MAX_MONEY, roundMoney } = require("../utils/money");

const createCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10).max(15),
  isCreditCustomer: z.boolean().optional(),
});

const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    creditLimit: z
      .number()
      .nonnegative()
      .max(MAX_MONEY)
      .transform(roundMoney)
      .nullable()
      .optional(),
    isCreditCustomer: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

const paymentSchema = z.object({
  amount: z.number().min(0.005).max(MAX_MONEY).transform(roundMoney),
  paymentMode: z.enum(["cash", "upi"]),
  upiReference: z.string().trim().max(128).optional(),
  note: z.string().trim().max(500).optional(),
});

module.exports = { createCustomerSchema, updateCustomerSchema, paymentSchema };
