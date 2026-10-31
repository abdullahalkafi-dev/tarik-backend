import mongoose from "mongoose";
import config from "../config";
import { logger } from "../logger/logger";

const ConnectDB = async () => {
  mongoose.set("strictQuery", true);

  // Schema validators (min/max/enum…) also run on update queries, not only on save().
  mongoose.set("runValidators", true);

  const maxPoolSize = Number(config.database.max_pool_size) || 10;

  await mongoose.connect(config.database_url as string, {
    maxPoolSize,
    serverSelectionTimeoutMS: 5000,
    bufferCommands: false,
  });

  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connected successfully");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
};

export default ConnectDB;
