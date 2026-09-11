import z from "zod";

const registerDto = z.object({
  body: z
    .object({
      email: z.string().trim().email("Invalid email address"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      name: z.string().trim().min(1, "Name is required").max(100),
      role: z.enum(["user", "helper"]).default("user"),
    })
    .strict(),
});

const verifyOtpDto = z.object({
  body: z
    .object({
      email: z.email("Invalid email address"),
      otp: z.string().length(4, "OTP must be 4 digits"),
    })
    .strict(),
});

const resendOtpDto = z.object({
  body: z
    .object({
      email: z.string().trim().email("Invalid email address"),
    })
    .strict(),
});

const loginDto = z.object({
  body: z
    .object({
      email: z.string().trim().email("Invalid email address"),
      password: z.string().min(1, "Password is required"),
    })
    .strict(),
});

const googleLoginDto = z.object({
  body: z
    .object({
      email: z.email("Invalid email address"),
      name: z.string().trim().min(1, "Name is required"),
      googleId: z.string().min(1, "Google ID is required"),
      avatar: z.string().url("Invalid avatar URL").optional(),
      role: z.enum(["user", "helper"]).default("user"),
    })
    .strict(),
});

const refreshTokenDto = z.object({
  body: z
    .object({
      refreshToken: z.string().min(1, "Refresh token is required"),
    })
    .strict(),
});

const forgotPasswordDto = z.object({
  body: z
    .object({
      email: z.email("Invalid email address"),
    })
    .strict(),
});

const verifyResetOtpDto = z.object({
  body: z
    .object({
      email: z.email("Invalid email address"),
      otp: z.string().length(4, "OTP must be 4 digits"),
    })
    .strict(),
});

const resetPasswordDto = z.object({
  body: z
    .object({
      resetToken: z.string().min(1, "Reset token is required"),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
    })
    .strict(),
});

const phoneRegisterDto = z.object({
  body: z
    .object({
      phone: z.string().trim().min(1, "Phone number is required"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      name: z.string().trim().min(1, "Name is required").max(100),
      role: z.enum(["user", "helper"]).default("user"),
    })
    .strict(),
});

const verifyPhoneOtpDto = z.object({
  body: z
    .object({
      phone: z.string().trim().min(1, "Phone number is required"),
      otp: z.string().length(6, "OTP must be 6 digits"),
    })
    .strict(),
});

const resendPhoneOtpDto = z.object({
  body: z
    .object({
      phone: z.string().trim().min(1, "Phone number is required"),
    })
    .strict(),
});

const phoneLoginDto = z.object({
  body: z
    .object({
      phone: z.string().trim().min(1, "Phone number is required"),
      password: z.string().min(1, "Password is required"),
      loginAs: z.enum(["user", "helper"]).optional(),
    })
    .strict(),
});

const forgotPasswordPhoneDto = z.object({
  body: z
    .object({
      phone: z.string().trim().min(1, "Phone number is required"),
    })
    .strict(),
});

const verifyResetOtpPhoneDto = z.object({
  body: z
    .object({
      phone: z.string().trim().min(1, "Phone number is required"),
      otp: z.string().length(6, "OTP must be 6 digits"),
    })
    .strict(),
});

const resetPasswordPhoneDto = z.object({
  body: z
    .object({
      resetToken: z.string().min(1, "Reset token is required"),
      newPassword: z.string().min(6, "Password must be at least 6 characters"),
    })
    .strict(),
});

export const AuthDto = {
  register: registerDto,
  verifyOtp: verifyOtpDto,
  resendOtp: resendOtpDto,
  login: loginDto,
  googleLogin: googleLoginDto,
  refreshToken: refreshTokenDto,
  forgotPassword: forgotPasswordDto,
  verifyResetOtp: verifyResetOtpDto,
  resetPassword: resetPasswordDto,
  // Phone auth
  phoneRegister: phoneRegisterDto,
  verifyPhoneOtp: verifyPhoneOtpDto,
  resendPhoneOtp: resendPhoneOtpDto,
  phoneLogin: phoneLoginDto,
  forgotPasswordPhone: forgotPasswordPhoneDto,
  verifyResetOtpPhone: verifyResetOtpPhoneDto,
  resetPasswordPhone: resetPasswordPhoneDto,
};
