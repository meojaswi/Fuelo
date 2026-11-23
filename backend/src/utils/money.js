const MAX_MONEY = Number.MAX_SAFE_INTEGER / 100;

function roundMoney(value) {
  const [coefficient, exponent = "0"] = Math.abs(value).toString().split("e");
  const cents = Math.round(Number(`${coefficient}e${Number(exponent) + 2}`));
  return Math.sign(value) * (cents / 100);
}

function decimalParts(value) {
  const [coefficient, exponent = "0"] = value.toString().split("e");
  const [integer, fraction = ""] = coefficient.split(".");
  return { digits: BigInt(integer + fraction), power: Number(exponent) - fraction.length };
}

function priceForQuantity(price, quantity) {
  const unit = decimalParts(price);
  const units = decimalParts(quantity);
  const digits = unit.digits * units.digits;
  const centsPower = unit.power + units.power + 2;
  const factor = 10n ** BigInt(Math.abs(centsPower));
  const cents = centsPower >= 0 ? digits * factor : (digits + factor / 2n) / factor;
  return Number(cents) / 100;
}

module.exports = { MAX_MONEY, roundMoney, priceForQuantity };
