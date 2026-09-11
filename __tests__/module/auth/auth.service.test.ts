import { Types } from "mongoose";
import { AuthStatus, AuthProvider } from "module/auth/auth.interface";
import AppError from "errors/AppError";

jest.mock("module/auth/auth.repository", () => ({
  AuthRepository: {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateById: jest.fn(),
    deleteById: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

jest.mock("module/user/user.repository", () => ({
  UserRepository: {
    findOne: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

jest.mock("redis/redisClient", () => ({
  __esModule: true,
  default: {
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("mail/emailHelper", () => ({
  emailHelper: {
    sendEmail: jest.fn(),
  },
}));

jest.mock("mail/emailTemplate", () => ({
  __esModule: true,
  default: {
    createAccount: jest.fn().mockReturnValue({ to: "test@test.com", subject: "Verify", html: "" }),
    resetPassword: jest.fn().mockReturnValue({ to: "test@test.com", subject: "Reset", html: "" }),
  },
}));

jest.mock("jwt/createJwtToken", () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue("mock-jwt-token"),
}));

jest.mock("jwt/verifyJwtToken", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("util/generateOTP", () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue("123456"),
}));

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    compare: jest.fn() as jest.Mock,
    hash: jest.fn().mockResolvedValue("hashed-password"),
  },
}));

import { AuthRepository } from "module/auth/auth.repository";
import { UserRepository } from "module/user/user.repository";
import redisClient from "redis/redisClient";
import { emailHelper } from "mail/emailHelper";
import createJwtToken from "jwt/createJwtToken";
import verifyJwtToken from "jwt/verifyJwtToken";
import generateOTP from "util/generateOTP";
import bcrypt from "bcryptjs";
import { AuthService } from "module/auth/auth.service";

const mockAuthRepository = jest.mocked(AuthRepository);
const mockUserRepository = jest.mocked(UserRepository);
const mockRedisClient = jest.mocked(redisClient);
const mockEmailHelper = jest.mocked(emailHelper);
const mockCreateJwtToken = jest.mocked(createJwtToken);
const mockVerifyJwtToken = jest.mocked(verifyJwtToken);
const mockGenerateOTP = jest.mocked(generateOTP);
const mockBcrypt = bcrypt as unknown as { compare: jest.Mock; hash: jest.Mock };

const authId = new Types.ObjectId();
const userId = new Types.ObjectId();

const makeAuthDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: authId,
  email: "test@test.com",
  password: "hashedpassword123",
  role: "user",
  isSuperAdmin: false,
  isEmailVerified: false,
  isDeleted: false,
  status: AuthStatus.PENDING,
  loginProvider: AuthProvider.EMAIL,
  createdAt: new Date(),
  updatedAt: new Date(),
  save: jest.fn(),
  ...overrides,
});

const makeUserDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: userId,
  auth: authId,
  name: "Test User",
  email: "test@test.com",
  avatar: undefined,
  isBlocked: false,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AuthService.register", () => {
  it("should register a new user successfully", async () => {
    mockAuthRepository.findOne
      .mockResolvedValueOnce(null) // verified check
      .mockResolvedValueOnce(null); // unverified check
    mockAuthRepository.create.mockResolvedValue(makeAuthDoc() as any);
    mockUserRepository.create.mockResolvedValue(makeUserDoc() as any);
    mockRedisClient.set.mockResolvedValue(undefined as any);

    const result = await AuthService.register({
      email: "test@test.com",
      password: "Password123!",
      name: "Test User",
    });

    expect(result).toEqual({
      status: "unverified",
      email: "test@test.com",
      message: "OTP sent to your email",
    });
    expect(mockAuthRepository.create).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "otp:test@test.com:verify",
      "1234",
      expect.any(Number),
    );
    expect(mockEmailHelper.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("should throw 409 if email is already verified", async () => {
    mockAuthRepository.findOne.mockResolvedValueOnce(makeAuthDoc({ isEmailVerified: true }) as any);

    await expect(
      AuthService.register({
        email: "test@test.com",
        password: "Password123!",
        name: "Test User",
      }),
    ).rejects.toThrow(AppError);

    expect(mockAuthRepository.create).not.toHaveBeenCalled();
  });

  it("should delete unverified account and create new one", async () => {
    const oldAuth = makeAuthDoc({ _id: new Types.ObjectId() });
    mockAuthRepository.findOne
      .mockResolvedValueOnce(null) // verified check
      .mockResolvedValueOnce(oldAuth as any); // unverified check
    mockAuthRepository.create.mockResolvedValue(makeAuthDoc() as any);
    mockUserRepository.create.mockResolvedValue(makeUserDoc() as any);
    mockRedisClient.set.mockResolvedValue(undefined as any);

    const result = await AuthService.register({
      email: "test@test.com",
      password: "Password123!",
      name: "Test User",
    });

    expect(result.status).toBe("unverified");
    expect(mockUserRepository.deleteMany).toHaveBeenCalledWith({ auth: oldAuth._id });
    expect(mockAuthRepository.deleteById).toHaveBeenCalledWith(String(oldAuth._id));
  });
});

describe("AuthService.verifyOtp", () => {
  it("should verify OTP and return tokens", async () => {
    mockRedisClient.get.mockResolvedValue("1234");
    mockRedisClient.delete.mockResolvedValue(undefined as any);
    mockAuthRepository.findOne.mockResolvedValue(makeAuthDoc({ isEmailVerified: false }) as any);
    mockAuthRepository.updateById.mockResolvedValue(makeAuthDoc({ isEmailVerified: true }) as any);
    mockUserRepository.findOne.mockResolvedValue(makeUserDoc() as any);
    mockCreateJwtToken.mockReturnValue("mock-token" as any);

    const result = await AuthService.verifyOtp("test@test.com", "1234");

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result).toHaveProperty("user");
    expect(result.user).toHaveProperty("_id");
    expect(result.user).toHaveProperty("name");
    expect(mockAuthRepository.updateById).toHaveBeenCalledWith(
      String(authId),
      expect.objectContaining({ isEmailVerified: true }),
    );
  });

  it("should throw 400 for invalid OTP", async () => {
    mockRedisClient.get.mockResolvedValue(null);

    await expect(AuthService.verifyOtp("test@test.com", "000000")).rejects.toThrow(AppError);
  });

  it("should throw 400 if email is already verified", async () => {
    mockRedisClient.get.mockResolvedValue("1234");
    mockRedisClient.delete.mockResolvedValue(undefined as any);
    mockAuthRepository.findOne.mockResolvedValue(
      makeAuthDoc({ isEmailVerified: true }) as any,
    );

    await expect(AuthService.verifyOtp("test@test.com", "1234")).rejects.toThrow(AppError);
  });
});

describe("AuthService.resendOtp", () => {
  it("should resend OTP successfully", async () => {
    const auth = makeAuthDoc({ isEmailVerified: false });
    const user = makeUserDoc();
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockUserRepository.findOne.mockResolvedValue(user as any);
    mockRedisClient.set.mockResolvedValue(undefined as any);

    const result = await AuthService.resendOtp("test@test.com");

    expect(result).toEqual({ message: "OTP resent to your email" });
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "otp:test@test.com:verify",
      "1234",
      expect.any(Number),
    );
    expect(mockEmailHelper.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("should throw 404 if account not found", async () => {
    mockAuthRepository.findOne.mockResolvedValue(null);

    await expect(AuthService.resendOtp("nonexistent@test.com")).rejects.toThrow(AppError);
  });
});

describe("AuthService.login", () => {
  it("should login successfully with valid credentials", async () => {
    const auth = makeAuthDoc({ isEmailVerified: true, password: "hashedpassword123" });
    const user = makeUserDoc();
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockUserRepository.findOne.mockResolvedValue(user as any);
    mockBcrypt.compare.mockResolvedValue(true);
    mockAuthRepository.updateById.mockResolvedValue(auth as any);
    mockCreateJwtToken.mockReturnValue("mock-token" as any);

    const result = await AuthService.login({
      email: "test@test.com",
      password: "Password123!",
      loginAs: "user",
    });

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result).toHaveProperty("user");
    expect(result.user).toHaveProperty("name");
    expect(mockAuthRepository.updateById).toHaveBeenCalledWith(
      String(authId),
      expect.objectContaining({ lastLogin: expect.any(Date) }),
    );
  });

  it("should throw 401 for unverified account", async () => {
    const auth = makeAuthDoc({ isEmailVerified: false });
    mockAuthRepository.findOne.mockResolvedValue(auth as any);

    await expect(
      AuthService.login({ email: "test@test.com", password: "Password123!", loginAs: "user" }),
    ).rejects.toThrow(AppError);
  });

  it("should throw 401 for wrong password", async () => {
    const auth = makeAuthDoc({ isEmailVerified: true, password: "hashedpassword123" });
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockBcrypt.compare.mockResolvedValue(false);

    await expect(
      AuthService.login({ email: "test@test.com", password: "WrongPassword!", loginAs: "user" }),
    ).rejects.toThrow(AppError);
  });

  it("should throw 401 for non-existent email", async () => {
    mockAuthRepository.findOne.mockResolvedValue(null);

    await expect(
      AuthService.login({ email: "nonexistent@test.com", password: "Password123!", loginAs: "user" }),
    ).rejects.toThrow(AppError);
  });

  it("should throw 403 when helper tries user login", async () => {
    const auth = makeAuthDoc({ isEmailVerified: true, password: "hashedpassword123", role: "helper" });
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockBcrypt.compare.mockResolvedValue(true);

    await expect(
      AuthService.login({ email: "test@test.com", password: "Password123!", loginAs: "user" }),
    ).rejects.toThrow(AppError);
  });

  it("should throw 403 when user tries helper login", async () => {
    const auth = makeAuthDoc({ isEmailVerified: true, password: "hashedpassword123", role: "user" });
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockBcrypt.compare.mockResolvedValue(true);

    await expect(
      AuthService.login({ email: "test@test.com", password: "Password123!", loginAs: "helper" }),
    ).rejects.toThrow(AppError);
  });

  it("should throw 403 when user tries admin login", async () => {
    const auth = makeAuthDoc({ isEmailVerified: true, password: "hashedpassword123", role: "user" });
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockBcrypt.compare.mockResolvedValue(true);

    await expect(
      AuthService.login({ email: "test@test.com", password: "Password123!", loginAs: "admin" }),
    ).rejects.toThrow(AppError);
  });

  it("should allow superAdmin to login as admin", async () => {
    const auth = makeAuthDoc({ isEmailVerified: true, password: "hashedpassword123", role: "superAdmin", isSuperAdmin: true });
    const user = makeUserDoc();
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockUserRepository.findOne.mockResolvedValue(user as any);
    mockBcrypt.compare.mockResolvedValue(true);
    mockAuthRepository.updateById.mockResolvedValue(auth as any);
    mockCreateJwtToken.mockReturnValue("mock-token" as any);

    const result = await AuthService.login({
      email: "test@test.com",
      password: "Password123!",
      loginAs: "admin",
    });

    expect(result).toHaveProperty("accessToken");
  });
});

describe("AuthService.googleLogin", () => {
  it("should create new user for first-time Google login", async () => {
    mockAuthRepository.findOne.mockResolvedValue(null);
    mockAuthRepository.create.mockResolvedValue(
      makeAuthDoc({ loginProvider: AuthProvider.GOOGLE, isEmailVerified: true }) as any,
    );
    mockUserRepository.create.mockResolvedValue(makeUserDoc() as any);
    mockCreateJwtToken.mockReturnValue("mock-token" as any);

    const result = await AuthService.googleLogin({
      email: "google@test.com",
      name: "Google User",
      googleId: "google-123",
      avatar: "https://avatar.url",
    });

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result).toHaveProperty("user");
    expect(mockAuthRepository.create).toHaveBeenCalledTimes(1);
    expect(mockUserRepository.create).toHaveBeenCalledTimes(1);
  });

  it("should return tokens for existing Google user", async () => {
    const auth = makeAuthDoc({
      isEmailVerified: true,
      googleId: "google-123",
      status: AuthStatus.ACTIVE,
    });
    const user = makeUserDoc();
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockUserRepository.findOne.mockResolvedValue(user as any);
    mockAuthRepository.updateById.mockResolvedValue(auth as any);
    mockCreateJwtToken.mockReturnValue("mock-token" as any);

    const result = await AuthService.googleLogin({
      email: "test@test.com",
      name: "Test User",
      googleId: "google-123",
    });

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(mockAuthRepository.updateById).toHaveBeenCalled();
  });
});

describe("AuthService.getAccessToken", () => {
  it("should return new access token with valid refresh token", async () => {
    mockVerifyJwtToken.mockReturnValue({ authId: authId.toString() } as any);
    mockAuthRepository.findById.mockResolvedValue(makeAuthDoc() as any);
    mockUserRepository.findOne.mockResolvedValue(makeUserDoc() as any);
    mockCreateJwtToken.mockReturnValue("new-access-token" as any);

    const result = await AuthService.getAccessToken("valid-refresh-token");

    expect(result).toHaveProperty("accessToken");
    expect(mockVerifyJwtToken).toHaveBeenCalledWith("valid-refresh-token", expect.any(String));
  });

  it("should throw 401 for invalid refresh token", async () => {
    mockVerifyJwtToken.mockImplementation(() => {
      throw new Error("jwt malformed");
    });

    await expect(AuthService.getAccessToken("invalid-token")).rejects.toThrow();
  });
});

describe("AuthService.forgotPassword", () => {
  it("should send OTP for existing verified account", async () => {
    const auth = makeAuthDoc({ isEmailVerified: true });
    const user = makeUserDoc();
    mockAuthRepository.findOne.mockResolvedValue(auth as any);
    mockUserRepository.findOne.mockResolvedValue(user as any);
    mockRedisClient.set.mockResolvedValue(undefined as any);

    const result = await AuthService.forgotPassword("test@test.com");

    expect(result).toEqual({ message: "If an account exists, an OTP has been sent" });
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      "otp:test@test.com:reset",
      "123456",
      expect.any(Number),
    );
    expect(mockEmailHelper.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("should return same message for non-existent account", async () => {
    mockAuthRepository.findOne.mockResolvedValue(null);

    const result = await AuthService.forgotPassword("nonexistent@test.com");

    expect(result).toEqual({ message: "If an account exists, an OTP has been sent" });
    expect(mockEmailHelper.sendEmail).not.toHaveBeenCalled();
  });
});

describe("AuthService.verifyResetOtp", () => {
  it("should return reset token for valid OTP", async () => {
    mockRedisClient.get.mockResolvedValue("1234");
    mockRedisClient.delete.mockResolvedValue(undefined as any);
    mockAuthRepository.findOne.mockResolvedValue(makeAuthDoc() as any);
    mockCreateJwtToken.mockReturnValue("reset-token" as any);

    const result = await AuthService.verifyResetOtp("test@test.com", "1234");

    expect(result).toHaveProperty("resetToken");
    expect(result.resetToken).toBe("reset-token");
  });

  it("should throw 400 for invalid OTP", async () => {
    mockRedisClient.get.mockResolvedValue(null);

    await expect(AuthService.verifyResetOtp("test@test.com", "000000")).rejects.toThrow(AppError);
  });
});

describe("AuthService.resetPassword", () => {
  it("should reset password successfully", async () => {
    const mockSave = jest.fn().mockResolvedValue(undefined);
    const authDoc = makeAuthDoc({ save: mockSave });
    mockVerifyJwtToken.mockReturnValue({ authId: authId.toString(), type: "password_reset" } as any);
    mockAuthRepository.findById.mockResolvedValue(authDoc as any);

    const result = await AuthService.resetPassword("reset-token", "NewPassword123!");

    expect(result).toEqual({ message: "Password reset successful" });
    expect(mockSave).toHaveBeenCalled();
  });

  it("should throw 400 for non-reset token", async () => {
    mockVerifyJwtToken.mockReturnValue({ authId: authId.toString(), type: "access" } as any);

    await expect(AuthService.resetPassword("access-token", "NewPassword123!")).rejects.toThrow(
      AppError,
    );
  });
});
