import { StatusCodes } from "http-status-codes";
import { AuthController } from "module/auth/auth.controller";
import { AuthService } from "module/auth/auth.service";
import { mockRequest } from "../../helpers/mockRequest";
import { mockResponse } from "../../helpers/mockResponse";

jest.mock("module/auth/auth.service", () => ({
  AuthService: {
    register: jest.fn(),
    verifyOtp: jest.fn(),
    resendOtp: jest.fn(),
    login: jest.fn(),
    googleLogin: jest.fn(),
    getAccessToken: jest.fn(),
    forgotPassword: jest.fn(),
    verifyResetOtp: jest.fn(),
    resetPassword: jest.fn(),
  },
}));

const mockAuthService = jest.mocked(AuthService);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AuthController.register", () => {
  it("should call AuthService.register and return 201", async () => {
    const req = mockRequest({ body: { email: "test@test.com", password: "Pass123!", name: "Test" } });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.register.mockResolvedValue({
      status: "unverified",
      email: "test@test.com",
      message: "OTP sent to your email",
    });

    await AuthController.register(req, res, next);

    expect(mockAuthService.register).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(StatusCodes.CREATED);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "OTP sent to your email",
        data: { status: "unverified", email: "test@test.com" },
      }),
    );
  });
});

describe("AuthController.verifyOtp", () => {
  it("should call AuthService.verifyOtp and return 200", async () => {
    const req = mockRequest({ body: { email: "test@test.com", otp: "123456" } });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.verifyOtp.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { _id: "123", name: "Test", email: "test@test.com", role: "user", status: "active" },
    } as any);

    await AuthController.verifyOtp(req, res, next);

    expect(mockAuthService.verifyOtp).toHaveBeenCalledWith("test@test.com", "123456");
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Email verified successfully",
      }),
    );
  });
});

describe("AuthController.resendOtp", () => {
  it("should call AuthService.resendOtp and return 200", async () => {
    const req = mockRequest({ body: { email: "test@test.com" } });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.resendOtp.mockResolvedValue({ message: "OTP resent to your email" });

    await AuthController.resendOtp(req, res, next);

    expect(mockAuthService.resendOtp).toHaveBeenCalledWith("test@test.com");
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "OTP resent to your email",
        data: null,
      }),
    );
  });
});

describe("AuthController.login", () => {
  it("should call AuthService.login and return 200", async () => {
    const req = mockRequest({ body: { email: "test@test.com", password: "Pass123!" } });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.login.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { _id: "123", name: "Test", email: "test@test.com" },
    } as any);

    await AuthController.login(req, res, next);

    expect(mockAuthService.login).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Login successful",
      }),
    );
  });
});

describe("AuthController.googleLogin", () => {
  it("should call AuthService.googleLogin and return 200", async () => {
    const req = mockRequest({
      body: { email: "g@test.com", name: "Google", googleId: "g-123" },
    });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.googleLogin.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: { _id: "123", name: "Google", email: "g@test.com" },
    } as any);

    await AuthController.googleLogin(req, res, next);

    expect(mockAuthService.googleLogin).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Login successful",
      }),
    );
  });
});

describe("AuthController.getAccessToken", () => {
  it("should call AuthService.getAccessToken and return 200", async () => {
    const req = mockRequest({ body: { refreshToken: "refresh-token" } });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.getAccessToken.mockResolvedValue({ accessToken: "new-access-token" });

    await AuthController.getAccessToken(req, res, next);

    expect(mockAuthService.getAccessToken).toHaveBeenCalledWith("refresh-token");
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Token refreshed",
      }),
    );
  });
});

describe("AuthController.forgotPassword", () => {
  it("should call AuthService.forgotPassword and return 200", async () => {
    const req = mockRequest({ body: { email: "test@test.com" } });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.forgotPassword.mockResolvedValue({
      message: "If an account exists, an OTP has been sent",
    });

    await AuthController.forgotPassword(req, res, next);

    expect(mockAuthService.forgotPassword).toHaveBeenCalledWith("test@test.com");
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "If an account exists, an OTP has been sent",
        data: null,
      }),
    );
  });
});

describe("AuthController.verifyResetOtp", () => {
  it("should call AuthService.verifyResetOtp and return 200", async () => {
    const req = mockRequest({ body: { email: "test@test.com", otp: "123456" } });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.verifyResetOtp.mockResolvedValue({ resetToken: "reset-token" });

    await AuthController.verifyResetOtp(req, res, next);

    expect(mockAuthService.verifyResetOtp).toHaveBeenCalledWith("test@test.com", "123456");
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "OTP verified",
      }),
    );
  });
});

describe("AuthController.resetPassword", () => {
  it("should call AuthService.resetPassword and return 200", async () => {
    const req = mockRequest({ body: { resetToken: "reset-token", newPassword: "NewPass123!" } });
    const res = mockResponse();
    const next = jest.fn();

    mockAuthService.resetPassword.mockResolvedValue({ message: "Password reset successful" });

    await AuthController.resetPassword(req, res, next);

    expect(mockAuthService.resetPassword).toHaveBeenCalledWith("reset-token", "NewPass123!");
    expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Password reset successful",
        data: null,
      }),
    );
  });
});
