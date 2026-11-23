const { z } = require("zod");

const name = z.string().trim().min(2).max(100);
const role = z.enum(["owner", "manager", "attendant"]);
const inviteSchema = z.object({
  name,
  role,
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^\+?\d+$/),
});
const memberPatchSchema = z
  .object({
    role: role.optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Provide a role or status");
const acceptSchema = z.object({
  token: z.string().regex(/^[a-zA-Z0-9_-]{1,128}\.[a-f0-9]{64}$/),
  name: name.optional(),
  password: z
    .string()
    .min(8)
    .refine((value) => Buffer.byteLength(value) <= 72, "Use at most 72 bytes")
    .optional(),
});

module.exports = { inviteSchema, memberPatchSchema, acceptSchema };
