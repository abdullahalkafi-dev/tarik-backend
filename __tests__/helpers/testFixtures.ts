import mongoose from "mongoose";
import bcrypt from "bcryptjs";

export const createTestUser = async () => {
  const userId = new mongoose.Types.ObjectId();
  const authId = new mongoose.Types.ObjectId();

  return {
    userId: userId.toString(),
    authId: authId.toString(),
    user: {
      _id: userId,
      auth: authId,
      name: "Test User",
      email: "test@test.com",
    },
  };
};

export const createTestAuth = () => ({
  _id: new mongoose.Types.ObjectId(),
  email: "test@test.com",
  password: "hashedpassword123",
  role: "user",
  isSuperAdmin: false,
});

export const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 8);
};
