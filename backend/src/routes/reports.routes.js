const express = require("express");
const { requirePermission } = require("../middleware/permission.middleware");
const { daily } = require("../controllers/pumpReports.controller");
const { requirePump } = require("../middleware/pump.middleware");
const { sales } = require("../controllers/reports.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();
router.get(
  "/sales",
  requireAuth,
  attachWorkspace,
  requirePermission("reports:read"),
  asyncHandler(sales)
);

router.get(
  "/pump-daily",
  requireAuth,
  attachWorkspace,
  requirePermission("reports:read"),
  requirePump("pumpReports"),
  asyncHandler(daily)
);

router.get(
  "/gst-summary",
  requireAuth,
  attachWorkspace,
  requirePermission("reports:read"),
  require("../middleware/timber.middleware").requireTimber("gst"),
  asyncHandler(require("../controllers/gstReports.controller").summary)
);

router.get(
  "/timber/:kind",
  requireAuth,
  attachWorkspace,
  requirePermission("reports:read"),
  require("../middleware/timber.middleware").requireTimber("dimensions"),
  asyncHandler(require("../controllers/timberReports.controller").run)
);

module.exports = router;
