const { z } = require("zod");

const createCustomerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10).max(15),
  isCreditCustomer: z.boolean().optional(),
});

module.exports = { createCustomerSchema };
