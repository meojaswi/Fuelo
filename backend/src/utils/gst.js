const { MAX_MONEY, roundMoney } = require("./money");
const { istDateString } = require("./datetime");

const states = Object.freeze({
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  10: "Bihar",
  11: "Sikkim",
  12: "Arunachal Pradesh",
  13: "Nagaland",
  14: "Manipur",
  15: "Mizoram",
  16: "Tripura",
  17: "Meghalaya",
  18: "Assam",
  19: "West Bengal",
  20: "Jharkhand",
  21: "Odisha",
  22: "Chhattisgarh",
  23: "Madhya Pradesh",
  24: "Gujarat",
  25: "Daman and Diu (legacy)",
  26: "Dadra and Nagar Haveli and Daman and Diu",
  27: "Maharashtra",
  28: "Andhra Pradesh (legacy)",
  29: "Karnataka",
  30: "Goa",
  31: "Lakshadweep",
  32: "Kerala",
  33: "Tamil Nadu",
  34: "Puducherry",
  35: "Andaman and Nicobar Islands",
  36: "Telangana",
  37: "Andhra Pradesh",
  38: "Ladakh",
  97: "Other Territory",
  99: "OIDAR",
});
const digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function gstinState(value) {
  if (typeof value !== "string" || !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value))
    return undefined;
  const state = value.slice(0, 2);
  if (!Object.hasOwn(states, state)) return undefined;
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const product = digits.indexOf(value[index]) * ((index % 2) + 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return digits[(36 - (sum % 36)) % 36] === value[14] ? state : undefined;
}

function financialYear(date) {
  const [year, month] = istDateString(date).split("-").map(Number);
  const start = month < 4 ? year - 1 : year;
  return [start, start + 1].map((value) => String(value).slice(-2)).join("-");
}

function gstLine(amount, rate, sameState, includesTax) {
  if (
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 100 ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > MAX_MONEY
  )
    throw new RangeError("Enter a valid configured tax rate and line amount");
  const gross = Math.round(amount * 100);
  const rateUnits = Math.round(rate * 100);
  // Multiplication stays in integer paise for amounts within the supported range.
  const numerator = BigInt(gross) * BigInt(rateUnits);
  const denominator = BigInt(includesTax ? 10000 + rateUnits : 10000);
  const tax = Number((numerator + denominator / 2n) / denominator);
  const cgst = sameState ? Math.ceil(tax / 2) : 0;
  return {
    amount,
    gstRatePercent: rate,
    taxableValue: (includesTax ? gross - tax : gross) / 100,
    cgst: cgst / 100,
    sgst: sameState ? (tax - cgst) / 100 : 0,
    igst: sameState ? 0 : tax / 100,
    total: (includesTax ? gross : gross + tax) / 100,
  };
}

function gstTotals(lines, sameState, includesTax) {
  const rows = lines.map((line) => ({
    ...line,
    ...gstLine(line.amount, line.gstRatePercent, sameState, includesTax),
  }));
  const totals = {};
  for (const key of ["taxableValue", "cgst", "sgst", "igst", "total"]) {
    totals[key] = rows.reduce((sum, row) => sum + Math.round(row[key] * 100), 0) / 100;
  }
  const roundedTotal = Math.round(totals.total);
  return { rows, ...totals, roundedTotal, roundOff: roundMoney(roundedTotal - totals.total) };
}

const small = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function integerWords(value) {
  if (value < 20) return small[value];
  if (value < 100)
    return [tens[Math.floor(value / 10)], value % 10 ? small[value % 10] : ""]
      .filter(Boolean)
      .join(" ");
  const [scale, word] = [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
    [100, "Hundred"],
  ].find(([scale]) => value >= scale);
  return [
    integerWords(Math.floor(value / scale)),
    word,
    value % scale ? integerWords(value % scale) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function amountInWords(amount) {
  const paise = Math.round(Math.abs(amount) * 100);
  const rupees = integerWords(Math.floor(paise / 100));
  return (
    (amount < 0 ? "Minus " : "") +
    rupees +
    " Rupees" +
    (paise % 100 ? " and " + integerWords(paise % 100) + " Paise" : "") +
    " Only"
  );
}

module.exports = { states, gstinState, financialYear, gstLine, gstTotals, amountInWords };
