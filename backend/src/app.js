const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const pinoHttp = require("pino-http");

const env = require("./config/env");
const logger = require("./utils/logger");
const asyncHandler = require("./middleware/asyncHandler.middleware");
const { errorHandler } = require("./middleware/errorHandler.middleware");
const linksController = require("./controllers/links.controller");
const billingController = require("./controllers/billing.controller");

const authRoutes = require("./routes/auth.routes");
const transactionsRoutes = require("./routes/transactions.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const linksRoutes = require("./routes/links.routes");
const customersRoutes = require("./routes/customers.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const summaryRoutes = require("./routes/summary.routes");
const billingRoutes = require("./routes/billing.routes");
const dealerRoutes = require("./routes/dealer.routes");
const reportsRoutes = require("./routes/reports.routes");
const inventoryRoutes = require("./routes/inventory.routes");

const app = express();
app.set("trust proxy", env.trustProxyHops);
const authPaths = ["/auth/login", "/auth/signup"];

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || env.corsOrigins.includes(origin)),
  })
);
app.use(
  pinoHttp({
    logger,
    autoLogging: env.nodeEnv !== "test",
    serializers: {
      req: (req) => ({ id: req.id, method: req.method }),
    },
  })
);

function limiter(limit, options = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    ...options,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Try again later." },
  });
}

const generalLimiter = limiter(300, {
  skip: (req) =>
    req.method === "POST" && authPaths.includes(req.path.toLowerCase().replace(/\/+$/, "")),
});
const loginLimiter = limiter(30, { skipSuccessfulRequests: true });
const signupLimiter = limiter(10);

app.use(["/api", "/links", "/billing/webhook"], generalLimiter);
app.post("/api/auth/login", loginLimiter);
app.post("/api/auth/signup", signupLimiter);

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get(["/health", "/api/health"], (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use(["/api/links", "/links"], linksRoutes);
app.use("/api/customers", customersRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/dealer", dealerRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/reports", reportsRoutes);
app.get("/api/public/receipts/:token", asyncHandler(linksController.resolve));

// Keep the previously registered provider callback usable after the API move.
app.post("/billing/webhook", asyncHandler(billingController.handleWebhook));

app.use(errorHandler);

module.exports = app;
