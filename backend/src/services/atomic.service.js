const mongoose = require("mongoose");
const logger = require("../utils/logger");

const pending = new Map();

async function standalone(workspaceId, work) {
  const previous = pending.get(workspaceId);
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  pending.set(workspaceId, current);
  await previous;
  const undo = [];
  try {
    return await work({ session: null, compensate: (action) => undo.push(action) });
  } catch (err) {
    for (const action of undo.reverse()) {
      try {
        await action();
      } catch (rollbackError) {
        logger.error({
          msg: "Standalone write compensation failed",
          workspaceId,
          name: rollbackError.name,
          code: Number.isInteger(rollbackError.code) ? rollbackError.code : undefined,
        });
        err.status = 500;
      }
    }
    throw err;
  } finally {
    release();
    if (pending.get(workspaceId) === current) pending.delete(workspaceId);
  }
}

async function atomic(workspaceId, work) {
  const session = await mongoose.startSession();
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await session.withTransaction(() => work({ session, compensate: () => {} }));
      } catch (err) {
        if (!err.retryCustomerInsert || attempt === 2) throw err;
      }
    }
  } catch (err) {
    if (err.code !== 20 || !err.message.includes("Transaction numbers are only allowed")) throw err;
  } finally {
    await session.endSession();
  }
  return standalone(workspaceId, work);
}

function fail(status, message, publicCode) {
  throw Object.assign(new Error(message), { status, publicCode });
}

module.exports = { atomic, fail };
