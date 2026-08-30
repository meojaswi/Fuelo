const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  logger.error({ msg: "Unhandled error", err: err.message, stack: err.stack, path: req.path });

  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
}

module.exports = { errorHandler };
