const { assertCan } = require("../services/entitlements.service");
const { csvLabel } = require("../utils/csv");
const Transaction = require("../models/transaction.model");
const { IST_TIME_ZONE, istDayBoundsUTC } = require("../utils/datetime");
const { fail } = require("../services/atomic.service");

const groups = new Map([
  ["day", { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: IST_TIME_ZONE } }],
  ["item", "$itemType"],
  ["paymentMode", "$paymentMode"],
]);
const DAY_MS = 86400000;

function reportBounds(from, to) {
  if (typeof from !== "string" || typeof to !== "string") {
    fail(400, "from and to must be YYYY-MM-DD dates");
  }
  try {
    const { startUTC } = istDayBoundsUTC(from);
    const { endUTC } = istDayBoundsUTC(to);
    if (endUTC <= startUTC || endUTC - startUTC > 366 * DAY_MS) {
      fail(400, "Report dates must be in order and span at most 366 days");
    }
    return { startUTC, endUTC };
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    fail(400, "from and to must be valid YYYY-MM-DD dates");
  }
}

function csvRow(rowType, label, { quantity, amount, count }) {
  return [rowType, csvLabel(label), quantity, amount.toFixed(2), count].join(",");
}

async function sales(req, res) {
  const { from, to, groupBy = "day", format = "json" } = req.query;
  if (!groups.has(groupBy) || !["json", "csv"].includes(format)) {
    fail(400, "Use groupBy day, item or paymentMode and format json or csv");
  }
  const { startUTC, endUTC } = reportBounds(from, to);
  await assertCan(req.workspaceId, format === "csv" ? "feature:csvExport" : "feature:reports");
  const [
    {
      groups: grouped,
      totals: [totals = { quantity: 0, amount: 0, count: 0 }],
    },
  ] = await Transaction.aggregate([
    {
      $match: {
        workspaceId: req.workspaceId,
        status: "active",
        createdAt: { $gte: startUTC, $lt: endUTC },
      },
    },
    {
      $group: {
        _id: groups.get(groupBy),
        quantity: { $sum: { $toDecimal: "$quantity" } },
        amount: { $sum: { $toDecimal: "$amount" } },
        count: { $sum: 1 },
      },
    },
    {
      $facet: {
        groups: [
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              group: "$_id",
              quantity: { $toDouble: "$quantity" },
              amount: { $toDouble: { $round: ["$amount", 2] } },
              count: 1,
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: null,
              quantity: { $sum: "$quantity" },
              amount: { $sum: "$amount" },
              count: { $sum: "$count" },
            },
          },
          {
            $project: {
              _id: 0,
              quantity: { $toDouble: "$quantity" },
              amount: { $toDouble: { $round: ["$amount", 2] } },
              count: 1,
            },
          },
        ],
      },
    },
  ]);

  if (format === "csv") {
    const lines = [
      "rowType,group,quantity,amount,count",
      ...grouped.map((row) => csvRow("group", row.group, row)),
      csvRow("total", "", totals),
    ];
    res.set("Content-Disposition", `attachment; filename="sales-${from}-to-${to}.csv"`);
    return res.type("text/csv").send(lines.join("\r\n") + "\r\n");
  }
  res.json({ from, to, groupBy, timezone: IST_TIME_ZONE, groups: grouped, totals });
}

module.exports = { sales };
