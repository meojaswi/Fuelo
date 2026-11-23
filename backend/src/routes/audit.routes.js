const express = require("express");
const { z } = require("zod");
const AuditLog = require("../models/auditLog.model");
const UserAccount = require("../models/userAccount.model");
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
    .regex(/^[a-f0-9]{24}$/i)
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
  const filter = { workspaceId: req.workspaceId };
  if (action) filter.action = action;
  if (actor) filter.actorUserId = actor;
  if (from || to) {
    try {
      filter.createdAt = {
        ...(from && { $gte: istDayBoundsUTC(from).startUTC }),
        ...(to && { $lt: istDayBoundsUTC(to).endUTC }),
      };
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      fail(400, "Dates must be valid YYYY-MM-DD values");
    }
    if (from && to && from > to) fail(400, "The date range is reversed");
  }
  const [events, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  const actors = await UserAccount.find({
    _id: { $in: events.map((event) => event.actorUserId).filter(Boolean) },
  }).select("name");
  const names = new Map(actors.map((user) => [String(user._id), user.name]));
  res.json({
    events: events.map((event) => ({ ...event, actorName: names.get(String(event.actorUserId)) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}

const router = express.Router();
router.get("/", requireAuth, attachWorkspace, requirePermission("audit:read"), asyncHandler(list));
module.exports = router;
