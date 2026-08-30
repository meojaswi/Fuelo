const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../utils/logger");

async function connectDB() {
  mongoose.set("strictQuery", true);

  await mongoose.connect(env.mongoUri);

  logger.info({ msg: "MongoDB connected", uri: env.mongoUri.replace(/\/\/.*@/, "//<redacted>@") });

  mongoose.connection.on("error", (err) => {
    logger.error({ msg: "MongoDB connection error", err: err.message });
  });

  return mongoose.connection;
}

module.exports = connectDB;
