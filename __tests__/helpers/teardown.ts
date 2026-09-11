import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

export const teardown = async (mongo: MongoMemoryServer) => {
  await mongoose.disconnect();
  await mongo.stop();
};
