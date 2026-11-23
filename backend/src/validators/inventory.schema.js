const { z } = require("zod");
const { MAX_MONEY, roundMoney } = require("../utils/money");

const inventoryValues = {
  currentStock: z.number().finite().nonnegative().optional(),
  pricePerUnit: z.number().nonnegative().max(MAX_MONEY).transform(roundMoney).optional(),
};

const createInventorySchema = z.object({
  itemType: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  ...inventoryValues,
});
const updateInventorySchema = z
  .object(inventoryValues)
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

module.exports = { createInventorySchema, updateInventorySchema };
