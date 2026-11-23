const attendant = [
  "account:manage",
  "dashboard:read",
  "transactions:create",
  "transactions:read",
  "customers:lookup",
  "shifts:operate",
  "tanks:dip",
];
const manager = [
  ...attendant,
  "transactions:void",
  "tanks:manage",
  "deliveries:create",
  "deliveries:read",
  "shifts:read_all",
  "shifts:reopen",
  "customers:manage",
  "credit:read",
  "credit:payment",
  "credit:reminder",
  "suppliers:manage",
  "purchases:create",
  "purchases:read",
  "invoices:read",
  "invoices:credit_note",
  "payables:read",
  "payables:payment",
  "inventory:read",
  "inventory:write",
  "reports:read",
  "notifications:manage",
  "members:read",
];
const owner = [
  ...manager,
  "billing:manage",
  "members:manage",
  "settings:manage",
  "workspace:create",
  "workspace:delete",
  "audit:read",
];
const roles = new Map([
  ["owner", owner],
  ["manager", manager],
  ["attendant", attendant],
]);

function permissionsFor(role) {
  return roles.get(role) ?? [];
}

module.exports = { permissionsFor };
