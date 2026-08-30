const IST_OFFSET_MINUTES = 5.5 * 60;

/** Returns the current time as an IST-shifted Date (for display/calc only — store UTC in Mongo). */
function nowIST() {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
}

/** Start and end of the IST business day containing `date` (defaults to now), returned in UTC. */
function istDayBoundsUTC(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  const startIST = new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 0, 0, 0)
  );
  const endIST = new Date(startIST.getTime() + 24 * 60 * 60 * 1000);

  return {
    startUTC: new Date(startIST.getTime() - IST_OFFSET_MINUTES * 60 * 1000),
    endUTC: new Date(endIST.getTime() - IST_OFFSET_MINUTES * 60 * 1000),
  };
}

module.exports = { nowIST, istDayBoundsUTC };
