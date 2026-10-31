import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongo: MongoMemoryServer | undefined;

/** Pure unit tests (`__tests__/unit/**`) do not need a database; everything else gets an in-memory MongoDB. */
const needsDatabase = () => !/__tests__[\\/]unit[\\/]/.test(expect.getState().testPath || "");

beforeAll(async () => {
  if (!needsDatabase()) return;
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120_000);

afterEach(async () => {
  if (!mongo) return;
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key]!.deleteMany({});
  }
});

afterAll(async () => {
  if (!mongo) return;
  await mongoose.disconnect();
  await mongo.stop();
});
