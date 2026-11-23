const router = require("express").Router();
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const { requireTimber } = require("../middleware/timber.middleware");
const asyncHandler = require("../middleware/asyncHandler.middleware");
const {
  item,
  adjustment,
  taxProfile,
  itemTax,
  timberSale,
} = require("../validators/timber.schema");
const items = require("../controllers/timberItems.controller");
const tax = require("../controllers/taxProfile.controller");
const invoices = require("../controllers/invoices.controller");

router.use(requireAuth, attachWorkspace);
router.get(
  "/items",
  requirePermission("transactions:create"),
  requireTimber("dimensions"),
  asyncHandler(items.list)
);
router.put(
  "/items",
  requirePermission("inventory:write"),
  requireTimber("dimensions"),
  validateBody(item),
  asyncHandler(items.save)
);

router.post(
  "/items/adjustments",
  requirePermission("inventory:write"),
  requireTimber("dimensions"),
  validateBody(adjustment),
  asyncHandler(items.adjust)
);

router.get(
  "/tax-profile",
  requirePermission("settings:manage"),
  requireTimber("gst"),
  asyncHandler(tax.get)
);
router.put(
  "/tax-profile",
  requirePermission("settings:manage"),
  requireTimber("gst"),
  validateBody(taxProfile),
  asyncHandler(tax.save)
);
router.patch(
  "/items/:itemType/tax",
  requirePermission("settings:manage"),
  requireTimber("gst"),
  validateBody(itemTax),
  asyncHandler(tax.item)
);
router.post(
  "/sale-quote",
  requirePermission("transactions:create"),
  requireTimber("gst"),
  validateBody(timberSale),
  asyncHandler(invoices.quote)
);

module.exports = router;
