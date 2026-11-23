const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status =
    err.status || (err.name === "CastError" || err.name === "ValidationError" ? 400 : 500);
  if (status >= 500)
    logger.error({ msg: "Unhandled error", err: err.message, stack: err.stack, path: req.path });
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
    ...(status < 500 && err.publicCode ? { code: err.publicCode } : {}),
  });
}

module.exports = { errorHandler };
