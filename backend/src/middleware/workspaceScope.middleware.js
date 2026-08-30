/**
 * Route-level: pulls workspaceId off the authenticated user and attaches it
 * to req for controllers to use directly.
 */
function attachWorkspace(req, res, next) {
  if (!req.user || !req.user.workspaceId) {
    return res.status(403).json({ error: "No workspace context on request" });
  }
  req.workspaceId = req.user.workspaceId;
  next();
}

/**
 * Query-level: Mongoose plugin applied to every tenant-scoped schema
 * (Transaction, Customer, Notification, MessageJob, Link). Throws if a
 * find/update/delete query is issued without a workspaceId filter, so a
 * missed `.find({ workspaceId })` in a controller fails loudly in dev
 * instead of silently leaking cross-workspace data.
 *
 * Usage: schema.plugin(requireWorkspaceScope);
 */
function requireWorkspaceScope(schema) {
  const guardedOps = [
    "find",
    "findOne",
    "findOneAndUpdate",
    "findOneAndDelete",
    "updateMany",
    "updateOne",
    "deleteMany",
    "deleteOne",
    "countDocuments",
  ];

  schema.pre(guardedOps, function (next) {
    // Escape hatch for legitimate cross-workspace system queries (e.g. the
    // MessageJob drain scanning all pending jobs). Must be set explicitly
    // via .setOptions({ skipWorkspaceGuard: true }) — never a default.
    if (this.getOptions && this.getOptions().skipWorkspaceGuard) {
      return next();
    }

    const filter = this.getFilter ? this.getFilter() : this._conditions;
    if (!filter || !filter.workspaceId) {
      return next(
        new Error(
          `Blocked query on ${this.model?.modelName || "unknown model"}: missing workspaceId filter (pass { skipWorkspaceGuard: true } for intentional system queries)`
        )
      );
    }
    next();
  });
}

module.exports = { attachWorkspace, requireWorkspaceScope };
