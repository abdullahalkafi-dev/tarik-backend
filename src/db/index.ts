import mongoose from "mongoose";
import config from "../config";
import { logger } from "../logger/logger";

const ConnectDB = async () => {
  mongoose.set("strictQuery", true);

  mongoose.plugin((schema: unknown) => {
    const s = schema as { pre: (event: string, fn: () => void) => void };
    const setRunValidators = () => ({ runValidators: true });
    s.pre("findOneAndUpdate", setRunValidators);
    s.pre("updateMany", setRunValidators);
    s.pre("updateOne", setRunValidators);
  });

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
