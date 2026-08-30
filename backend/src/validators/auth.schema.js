const { z } = require("zod");

const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(6),
});

module.exports = { loginSchema };
