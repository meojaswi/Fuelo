const { z } = require("zod");

const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(6),
});

const Dealer = require("../models/dealer.model");

const signupSchema = z.object({
  businessName: z.string().trim().min(2),
  phone: z.string().min(10).max(15).regex(/^\+?\d+$/),
  verticalType: z.enum(Dealer.schema.path("verticalType").enumValues),
  password: z.string().min(8),
});

module.exports = { loginSchema, signupSchema };
