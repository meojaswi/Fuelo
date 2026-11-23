require("dotenv").config();
const { migrate } = require("../src/config/migrations");

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
