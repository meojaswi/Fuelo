const { z } = require("zod");

const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(6),
});

const Workspace = require("../models/workspace.model");

const newPassword = z
  .string()
  .min(8)
  .refine((value) => Buffer.byteLength(value) <= 72, "Use at most 72 bytes");

const signupSchema = z.object({
  businessName: z.string().trim().min(2),
  name: z.string().trim().min(2).max(100).optional(),
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^\+?\d+$/),
  verticalType: z.enum(Workspace.schema.path("verticalType").enumValues),
  password: newPassword,
});

const otpPhone = z
  .string()
  .min(10)
  .max(15)
  .regex(/^\+?\d+$/);
const otpRequestSchema = z.object({ phone: otpPhone });
const otpVerifySchema = otpRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/),
  password: newPassword,
});
module.exports = { loginSchema, signupSchema, otpRequestSchema, otpVerifySchema };
