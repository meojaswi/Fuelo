const express = require("express");
const { z } = require("zod");
const auditLog = require("../repositories/auditLog");
const { istDayBoundsUTC } = require("../utils/datetime");
const { fail } = require("../services/atomic.service");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const asyncHandler = require("../middleware/asyncHandler.middleware");

const querySchema = z.object({
  action: z.string().max(80).optional(),
  actor: z
    .string()
    .uuid()
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function list(req, res) {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) fail(400, "Invalid activity filters");
  const { action, actor, from, to, page, limit } = parsed.data;
  let start;
  let end;
  if (from || to) {
    try {
      start = from && istDayBoundsUTC(from).startUTC;
      end = to && istDayBoundsUTC(to).endUTC;
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      fail(400, "Dates must be valid YYYY-MM-DD values");
    }
    if (from && to && from > to) fail(400, "The date range is reversed");
  }
  const { events, total } = await auditLog.list(req.workspaceId, {
    action: action ?? null,
    actor: actor ?? null,
    start: start ?? null,
    end: end ?? null,
    page,
    limit,
  });
  res.json({ events, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

const router = express.Router();
router.get("/", requireAuth, attachWorkspace, requirePermission("audit:read"), asyncHandler(list));
module.exports = router;
