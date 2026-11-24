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

module.exports = { attachWorkspace };
