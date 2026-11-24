const { istDayBoundsUTC } = require("./datetime");

// Attendants only see their own sales from today; everyone else sees the whole workspace.
function transactionScope(req) {
  if (req.user.role !== "attendant") return {};
  const { startUTC, endUTC } = istDayBoundsUTC();
  return { createdBy: req.user.userId, from: startUTC, to: endUTC };
}

module.exports = { transactionScope };
