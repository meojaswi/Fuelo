const mongoose = require("mongoose");
const Dealer = require("../src/models/dealer.model");
const Workspace = require("../src/models/workspace.model");
const Membership = require("../src/models/membership.model");
const UserAccount = require("../src/models/userAccount.model");

async function migrate({ dryRun = false, now = new Date() } = {}) {
  const totals = { dryRun, dealers: 0, users: 0, workspaces: 0, memberships: 0 };
  const newUsers = new Set();
  const trialEndsAt = new Date(+now + 14 * 86400000);
  // If there is no existing account, the newest legacy password takes precedence.
  const dealers = Dealer.find()
    .setOptions({ skipWorkspaceGuard: true })
    .sort({ createdAt: -1, _id: -1 })
    .cursor();
  for await (const dealer of dealers) {
    totals.dealers++;
    const { workspaceId, businessName, verticalType, config, isActive, phone } = dealer;
    let user = await UserAccount.findOne({ phone });
    if (!user && !newUsers.has(phone)) {
      totals.users++;
      newUsers.add(phone);
      if (!dryRun)
        user = await UserAccount.findOneAndUpdate(
          { phone },
          { $setOnInsert: { phone, name: businessName, passwordHash: dealer.passwordHash } },
          { upsert: true, new: true }
        );
    }
    if (!dryRun && user && !user.name) {
      await UserAccount.updateOne({ _id: user._id, name: null }, { $set: { name: businessName } });
    }
    if (!(await Workspace.exists({ workspaceId }))) totals.workspaces++;
    if (!user || !(await Membership.exists({ workspaceId, userId: user._id })))
      totals.memberships++;
    if (dryRun) continue;
    await Workspace.updateOne(
      { workspaceId },
      {
        $setOnInsert: {
          _id: dealer._id,
          workspaceId,
          businessName,
          verticalType,
          config,
          isActive,
          trialEndsAt,
          createdAt: dealer.createdAt,
        },
      },
      { upsert: true, timestamps: false }
    );
    await Membership.updateOne(
      { workspaceId, userId: user._id },
      {
        $setOnInsert: {
          workspaceId,
          userId: user._id,
          role: "owner",
          status: isActive ? "active" : "disabled",
          createdAt: dealer.createdAt,
        },
      },
      { upsert: true, timestamps: false }
    );
  }
  return totals;
}

async function main() {
  const path = require("node:path");
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(process.env.MONGO_URI, { autoCreate: !dryRun, autoIndex: !dryRun });
  try {
    if (!dryRun) await Promise.all([Workspace.init(), Membership.init(), UserAccount.init()]);
    console.log(JSON.stringify(await migrate({ dryRun })));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module)
  main().catch(() => {
    console.error("Membership migration failed. Check database connectivity and indexes.");
    process.exitCode = 1;
  });
module.exports = { migrate };
