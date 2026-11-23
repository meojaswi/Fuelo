const { z } = require("zod");
const { MAX_MONEY, roundMoney } = require("../utils/money");
const { fail } = require("../services/atomic.service");

const id = z.string().regex(/^[a-f0-9]{24}$/i);
const text = z.string().trim().min(1).max(160);
const amount = z.number().min(0).max(MAX_MONEY).transform(roundMoney);
const positive = z.number().min(0.005).max(MAX_MONEY).transform(roundMoney);
const reason = z.object({ reason: z.string().trim().min(3).max(500) });
const tank = z.object({ name: text, itemType: text, capacityLitres: positive });
const tankEdit = tank
  .omit({ itemType: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0);
const delivery = z.object({
  tankId: id,
  supplierName: text,
  invoiceNumber: text.optional(),
  vehicleNumber: text.optional(),
  quantityLitres: positive,
  ratePerLitre: amount,
  override: z.boolean().default(false),
});

function parse(schema, payload, message = "Invalid pump data") {
  const result = schema.safeParse(payload);
  if (!result.success) fail(400, message);
  return result.data;
}

const nozzle = z.object({ tankId: id, label: text, lastMeterReading: amount.default(0) });
const nozzleEdit = z.object({ label: text });
const openShift = z.object({
  nozzleReadings: z
    .array(z.object({ nozzleId: id, openingMeter: amount }))
    .min(1)
    .max(100),
  explanation: z.string().trim().min(3).max(500).optional(),
});
const closeShift = z.object({
  nozzleReadings: z
    .array(z.object({ nozzleId: id, closingMeter: amount, testLitres: amount.default(0) }))
    .min(1)
    .max(100),
  declaredCash: amount,
  declaredUpi: amount,
  declaredCard: amount,
});

const dip = z.object({ readingLitres: amount, note: z.string().trim().max(500).optional() });

module.exports = {
  id,
  text,
  amount,
  positive,
  reason,
  tank,
  tankEdit,
  delivery,
  nozzle,
  nozzleEdit,
  openShift,
  closeShift,
  dip,
  parse,
};
