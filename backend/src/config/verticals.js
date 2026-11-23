const messages = {
  en: {
    receipt: ({ name, customer, item, quantity, unit, amount, payment, label }) =>
      `${name}\n${customer}, here is your transaction receipt.\n${label}: ${item} · ${quantity} ${unit}\nAmount: ₹${amount}\nPayment: ${payment}\nThank you!`,
    payment: ({ name, amount, balance }) =>
      `${name}\nPayment received: ₹${amount}\nRemaining balance: ₹${balance}\nThank you!`,
    eod: ({ name, date, lines, total }) =>
      `${name} — Daily Summary (${date})\n${lines}\nTotal: ₹${total}`,
    otp: ({ code }) => `Fuelo password reset code: ${code}. It expires in 10 minutes.`,
    invite: ({ name, url }) =>
      `You have been invited to ${name} on Fuelo. Accept within 7 days: ${url}`,
    reminder: ({ name, customer, amount }) =>
      `${name}\n${customer}, your outstanding balance is ₹${amount}. Please contact us to settle it.`,
    variance: ({ name, amount }) =>
      `${name}\nShift variance: ₹${amount}. Review the closed shift in Fuelo.`,
  },
  hi: {
    receipt: ({ name, customer, item, quantity, unit, amount, payment, label }) =>
      `${name}\n${customer}, aapka transaction record:\n${label}: ${item} · ${quantity} ${unit}\nAmount: ₹${amount}\nPayment: ${payment}\nDhanyawad!`,
    payment: ({ name, amount, balance }) =>
      `${name}\nPayment received: ₹${amount}\nRemaining balance: ₹${balance}\nAapka payment mil gaya. Dhanyawad!`,
    eod: ({ name, date, lines, total }) =>
      `${name} — Aaj ka hisaab (${date})\n${lines}\nKul: ₹${total}`,
    otp: ({ code }) => `Fuelo password reset ka code: ${code}. Yeh 10 minute tak valid hai.`,
    invite: ({ name, url }) =>
      `Fuelo par ${name} ki team mein judne ka invite hai. 7 din mein accept karein: ${url}`,
    reminder: ({ name, customer, amount }) =>
      `${name}\n${customer}, aapka ₹${amount} baaki hai. Payment ke liye humse sampark karein.`,
    variance: ({ name, amount }) =>
      `${name}\nShift mein ₹${amount} ka farak hai. Fuelo mein shift dekhein.`,
  },
};

const timberMessages = {
  en: {
    ...messages.en,
    timberReceipt: ({ name, customer, lines, amount, payment }) =>
      `${name}\n${customer}, timber sale:\n${lines}\nTotal: ₹${amount}\nPayment: ${payment}`,
    purchase: ({ name, invoice, amount }) =>
      `${name} received timber against invoice ${invoice}. Recorded total: ₹${amount}.`,
  },
  hi: {
    ...messages.hi,
    timberReceipt: ({ name, customer, lines, amount, payment }) =>
      `${name}\n${customer}, aapki lakdi ki bikri:\n${lines}\nKul: ₹${amount}\nPayment: ${payment}`,
    purchase: ({ name, invoice, amount }) =>
      `${name} ko invoice ${invoice} ki lakdi mil gayi. Kul: ₹${amount}.`,
  },
};

function definition(label, unit, items, flags = {}, wording = messages) {
  return { items, labels: { item: label, unit }, flags, messages: wording };
}
const verticals = {
  fuel: definition(
    "Fuel",
    "litres",
    { Diesel: "litres", Petrol: "litres", CNG: "kg" },
    { tanks: true, deliveries: true, shifts: true, vehicleNumber: true, pumpReports: true }
  ),
  timber: definition(
    "Timber",
    "cubic ft",
    { Teak: "cubic ft", Sal: "cubic ft", Pine: "cubic ft" },
    { dimensions: true, suppliers: true, purchases: true, gst: true },
    timberMessages
  ),
  construction: definition("Material", "units", { Cement: "bags", Steel: "kg", Sand: "cubic ft" }),
  kirana: definition("Item", "units", {}),
  other: definition("Item", "units", {}),
};

function getVertical(type) {
  return Object.hasOwn(verticals, type) ? verticals[type] : verticals.other;
}

module.exports = { getVertical };
