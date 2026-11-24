const mongoose = require("mongoose");
const logger = require("../utils/logger");
const { getPool } = require("../config/postgres");

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

// TEMP(pg-cutover): MongoDB transactions no longer serialize writers through the workspace
// document, so hold a PostgreSQL advisory lock per workspace for the duration of the write.
// The lock is taken with try-lock polling so waiting writers never hold a pooled connection.
async function withWorkspaceLock(workspaceId, work) {
  let client;
  for (;;) {
    client = await getPool().connect();
    const { rows } = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [
      "write:" + workspaceId,
    ]);
    if (rows[0].locked) break;
    client.release();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  try {
    return await work();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["write:" + workspaceId]);
      client.release();
    } catch (error) {
      client.release(error);
    }
  }
}

function atomic(workspaceId, work) {
  return withWorkspaceLock(workspaceId, () => runAtomic(workspaceId, work));
}

async function runAtomic(workspaceId, work) {
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
