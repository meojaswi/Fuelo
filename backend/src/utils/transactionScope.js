const { istDayBoundsUTC } = require("./datetime");

function transactionScope(req) {
  const filter = { workspaceId: req.workspaceId };
  if (req.user.role === "attendant") {
    const { startUTC, endUTC } = istDayBoundsUTC();
    filter.createdBy = req.user.userId;
    filter.createdAt = { $gte: startUTC, $lt: endUTC };
  }
  return filter;
}

module.exports = { transactionScope };
