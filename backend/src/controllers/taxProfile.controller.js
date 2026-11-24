const identity = require("../repositories/identity");
const sales = require("../repositories/sales");
const { writeTimber } = require("../services/timberWrite.service");
const { states, gstinState } = require("../utils/gst");
const { fail } = require("../services/atomic.service");
const audit = require("../services/audit.service");

function get(req, res) {
  const workspace = req.timberWorkspace;
  res.json({
    profile: workspace.taxProfile,
    pricesIncludeTax: workspace.config?.pricesIncludeTax ?? false,
    allowAdvances: workspace.config?.allowAdvances ?? false,
    states,
  });
}

async function save(req, res) {
  const { pricesIncludeTax, allowAdvances, ...fields } = req.body;
  const profile = { ...fields, state: gstinState(fields.gstin) };
  const workspace = await writeTimber(req, "gst", ({ db }) =>
    identity.patchWorkspace(
      req.workspaceId,
      {
        taxProfile: profile,
        config: {
          pricesIncludeTax,
          ...(allowAdvances !== undefined && { allowAdvances }),
        },
      },
      { db }
    )
  );
  await audit.record(req, {
    action: "tax.profile.update",
    entityType: "workspace",
    entityId: req.workspaceId,
    summary: "Updated tax profile",
  });
  res.json({ profile, pricesIncludeTax, config: workspace.config, states });
}

async function item(req, res) {
  const updated = await writeTimber(req, "gst", async ({ db }) => {
    const current = await sales.getInventoryItem(db, req.workspaceId, req.params.itemType, {
      lock: true,
    });
    const row =
      current?.pricingUnit && (await sales.updateInventory(db, req.workspaceId, current._id, req.body));
    if (!row) fail(404, "Timber item not found");
    return row;
  });
  await audit.record(req, {
    action: "tax.item.update",
    entityType: "inventory",
    entityId: updated._id,
    summary: "Updated item HSN and GST rate",
  });
  res.json(updated);
}

module.exports = { get, save, item };
