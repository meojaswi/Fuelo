const IST_TIME_ZONE = "Asia/Kolkata";
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
const formatter = new Intl.DateTimeFormat("en", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function istDateString(date = new Date()) {
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value])
  );
  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`;
}

function istDayBoundsUTC(date = new Date()) {
  const key = date instanceof Date ? istDateString(date) : date;
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new RangeError("Expected a calendar date in YYYY-MM-DD format");
  }
  const midnight = new Date(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(+midnight) || midnight.toISOString().slice(0, 10) !== key) {
    throw new RangeError("Expected a valid calendar date");
  }
  const start = +midnight - IST_OFFSET_MS;
  return { startUTC: new Date(start), endUTC: new Date(start + DAY_MS) };
}

module.exports = { IST_TIME_ZONE, istDateString, istDayBoundsUTC };
