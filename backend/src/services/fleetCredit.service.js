const { istDayBoundsUTC } = require("../utils/datetime");

function unpaidCharges(entries, reference = "transactionId") {
  // A void removes its own charge. Money previously applied to it remains
  // available to cover the next oldest charge, including later sales.
  const voided = new Set(
    entries.filter((row) => row.type === "void_reversal").map((row) => String(row[reference]))
  );
  const dues = [];
  let pointer = 0;
  let available = 0;
  for (const row of entries) {
    if (
      row.type === "void_reversal" ||
      (row.affectsBalance === false && !voided.has(String(row[reference]))) ||
      (row.direction === "debit" && voided.has(String(row[reference])))
    )
      continue;
    const cents = Math.round(row.amount * 100);
    if (row.direction === "credit") available += cents;
    else dues.push({ cents, date: row.createdAt, type: row.type });
    while (available && pointer < dues.length) {
      const next = dues[pointer];
      const applied = Math.min(available, next.cents);
      next.cents -= applied;
      available -= applied;
      if (!next.cents) pointer++;
    }
  }
  return dues.slice(pointer);
}

function oldestUnpaidSale(entries) {
  return unpaidCharges(entries).find((row) => row.type === "credit_sale")?.date ?? null;
}

function creditAge(entries, creditDays, now = new Date()) {
  const oldestUnpaidSaleAt = oldestUnpaidSale(entries);
  const oldestUnpaidSaleDays =
    oldestUnpaidSaleAt == null
      ? null
      : Math.max(
          0,
          Math.round(
            (istDayBoundsUTC(now).startUTC - istDayBoundsUTC(oldestUnpaidSaleAt).startUTC) /
              86400000
          )
        );
  return {
    oldestUnpaidSaleAt,
    oldestUnpaidSaleDays,
    daysOverdue:
      oldestUnpaidSaleDays == null ? null : Math.max(0, oldestUnpaidSaleDays - (creditDays ?? 0)),
  };
}

module.exports = { unpaidCharges, oldestUnpaidSale, creditAge };
