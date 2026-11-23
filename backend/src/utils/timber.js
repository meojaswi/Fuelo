const { MAX_MONEY, priceForQuantity } = require("./money");

const pricingUnits = ["cubic_ft", "piece", "running_ft", "sq_ft"];
const roundQuantity = (value) => Math.round(value * 1000) / 1000;

function timberQuantity({ pieces, lengthFt = 0, widthIn = 0, thicknessIn = 0 }, unit) {
  if (!Number.isSafeInteger(pieces) || pieces < 1)
    throw new RangeError("Enter positive whole pieces");
  const dimensions = [lengthFt, widthIn, thicknessIn];
  const required = { piece: 0, running_ft: 1, sq_ft: 2, cubic_ft: 3 }[unit];
  if (
    !pricingUnits.includes(unit) ||
    dimensions.some(
      (value, index) => !Number.isFinite(value) || value < 0 || (index < required && value === 0)
    )
  )
    throw new RangeError("Enter positive dimensions for the pricing unit");
  const factors = [lengthFt, widthIn / 12, thicknessIn / 12];
  const quantity = roundQuantity(pieces * factors.slice(0, required).reduce((a, b) => a * b, 1));
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_MONEY)
    throw new RangeError("Timber quantity is outside the supported range");
  return quantity;
}

function timberAmount(rate, quantity) {
  const amount = priceForQuantity(rate, quantity);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY)
    throw new RangeError("Timber amount is outside the supported range");
  return amount;
}

module.exports = { pricingUnits, timberQuantity, timberAmount, roundQuantity };
