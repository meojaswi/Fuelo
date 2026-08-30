const express = require("express");
const cors = require("cors");
const pinoHttp = require("pino-http");

const env = require("./config/env");
const connectDB = require("./config/db");
const logger = require("./utils/logger");
const { errorHandler } = require("./middleware/errorHandler.middleware");
const { startScheduler } = require("./services/scheduler.service");

const authRoutes = require("./routes/auth.routes");
const transactionsRoutes = require("./routes/transactions.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const linksRoutes = require("./routes/links.routes");
const customersRoutes = require("./routes/customers.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const summaryRoutes = require("./routes/summary.routes");
const billingRoutes = require("./routes/billing.routes");

const app = express();

app.use(cors());
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(pinoHttp({ logger }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/transactions", transactionsRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/links", linksRoutes);
app.use("/customers", customersRoutes);
app.use("/notifications", notificationsRoutes);
app.use("/summary", summaryRoutes);
app.use("/billing", billingRoutes);

app.use(errorHandler);

async function start() {
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
