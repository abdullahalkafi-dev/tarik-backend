import z from "zod";

const passwordRule = z.string().min(8, "Password must be at least 8 characters").max(128);

// E-mail + password login exists for admin / staff only (the mobile apps use the phone flow).
const loginDto = z.object({
  body: z
    .object({
      email: z.string().trim().email("Invalid email address"),
      password: z.string().min(1, "Password is required").max(128),
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

const logoutDto = z.object({
  body: z
    .object({
      refreshToken: z.string().optional(),
    })
    .strict()
    .optional(),
});

const changePasswordDto = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, "Current password is required").max(128),
      newPassword: passwordRule,
    })
    .strict(),
});

const phoneRegisterDto = z.object({
  body: z
    .object({
      phone: z.string().trim().min(1, "Phone number is required"),
      password: passwordRule,
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
      password: z.string().min(1, "Password is required").max(128),
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
      newPassword: passwordRule,
    })
    .strict(),
});

export const AuthDto = {
  login: loginDto,
  refreshToken: refreshTokenDto,
  logout: logoutDto,
  changePassword: changePasswordDto,
  // Phone auth
  phoneRegister: phoneRegisterDto,
  verifyPhoneOtp: verifyPhoneOtpDto,
  resendPhoneOtp: resendPhoneOtpDto,
  phoneLogin: phoneLoginDto,
  forgotPasswordPhone: forgotPasswordPhoneDto,
  verifyResetOtpPhone: verifyResetOtpPhoneDto,
  resetPasswordPhone: resetPasswordPhoneDto,
};
