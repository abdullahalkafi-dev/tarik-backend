import config from "@config/index";
import { TCreateAccount, TResetPassword } from "./emailTemplate.type";

const projectName = config.app_name || "Tarik";

const createAccount = (values: TCreateAccount) => {
  return {
    to: values.email,
    subject: `Verify your ${projectName} account`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email Verification</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4a90e2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .otp { font-size: 32px; font-weight: bold; color: #4a90e2; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; letter-spacing: 8px; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ${projectName}</h1>
    </div>
    <div class="content">
      <p>Hi ${values.name},</p>
      <p>Thank you for signing up. Please use the following OTP to verify your email:</p>
      <div class="otp">${values.otp}</div>
      <p>This OTP will expire in 15 minutes.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${projectName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  };
};

const resetPassword = (values: TResetPassword) => {
  return {
    to: values.email,
    subject: `Reset your ${projectName} password`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Password</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #e74c3c; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
    .otp { font-size: 32px; font-weight: bold; color: #e74c3c; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; letter-spacing: 8px; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset</h1>
    </div>
    <div class="content">
      <p>Hi ${values.name},</p>
      <p>You requested a password reset. Please use the following OTP:</p>
      <div class="otp">${values.otp}</div>
      <p>This OTP will expire in ${values.expiresIn || 10} minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${projectName}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
  };
};

const emailTemplate = { createAccount, resetPassword };
export default emailTemplate;
