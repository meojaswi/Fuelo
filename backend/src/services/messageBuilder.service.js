const env = require("../config/env");
const { getVertical } = require("../config/verticals");

function copy(workspace, template, values) {
  const { messages } = getVertical(workspace?.verticalType);
  return messages[workspace?.language === "en" ? "en" : "hi"][template](values);
}

function buildTransactionReceipt(tx, workspace) {
  return copy(workspace, "receipt", {
    name: workspace.businessName,
    customer: tx.customerName,
    item: tx.itemType,
    quantity: tx.quantity,
    unit: tx.unit,
    amount: tx.amount.toFixed(2),
    payment: tx.paymentMode.toUpperCase(),
    label: getVertical(workspace.verticalType).labels.item,
  });
}

function buildEndOfDaySummary({ workspace, date, lines, totalAmount }) {
  return copy(workspace, "eod", {
    name: workspace.businessName,
    date,
    total: totalAmount.toFixed(2),
    lines: lines.map((line) => `${line.itemType}: ${line.quantity} ${line.unit}`).join("\n"),
  });
}

function buildPaymentReceipt({ workspace, amount, remainingBalance }) {
  return copy(workspace, "payment", {
    name: workspace.businessName,
    amount: amount.toFixed(2),
    balance: remainingBalance.toFixed(2),
  });
}

function withContentTemplate(body, sid, variables) {
  return { body, ...(sid && { contentSid: sid, contentVariables: variables }) };
}

function buildPasswordOtp(code, workspace) {
  const sid =
    (workspace?.language !== "en" && env.twilio.otpContentSidHi) || env.twilio.otpContentSid;
  return withContentTemplate(copy(workspace, "otp", { code }), sid, { 1: code });
}

function buildInvite(workspace, url, code) {
  const name = workspace.businessName;
  const sid =
    (workspace?.language !== "en" && env.twilio.inviteContentSidHi) || env.twilio.inviteContentSid;
  return withContentTemplate(copy(workspace, "invite", { name, url }), sid, { 1: name, 2: code });
}

function buildReminder(workspace, customer) {
  const values = {
    name: workspace.businessName,
    customer: customer.name,
    amount: customer.creditBalance.toFixed(2),
  };
  const sid =
    (workspace.language !== "en" && env.twilio.reminderContentSidHi) ||
    env.twilio.reminderContentSid;
  return withContentTemplate(copy(workspace, "reminder", values), sid, {
    1: values.name,
    2: values.customer,
    3: values.amount,
  });
}

function buildVarianceAlert(workspace, variance) {
  const values = { name: workspace.businessName, amount: variance.toFixed(2) };
  const sid =
    (workspace.language !== "en" && env.twilio.varianceContentSidHi) ||
    env.twilio.varianceContentSid;
  return withContentTemplate(copy(workspace, "variance", values), sid, {
    1: values.name,
    2: values.amount,
  });
}

module.exports = {
  buildTransactionReceipt,
  buildEndOfDaySummary,
  buildPaymentReceipt,
  buildPasswordOtp,
  buildInvite,
  buildReminder,
  buildVarianceAlert,
};
