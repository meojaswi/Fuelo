/**
 * Deterministic template strings — no LLM in v1 (see project decisions:
 * templated messaging outperforms generative for reliability/cost/speed
 * at this stage; AI messaging is a parked v2 idea).
 */

function buildTransactionReceipt(tx, businessName) {
  return (
    `${businessName}\n` +
    `${tx.customerName}, aapka transaction record:\n` +
    `${tx.itemType}: ${tx.quantity} ${tx.unit}\n` +
    `Amount: ₹${tx.amount}\n` +
    `Payment: ${tx.paymentMode.toUpperCase()}\n` +
    `Dhanyawad!`
  );
}

function buildEndOfDaySummary({ workspaceName, date, lines, totalAmount }) {
  const body = lines.map((l) => `${l.itemType}: ${l.quantity} ${l.unit}`).join("\n");
  return `${workspaceName} — Daily Summary (${date})\n` + `${body}\n` + `Total: ₹${totalAmount}`;
}

function buildPaymentReceipt({ businessName, amount, remainingBalance }) {
  return `${businessName}\nPayment received: ₹${amount.toFixed(2)}\nRemaining balance: ₹${remainingBalance.toFixed(2)}\nDhanyawad!`;
}

module.exports = { buildTransactionReceipt, buildEndOfDaySummary, buildPaymentReceipt };
