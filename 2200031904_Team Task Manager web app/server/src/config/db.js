const mongoose = require("mongoose");
const env = require("./env");

mongoose.set("strictQuery", true);

const connectDatabase = async () => {
  await mongoose.connect(env.mongoUri);
};

const disconnectDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

module.exports = {
  connectDatabase,
  disconnectDatabase,
};
