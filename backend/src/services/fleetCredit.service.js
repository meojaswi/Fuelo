const { istDayBoundsUTC } = require("../utils/datetime");

function oldestUnpaidSale(entries) {
  // A void removes its own charge. Money previously applied to it remains
  // available to cover the next oldest charge, including later sales.
  const voided = new Set(
    entries.filter((row) => row.type === "void_reversal").map((row) => String(row.transactionId))
  );
  const dues = [];
  let pointer = 0;
  let available = 0;
  for (const row of entries) {
    if (
      row.type === "void_reversal" ||
      (row.type === "credit_sale" && voided.has(String(row.transactionId)))
    )
      continue;
    const cents = Math.round(row.amount * 100);
    if (row.direction === "credit") available += cents;
    else dues.push({ cents, date: row.createdAt, sale: row.type === "credit_sale" });
    while (available && pointer < dues.length) {
      const next = dues[pointer];
      const applied = Math.min(available, next.cents);
      next.cents -= applied;
      available -= applied;
      if (!next.cents) pointer++;
    }
  }
  return dues.slice(pointer).find((row) => row.sale)?.date ?? null;
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

module.exports = { oldestUnpaidSale, creditAge };
