const { permissionsFor } = require("../config/permissions");

function requirePermission(permission) {
  return (req, res, next) => {
    if (!permissionsFor(req.user?.role).includes(permission)) {
      return res.status(403).json({ error: "Your role does not have access to this action" });
    }
    next();
  };
}

module.exports = { requirePermission };
