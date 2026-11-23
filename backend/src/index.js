const app = require("./app");
const env = require("./config/env");
const connectDB = require("./config/db");
const { query } = require("./config/postgres");
const logger = require("./utils/logger");
const { startScheduler } = require("./services/scheduler.service");

async function start() {
  await query("SELECT 1");
  await connectDB();
  startScheduler();

  app.listen(env.port, () => {
    logger.info({ msg: `Fuelo backend listening on port ${env.port}`, env: env.nodeEnv });
  });
}

start().catch((err) => {
  logger.error({ msg: "Failed to start server", err: err.message });
  process.exit(1);
});
